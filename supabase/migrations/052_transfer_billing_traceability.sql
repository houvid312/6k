-- ============================================================
-- 052: Trazabilidad de facturación y abonos de traslados locales
-- ============================================================

-- 1. Agregar columnas a credit_payments
ALTER TABLE public.credit_payments
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method NOT NULL DEFAULT 'TRANSFERENCIA',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS income_id UUID REFERENCES public.incomes(id) ON DELETE SET NULL;

-- 2. Migrar registros de abonos existentes a partir de sus notas
UPDATE public.credit_payments
SET payment_method = 'EFECTIVO'
WHERE notes ILIKE '%efectivo%';

-- 3. Actualizar políticas de seguridad de credit_entries
DROP POLICY IF EXISTS "credit_entries_policy" ON public.credit_entries;

CREATE POLICY "credit_entries_policy" ON public.credit_entries
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_assigned_local(store_id)
    OR (
      transfer_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM public.transfers t 
        WHERE t.id = transfer_id 
          AND public.is_admin_or_assigned_local(t.from_store_id)
      )
    )
  )
  WITH CHECK (
    public.is_admin_or_assigned_local(store_id)
    OR (
      transfer_id IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM public.transfers t 
        WHERE t.id = transfer_id 
          AND public.is_admin_or_assigned_local(t.from_store_id)
      )
    )
  );

-- 4. Actualizar políticas de seguridad de credit_payments
DROP POLICY IF EXISTS "credit_payments_policy" ON public.credit_payments;

CREATE POLICY "credit_payments_policy" ON public.credit_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.credit_entries ce
      WHERE ce.id = credit_payments.credit_entry_id
        AND (
          public.is_admin_or_assigned_local(ce.store_id)
          OR (
            ce.transfer_id IS NOT NULL 
            AND EXISTS (
              SELECT 1 FROM public.transfers t 
              WHERE t.id = ce.transfer_id 
                AND public.is_admin_or_assigned_local(t.from_store_id)
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.credit_entries ce
      WHERE ce.id = credit_payments.credit_entry_id
        AND (
          public.is_admin_or_assigned_local(ce.store_id)
          OR (
            ce.transfer_id IS NOT NULL 
            AND EXISTS (
              SELECT 1 FROM public.transfers t 
              WHERE t.id = ce.transfer_id 
                AND public.is_admin_or_assigned_local(t.from_store_id)
            )
          )
        )
    )
  );
