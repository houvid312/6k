-- Migration 064: Allow GERENTE & ADMIN_LOCAL to delete sales, and allow VENDEDOR & PREPARADOR roles to perform physical count inventory updates
BEGIN;

-- 1. Eximir a GERENTE y ADMIN_LOCAL de bloqueos de período al eliminar o modificar ventas
CREATE OR REPLACE FUNCTION public.prevent_locked_sales_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  -- Si el usuario conectado es GERENTE o ADMIN_LOCAL, se permite la modificación/eliminación
  IF public.get_user_role() IN ('GERENTE', 'ADMIN_LOCAL') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := (NEW.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := (OLD.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- 2. Permitir a VENDEDOR, PREPARADOR, ADMIN_LOCAL y GERENTE insertar conteos físicos
DROP POLICY IF EXISTS "physical_counts_insert_policy" ON public.physical_counts;
CREATE POLICY "physical_counts_insert_policy" ON public.physical_counts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('GERENTE', 'ADMIN_LOCAL', 'VENDEDOR', 'PREPARADOR', 'RODY')
    OR public.get_worker_role() IN ('CAJERO', 'ADMINISTRADOR', 'COORDINADOR', 'PREPARADOR', 'HORNERO', 'ESTIRADOR')
    OR public.is_admin_or_assigned_local(store_id)
  );

DROP POLICY IF EXISTS "physical_count_items_insert_policy" ON public.physical_count_items;
CREATE POLICY "physical_count_items_insert_policy" ON public.physical_count_items
  FOR INSERT TO authenticated
  WITH CHECK (
    TRUE
  );

-- 3. Actualizar la política de escritura en inventario para permitir a VENDEDOR y PREPARADOR actualizar stock mediante conteos físicos
DROP POLICY IF EXISTS "inventory_write_policy" ON public.inventory;
CREATE POLICY "inventory_write_policy" ON public.inventory
  FOR ALL TO authenticated
  USING (
    public.get_user_role() IN ('GERENTE', 'ADMIN_LOCAL', 'VENDEDOR', 'PREPARADOR')
    OR public.is_admin_or_assigned_local(store_id)
  )
  WITH CHECK (
    public.get_user_role() IN ('GERENTE', 'ADMIN_LOCAL', 'VENDEDOR', 'PREPARADOR')
    OR public.is_admin_or_assigned_local(store_id)
  );

COMMIT;
