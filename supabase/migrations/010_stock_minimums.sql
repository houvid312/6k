-- ============================================================
-- 010: Stock Minimums - Parametrizable minimum stock levels
-- ============================================================

CREATE TABLE stock_minimums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  level inventory_level NOT NULL DEFAULT 'STORE',
  minimum_grams NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(supply_id, store_id, level)
);

CREATE INDEX idx_stock_minimums_store_level ON stock_minimums(store_id, level);

ALTER TABLE stock_minimums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read stock_minimums" ON stock_minimums FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage stock_minimums" ON stock_minimums FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
