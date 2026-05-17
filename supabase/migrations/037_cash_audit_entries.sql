-- ============================================================
-- 037: Manual cash audit entries
-- Stores daily cash balance snapshots by cost center.
-- These are point-in-time balances, not additive period income.
-- ============================================================

CREATE TABLE IF NOT EXISTS cash_audit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date DATE NOT NULL,
  opening_base INTEGER NOT NULL DEFAULT 0,
  cash_sales INTEGER NOT NULL DEFAULT 0,
  cash_expenses INTEGER NOT NULL DEFAULT 0,
  theoretical_total INTEGER NOT NULL DEFAULT 0,
  actual_total INTEGER NOT NULL DEFAULT 0,
  discrepancy INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_cash_audit_entries_store_date
  ON cash_audit_entries(store_id, date);

CREATE OR REPLACE FUNCTION set_cash_audit_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_audit_updated_at ON cash_audit_entries;
CREATE TRIGGER trg_cash_audit_updated_at
  BEFORE UPDATE ON cash_audit_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_cash_audit_updated_at();

ALTER TABLE cash_audit_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read cash_audit_entries" ON cash_audit_entries;
CREATE POLICY "Authenticated read cash_audit_entries"
  ON cash_audit_entries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated manage cash_audit_entries" ON cash_audit_entries;
CREATE POLICY "Authenticated manage cash_audit_entries"
  ON cash_audit_entries FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
