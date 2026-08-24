-- Migration 085: Sincronizar payment_method en incomes vinculados a credit_payments
BEGIN;

UPDATE public.incomes inc
SET payment_method = cp.payment_method,
    description = REPLACE(inc.description, ' - Manual', ' - Transferencia / Bancos')
FROM public.credit_payments cp
WHERE cp.income_id = inc.id
  AND cp.payment_method = 'TRANSFERENCIA'
  AND inc.payment_method = 'EFECTIVO';

COMMIT;
