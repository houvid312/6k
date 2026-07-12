-- 047_fix_reserved_keyword_rls.sql
-- Corrige un conflicto crítico de palabra reservada en la función is_admin_or_assigned_local.
-- La variable local 'current_role' colisionaba con la palabra clave reservada del sistema CURRENT_ROLE (que retorna 'postgres'),
-- lo que causaba que la función fallara y retornara FALSE para todos los usuarios.

CREATE OR REPLACE FUNCTION public.is_admin_or_assigned_local(target_store_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role user_role;
  v_worker_id UUID;
BEGIN
  -- 1. Obtener rol y id del trabajador autenticado (usando variables no reservadas)
  SELECT w.user_role, w.id INTO v_user_role, v_worker_id
  FROM public.workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;

  -- 2. Si es Gerente (CEO), tiene acceso completo
  IF v_user_role = 'GERENTE' THEN
    RETURN TRUE;
  END IF;

  -- 3. Si es Admin Local o Vendedor, verificar asignación
  IF v_user_role IN ('ADMIN_LOCAL', 'VENDEDOR') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.worker_store_assignments
      WHERE worker_id = v_worker_id
        AND store_id = target_store_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
