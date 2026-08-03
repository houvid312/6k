-- Migration 060: Fix inventory_adjustments foreign key constraint and RLS policies
-- Corrige el error al guardar ajustes de inventario eliminando la restricción FK a auth.users
-- Y asegurando permisos completos de actualización en la tabla inventory e inserción en inventory_adjustments.

BEGIN;

-- 1. Eliminar restricción de clave foránea a auth.users si existe
ALTER TABLE public.inventory_adjustments
  DROP CONSTRAINT IF EXISTS inventory_adjustments_user_id_fkey;

-- 2. Actualizar políticas RLS para public.inventory_adjustments
DROP POLICY IF EXISTS "Authenticated read inventory_adjustments" ON public.inventory_adjustments;
DROP POLICY IF EXISTS "Gerente insert inventory_adjustments" ON public.inventory_adjustments;
DROP POLICY IF EXISTS "inventory_adjustments_select_policy" ON public.inventory_adjustments;
DROP POLICY IF EXISTS "inventory_adjustments_write_policy" ON public.inventory_adjustments;

CREATE POLICY "inventory_adjustments_select_policy" ON public.inventory_adjustments
  FOR SELECT TO public USING (true);

CREATE POLICY "inventory_adjustments_write_policy" ON public.inventory_adjustments
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- 3. Actualizar políticas RLS para public.inventory
DROP POLICY IF EXISTS "Admin manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Authenticated read inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_write_policy" ON public.inventory;

CREATE POLICY "inventory_select_policy" ON public.inventory
  FOR SELECT TO public USING (true);

CREATE POLICY "inventory_write_policy" ON public.inventory
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

COMMIT;
