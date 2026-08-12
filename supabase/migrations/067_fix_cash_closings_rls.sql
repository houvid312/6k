-- Migration 067: Ensure cash_closings can be inserted and updated by all authenticated roles (including VENDEDOR)
BEGIN;

ALTER TABLE public.cash_closings DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Authenticated read cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Authenticated insert cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Authenticated update cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_policy" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_select_policy" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_write_policy" ON public.cash_closings;

CREATE POLICY "cash_closings_select_policy" ON public.cash_closings FOR SELECT TO public USING (true);
CREATE POLICY "cash_closings_write_policy" ON public.cash_closings FOR ALL TO public USING (true) WITH CHECK (true);

COMMIT;
