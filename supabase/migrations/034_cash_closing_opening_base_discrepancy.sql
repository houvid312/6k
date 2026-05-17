-- Corrige cierres no bloqueados para que la discrepancia descuente la base de apertura.
-- Formula: total contado + transferencias - base apertura - (ventas esperadas - gastos).

UPDATE cash_closings AS cc
SET discrepancy = COALESCE(cc.actual_total, 0)
  - COALESCE(co.total, 0)
  - (COALESCE(cc.expected_total, 0) - COALESCE(cc.expenses, 0))
FROM cash_openings AS co
WHERE cc.store_id = co.store_id
  AND cc.date::text = co.date
  AND cc.status IN ('DRAFT', 'CONFIRMED');
