-- Migration 065: Ensure SELECT, INSERT and ALL operations on physical_counts, physical_count_items, and inventory are allowed for all authenticated users/roles
BEGIN;

-- 1. Políticas RLS para SELECT e INSERT en physical_counts
DROP POLICY IF EXISTS "Authenticated read physical_counts" ON public.physical_counts;
DROP POLICY IF EXISTS "physical_counts_select_policy" ON public.physical_counts;
DROP POLICY IF EXISTS "physical_counts_insert_policy" ON public.physical_counts;

CREATE POLICY "physical_counts_select_policy" ON public.physical_counts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "physical_counts_insert_policy" ON public.physical_counts
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Políticas RLS para SELECT e INSERT en physical_count_items
DROP POLICY IF EXISTS "Authenticated read physical_count_items" ON public.physical_count_items;
DROP POLICY IF EXISTS "physical_count_items_select_policy" ON public.physical_count_items;
DROP POLICY IF EXISTS "physical_count_items_insert_policy" ON public.physical_count_items;

CREATE POLICY "physical_count_items_select_policy" ON public.physical_count_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "physical_count_items_insert_policy" ON public.physical_count_items
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Políticas RLS para SELECT y WRITE (INSERT/UPDATE) en inventory
DROP POLICY IF EXISTS "Authenticated read inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_write_policy" ON public.inventory;

CREATE POLICY "inventory_select_policy" ON public.inventory
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_write_policy" ON public.inventory
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
