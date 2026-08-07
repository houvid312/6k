-- Migration 062: Fix RLS policies for expenses, workers, customers store assignment and privilege escalation guard
BEGIN;

-- 1. Actualizar función helper is_admin_or_assigned_local para contemplar sede primaria w.store_id y worker_store_assignments
CREATE OR REPLACE FUNCTION public.is_admin_or_assigned_local(target_store_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role user_role;
  v_worker_id UUID;
  v_primary_store UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT w.user_role, w.id, w.store_id INTO v_user_role, v_worker_id, v_primary_store
  FROM public.workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_user_role IS NULL OR v_user_role IN ('GERENTE', 'RODY') THEN
    RETURN TRUE;
  END IF;

  IF v_user_role IN ('ADMIN_LOCAL', 'VENDEDOR', 'PREPARADOR') THEN
    IF v_primary_store = target_store_id THEN
      RETURN TRUE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.worker_store_assignments
      WHERE worker_id = v_worker_id
        AND store_id = target_store_id
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Permitir a la tabla de clientes (customers) asociarse opcionalmente a una sede
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- 3. Actualizar políticas RLS de workers
DROP POLICY IF EXISTS "workers_write_policy" ON public.workers;

CREATE POLICY "workers_write_policy" ON public.workers
  FOR ALL TO public
  USING (
    auth.uid() IS NULL OR
    public.get_user_role() IN ('GERENTE', 'RODY') OR
    (public.get_user_role() = 'ADMIN_LOCAL' AND (
      workers.store_id IN (
        SELECT wsa.store_id FROM public.worker_store_assignments wsa
        WHERE wsa.worker_id = public.get_auth_worker_id()
        UNION
        SELECT w.store_id FROM public.workers w WHERE w.id = public.get_auth_worker_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.worker_store_assignments wsa_target
        WHERE wsa_target.worker_id = workers.id
          AND wsa_target.store_id IN (
            SELECT wsa.store_id FROM public.worker_store_assignments wsa
            WHERE wsa.worker_id = public.get_auth_worker_id()
            UNION
            SELECT w.store_id FROM public.workers w WHERE w.id = public.get_auth_worker_id()
          )
      )
    ))
  )
  WITH CHECK (
    auth.uid() IS NULL OR
    public.get_user_role() IN ('GERENTE', 'RODY') OR
    (public.get_user_role() = 'ADMIN_LOCAL' AND (
      workers.store_id IN (
        SELECT wsa.store_id FROM public.worker_store_assignments wsa
        WHERE wsa.worker_id = public.get_auth_worker_id()
        UNION
        SELECT w.store_id FROM public.workers w WHERE w.id = public.get_auth_worker_id()
      )
      OR NOT EXISTS (SELECT 1 FROM public.workers WHERE id = workers.id) -- para inserción de nuevos
    ))
  );

-- 4. Trigger de seguridad para evitar escalado de privilegios de ADMIN_LOCAL a GERENTE
CREATE OR REPLACE FUNCTION public.prevent_admin_local_gerente_escalation()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_role user_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_role := public.get_user_role();

  IF v_caller_role = 'ADMIN_LOCAL' THEN
    IF NEW.user_role = 'GERENTE' THEN
      RAISE EXCEPTION 'Un Administrador Local no tiene privilegios para asignar o promover al rol GERENTE.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_admin_local_gerente_escalation ON public.workers;
CREATE TRIGGER trg_prevent_admin_local_gerente_escalation
  BEFORE INSERT OR UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_local_gerente_escalation();

COMMIT;
