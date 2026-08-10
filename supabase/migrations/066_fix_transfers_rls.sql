-- Migration 066: Ensure RODY, PREPARADOR, GERENTE, and ADMIN_LOCAL can SELECT and manage transfers and transfer_items
BEGIN;

-- 1. Políticas RLS para public.transfers
ALTER TABLE public.transfers DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage transfers" ON public.transfers;
DROP POLICY IF EXISTS "Authenticated read transfers" ON public.transfers;
DROP POLICY IF EXISTS "Transfer operators manage transfers" ON public.transfers;
DROP POLICY IF EXISTS "transfers_policy" ON public.transfers;
DROP POLICY IF EXISTS "transfers_select_policy" ON public.transfers;
DROP POLICY IF EXISTS "transfers_write_policy" ON public.transfers;

CREATE POLICY "transfers_select_policy" ON public.transfers FOR SELECT TO public USING (true);
CREATE POLICY "transfers_write_policy" ON public.transfers FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Políticas RLS para public.transfer_items
ALTER TABLE public.transfer_items DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage transfer_items" ON public.transfer_items;
DROP POLICY IF EXISTS "Authenticated read transfer_items" ON public.transfer_items;
DROP POLICY IF EXISTS "transfer_items_policy" ON public.transfer_items;
DROP POLICY IF EXISTS "transfer_items_select_policy" ON public.transfer_items;
DROP POLICY IF EXISTS "transfer_items_write_policy" ON public.transfer_items;

CREATE POLICY "transfer_items_select_policy" ON public.transfer_items FOR SELECT TO public USING (true);
CREATE POLICY "transfer_items_write_policy" ON public.transfer_items FOR ALL TO public USING (true) WITH CHECK (true);

COMMIT;
