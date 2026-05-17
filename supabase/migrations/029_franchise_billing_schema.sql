-- ============================================================
-- 029: Franchise internal billing schema
-- Adds commercial pricing for supplies, transfer billing snapshots,
-- and store-linked receivables for internal franchise charges.
-- ============================================================

ALTER TYPE debtor_type ADD VALUE IF NOT EXISTS 'LOCAL';

-- Commercial metadata for supplies. The production cost is internal-only and
-- must not be exposed in store-facing operational screens.
ALTER TABLE supplies
  ADD COLUMN IF NOT EXISTS production_cost_cop NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_price_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_billable_to_store BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE transfer_items
  ADD COLUMN IF NOT EXISTS grams_per_bag_snapshot NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_cost_cop_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS unit_price_cop_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS total_cost_cop_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_price_cop_snapshot INTEGER;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS total_cost_cop NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_entry_id UUID;

ALTER TABLE credit_entries
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES transfers(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transfers_credit_entry_id_fkey'
  ) THEN
    ALTER TABLE transfers
      ADD CONSTRAINT transfers_credit_entry_id_fkey
      FOREIGN KEY (credit_entry_id) REFERENCES credit_entries(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_entries_transfer_id_unique
  ON credit_entries(transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_entries_store_status
  ON credit_entries(store_id, is_paid)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_credit_entry_id
  ON transfers(credit_entry_id)
  WHERE credit_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_non_admin_supply_commercial_update()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(get_user_role() = 'ADMIN', false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.production_cost_cop, 0) <> 0
       OR COALESCE(NEW.commercial_price_cop, 0) <> 0
       OR COALESCE(NEW.is_billable_to_store, true) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Only admins can set supply commercial billing fields';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.production_cost_cop IS DISTINCT FROM OLD.production_cost_cop
       OR NEW.commercial_price_cop IS DISTINCT FROM OLD.commercial_price_cop
       OR NEW.is_billable_to_store IS DISTINCT FROM OLD.is_billable_to_store THEN
      RAISE EXCEPTION 'Only admins can update supply commercial billing fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_non_admin_supply_commercial_update ON supplies;
CREATE TRIGGER trg_prevent_non_admin_supply_commercial_update
  BEFORE INSERT OR UPDATE ON supplies
  FOR EACH ROW
  EXECUTE FUNCTION prevent_non_admin_supply_commercial_update();
