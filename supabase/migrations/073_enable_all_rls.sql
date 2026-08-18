-- Migration 073: Asegurar RLS y politicas correctas para rol VENDEDOR y ADMIN_LOCAL
BEGIN;

-- 1. Habilitar RLS en todas las tablas del esquema public
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(tbl.tablename) || ' ENABLE ROW LEVEL SECURITY;';
  END LOOP;
END $$;

-- 2. Asegurar politicas de TRASLADOS para Vendedor, Admin Local y Gerente
DROP POLICY IF EXISTS "transfers_policy" ON public.transfers;
DROP POLICY IF EXISTS "Admin manage transfers" ON public.transfers;
DROP POLICY IF EXISTS "Authenticated read transfers" ON public.transfers;
CREATE POLICY "transfers_policy" ON public.transfers
  FOR ALL TO authenticated
  USING (can_access_transfer(from_store_id, to_store_id))
  WITH CHECK (can_access_transfer(from_store_id, to_store_id));

DROP POLICY IF EXISTS "transfer_items_policy" ON public.transfer_items;
DROP POLICY IF EXISTS "Admin manage transfer_items" ON public.transfer_items;
DROP POLICY IF EXISTS "Authenticated read transfer_items" ON public.transfer_items;
CREATE POLICY "transfer_items_policy" ON public.transfer_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.transfers t
    WHERE t.id = transfer_items.transfer_id
      AND can_access_transfer(t.from_store_id, t.to_store_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transfers t
    WHERE t.id = transfer_items.transfer_id
      AND can_access_transfer(t.from_store_id, t.to_store_id)
  ));

-- 3. Asegurar politicas de CIERRES DE CAJA para Vendedor, Admin Local y Gerente
DROP POLICY IF EXISTS "cash_closings_policy" ON public.cash_closings;
DROP POLICY IF EXISTS "Admin manage cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Authenticated read cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Authenticated insert cash_closings" ON public.cash_closings;
CREATE POLICY "cash_closings_policy" ON public.cash_closings
  FOR ALL TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

-- 4. Asegurar politicas de CONTEOS FISICOS para Vendedor, Admin Local y Gerente
DROP POLICY IF EXISTS "physical_counts_policy" ON public.physical_counts;
DROP POLICY IF EXISTS "Admin manage physical_counts" ON public.physical_counts;
DROP POLICY IF EXISTS "Authenticated read physical_counts" ON public.physical_counts;
CREATE POLICY "physical_counts_policy" ON public.physical_counts
  FOR ALL TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

DROP POLICY IF EXISTS "physical_count_items_policy" ON public.physical_count_items;
DROP POLICY IF EXISTS "Admin manage physical_count_items" ON public.physical_count_items;
DROP POLICY IF EXISTS "Authenticated read physical_count_items" ON public.physical_count_items;
CREATE POLICY "physical_count_items_policy" ON public.physical_count_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.physical_counts pc
    WHERE pc.id = physical_count_items.physical_count_id
      AND is_admin_or_assigned_local(pc.store_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.physical_counts pc
    WHERE pc.id = physical_count_items.physical_count_id
      AND is_admin_or_assigned_local(pc.store_id)
  ));

COMMIT;
