-- Migration 065: Disable RLS restriction and grant public access to physical_counts, physical_count_items, and inventory
BEGIN;

-- 1. Deshabilitar RLS y limpiar políticas de public.physical_counts
ALTER TABLE public.physical_counts DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read physical_counts" ON public.physical_counts;
DROP POLICY IF EXISTS "Authenticated insert physical_counts" ON public.physical_counts;
DROP POLICY IF EXISTS "Admin manage physical_counts" ON public.physical_counts;
DROP POLICY IF EXISTS "Admin delete physical_counts" ON public.physical_counts;
DROP POLICY IF EXISTS "Count operators insert physical_counts" ON public.physical_counts;
DROP POLICY IF EXISTS "physical_counts_select_policy" ON public.physical_counts;
DROP POLICY IF EXISTS "physical_counts_insert_policy" ON public.physical_counts;
DROP POLICY IF EXISTS "physical_counts_update_policy" ON public.physical_counts;
DROP POLICY IF EXISTS "physical_counts_delete_policy" ON public.physical_counts;

CREATE POLICY "physical_counts_select_policy" ON public.physical_counts FOR SELECT TO public USING (true);
CREATE POLICY "physical_counts_insert_policy" ON public.physical_counts FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "physical_counts_update_policy" ON public.physical_counts FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "physical_counts_delete_policy" ON public.physical_counts FOR DELETE TO public USING (true);

-- 2. Deshabilitar RLS y limpiar políticas de public.physical_count_items
ALTER TABLE public.physical_count_items DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read physical_count_items" ON public.physical_count_items;
DROP POLICY IF EXISTS "Authenticated insert physical_count_items" ON public.physical_count_items;
DROP POLICY IF EXISTS "Admin manage physical_count_items" ON public.physical_count_items;
DROP POLICY IF EXISTS "Admin delete physical_count_items" ON public.physical_count_items;
DROP POLICY IF EXISTS "Count operators insert physical_count_items" ON public.physical_count_items;
DROP POLICY IF EXISTS "physical_count_items_select_policy" ON public.physical_count_items;
DROP POLICY IF EXISTS "physical_count_items_insert_policy" ON public.physical_count_items;
DROP POLICY IF EXISTS "physical_count_items_update_policy" ON public.physical_count_items;
DROP POLICY IF EXISTS "physical_count_items_delete_policy" ON public.physical_count_items;

CREATE POLICY "physical_count_items_select_policy" ON public.physical_count_items FOR SELECT TO public USING (true);
CREATE POLICY "physical_count_items_insert_policy" ON public.physical_count_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "physical_count_items_update_policy" ON public.physical_count_items FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "physical_count_items_delete_policy" ON public.physical_count_items FOR DELETE TO public USING (true);

-- 3. Limpiar y flexibilizar políticas RLS para public.inventory
DROP POLICY IF EXISTS "Authenticated read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Admin manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Inventory operators manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_write_policy" ON public.inventory;

CREATE POLICY "inventory_select_policy" ON public.inventory FOR SELECT TO public USING (true);
CREATE POLICY "inventory_write_policy" ON public.inventory FOR ALL TO public USING (true) WITH CHECK (true);

COMMIT;
