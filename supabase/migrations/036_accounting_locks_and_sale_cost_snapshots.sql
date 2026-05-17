-- ============================================================
-- 036: Accounting locks and sale cost snapshots
-- - Stores historical inventory cost per sale and sale item.
-- - Creates cost-center period locks from cash closings.
-- - Blocks operational edits inside locked periods.
-- ============================================================

-- ==================== SALE COST SNAPSHOTS ====================

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS total_cost_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_margin_cop INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS recipe_cost_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additions_cost_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_cost_cop INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_cop INTEGER NOT NULL DEFAULT 0;

WITH item_costs AS (
  SELECT
    si.id,
    COALESCE((
      SELECT SUM(
        (ri.grams_per_portion * si.portions / NULLIF(s.grams_per_bag, 0))
        * CASE WHEN COALESCE(s.is_billable_to_store, true) THEN COALESCE(s.commercial_price_cop, 0) ELSE 0 END
      )
      FROM recipes r
      JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      JOIN supplies s ON s.id = ri.supply_id
      WHERE r.product_id = si.product_id
    ), 0) AS recipe_cost,
    COALESCE((
      SELECT SUM(
        (sia.grams * sia.quantity / NULLIF(s.grams_per_bag, 0))
        * CASE WHEN COALESCE(s.is_billable_to_store, true) THEN COALESCE(s.commercial_price_cop, 0) ELSE 0 END
      )
      FROM sale_item_additions sia
      JOIN supplies s ON s.id = sia.supply_id
      WHERE sia.sale_item_id = si.id
    ), 0) AS additions_cost,
    COALESCE((
      SELECT
        (COALESCE(si.packaging_quantity, 0) / NULLIF(s.grams_per_bag, 0))
        * CASE WHEN COALESCE(s.is_billable_to_store, true) THEN COALESCE(s.commercial_price_cop, 0) ELSE 0 END
      FROM supplies s
      WHERE s.id = si.packaging_supply_id
    ), 0) AS packaging_cost
  FROM sale_items si
)
UPDATE sale_items si
SET
  recipe_cost_cop = ROUND(item_costs.recipe_cost)::INTEGER,
  additions_cost_cop = ROUND(item_costs.additions_cost)::INTEGER,
  packaging_cost_cop = ROUND(item_costs.packaging_cost)::INTEGER,
  total_cost_cop = ROUND(item_costs.recipe_cost + item_costs.additions_cost + item_costs.packaging_cost)::INTEGER
FROM item_costs
WHERE item_costs.id = si.id
  AND COALESCE(si.total_cost_cop, 0) = 0;

WITH sale_costs AS (
  SELECT
    sale_id,
    COALESCE(SUM(total_cost_cop), 0)::INTEGER AS total_cost
  FROM sale_items
  GROUP BY sale_id
)
UPDATE sales s
SET
  total_cost_cop = sale_costs.total_cost,
  gross_margin_cop = s.total_amount - sale_costs.total_cost
FROM sale_costs
WHERE sale_costs.sale_id = s.id
  AND COALESCE(s.total_cost_cop, 0) = 0;

UPDATE sales
SET gross_margin_cop = total_amount - total_cost_cop
WHERE COALESCE(gross_margin_cop, 0) = 0
  AND COALESCE(total_cost_cop, 0) > 0;

-- ==================== PERIOD LOCKS ====================

CREATE TABLE IF NOT EXISTS accounting_period_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  period_type TEXT NOT NULL CHECK (period_type IN ('DAY', 'MONTH')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  source_cash_closing_id UUID REFERENCES cash_closings(id) ON DELETE SET NULL,
  locked_by_worker_id UUID REFERENCES workers(id),
  reason TEXT NOT NULL DEFAULT '',
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_period_locks_valid_range CHECK (start_date <= end_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_period_locks_unique
  ON accounting_period_locks(store_id, period_type, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_accounting_period_locks_lookup
  ON accounting_period_locks(store_id, start_date, end_date);

ALTER TABLE accounting_period_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read accounting_period_locks" ON accounting_period_locks;
CREATE POLICY "Authenticated read accounting_period_locks"
  ON accounting_period_locks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage accounting_period_locks" ON accounting_period_locks;
CREATE POLICY "Admin manage accounting_period_locks"
  ON accounting_period_locks FOR ALL TO authenticated
  USING (get_user_role() = 'ADMIN')
  WITH CHECK (get_user_role() = 'ADMIN');

CREATE OR REPLACE FUNCTION is_accounting_period_locked(
  p_store_id UUID,
  p_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM accounting_period_locks apl
    WHERE apl.store_id = p_store_id
      AND p_date BETWEEN apl.start_date AND apl.end_date
  );
$$;

GRANT EXECUTE ON FUNCTION is_accounting_period_locked(UUID, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION raise_locked_period_error()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Periodo contable bloqueado para este centro de costo. Reabre el cierre o registra un ajuste posterior.';
END;
$$;

CREATE OR REPLACE FUNCTION sync_cash_closing_accounting_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id UUID;
  v_reason TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM accounting_period_locks
    WHERE source_cash_closing_id = OLD.id;
    RETURN OLD;
  END IF;

  DELETE FROM accounting_period_locks
  WHERE source_cash_closing_id = NEW.id;

  IF NEW.status IN ('CONFIRMED', 'APPROVED') THEN
    v_worker_id := COALESCE(NEW.approved_by_worker_id, NEW.confirmed_by_worker_id);
    v_reason := CASE
      WHEN NEW.status = 'APPROVED' THEN 'Cierre de caja aprobado'
      ELSE 'Cierre de caja confirmado'
    END;

    INSERT INTO accounting_period_locks (
      store_id,
      period_type,
      start_date,
      end_date,
      source_cash_closing_id,
      locked_by_worker_id,
      reason,
      locked_at
    )
    VALUES (
      NEW.store_id,
      'DAY',
      NEW.date,
      NEW.date,
      NEW.id,
      v_worker_id,
      v_reason,
      now()
    )
    ON CONFLICT (store_id, period_type, start_date, end_date)
    DO UPDATE SET
      source_cash_closing_id = EXCLUDED.source_cash_closing_id,
      locked_by_worker_id = EXCLUDED.locked_by_worker_id,
      reason = EXCLUDED.reason,
      locked_at = EXCLUDED.locked_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cash_closing_accounting_lock ON cash_closings;
CREATE TRIGGER trg_sync_cash_closing_accounting_lock
  AFTER INSERT OR UPDATE OR DELETE ON cash_closings
  FOR EACH ROW
  EXECUTE FUNCTION sync_cash_closing_accounting_lock();

INSERT INTO accounting_period_locks (
  store_id,
  period_type,
  start_date,
  end_date,
  source_cash_closing_id,
  locked_by_worker_id,
  reason,
  locked_at
)
SELECT
  cc.store_id,
  'DAY',
  cc.date,
  cc.date,
  cc.id,
  COALESCE(cc.approved_by_worker_id, cc.confirmed_by_worker_id),
  CASE
    WHEN cc.status = 'APPROVED' THEN 'Cierre de caja aprobado'
    ELSE 'Cierre de caja confirmado'
  END,
  now()
FROM cash_closings cc
WHERE cc.status IN ('CONFIRMED', 'APPROVED')
ON CONFLICT (store_id, period_type, start_date, end_date)
DO UPDATE SET
  source_cash_closing_id = EXCLUDED.source_cash_closing_id,
  locked_by_worker_id = EXCLUDED.locked_by_worker_id,
  reason = EXCLUDED.reason,
  locked_at = EXCLUDED.locked_at;

-- ==================== OPERATIONAL LOCK GUARDS ====================

CREATE OR REPLACE FUNCTION prevent_locked_sales_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := (NEW.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := (OLD.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_sales_write ON sales;
CREATE TRIGGER trg_prevent_locked_sales_write
  BEFORE INSERT OR UPDATE OR DELETE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_sales_write();

CREATE OR REPLACE FUNCTION prevent_locked_sale_items_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_store_id UUID;
  v_sale_date DATE;
BEGIN
  v_sale_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;

  SELECT store_id, (created_at AT TIME ZONE 'America/Bogota')::DATE
  INTO v_store_id, v_sale_date
  FROM sales
  WHERE id = v_sale_id;

  IF v_store_id IS NOT NULL AND is_accounting_period_locked(v_store_id, v_sale_date) THEN
    PERFORM raise_locked_period_error();
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_sale_items_write ON sale_items;
CREATE TRIGGER trg_prevent_locked_sale_items_write
  BEFORE INSERT OR UPDATE OR DELETE ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_sale_items_write();

CREATE OR REPLACE FUNCTION prevent_locked_expenses_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND is_accounting_period_locked(NEW.store_id, NEW.date) THEN
    PERFORM raise_locked_period_error();
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND is_accounting_period_locked(OLD.store_id, OLD.date) THEN
    PERFORM raise_locked_period_error();
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_expenses_write ON expenses;
CREATE TRIGGER trg_prevent_locked_expenses_write
  BEFORE INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_expenses_write();

CREATE OR REPLACE FUNCTION prevent_locked_purchases_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := (NEW.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := (OLD.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_purchases_write ON purchases;
CREATE TRIGGER trg_prevent_locked_purchases_write
  BEFORE INSERT OR UPDATE OR DELETE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_purchases_write();

CREATE OR REPLACE FUNCTION transfer_accounting_date(p_transfer transfers)
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (p_transfer.received_at AT TIME ZONE 'America/Bogota')::DATE,
    p_transfer.shipping_date,
    p_transfer.order_date,
    (p_transfer.created_at AT TIME ZONE 'America/Bogota')::DATE
  );
$$;

CREATE OR REPLACE FUNCTION prevent_locked_transfers_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := transfer_accounting_date(NEW);
    IF is_accounting_period_locked(NEW.from_store_id, v_new_date)
       OR is_accounting_period_locked(NEW.to_store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.status = 'RECEIVED') THEN
    v_old_date := transfer_accounting_date(OLD);
    IF is_accounting_period_locked(OLD.from_store_id, v_old_date)
       OR is_accounting_period_locked(OLD.to_store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_transfers_write ON transfers;
CREATE TRIGGER trg_prevent_locked_transfers_write
  BEFORE INSERT OR UPDATE OR DELETE ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_transfers_write();

CREATE OR REPLACE FUNCTION prevent_locked_writeoffs_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := (COALESCE(OLD.reviewed_at, OLD.created_at) AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_writeoffs_write ON inventory_writeoffs;
CREATE TRIGGER trg_prevent_locked_writeoffs_write
  BEFORE INSERT OR UPDATE OR DELETE ON inventory_writeoffs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_writeoffs_write();

CREATE OR REPLACE FUNCTION prevent_locked_cash_openings_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := NEW.date::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := OLD.date::DATE;
    IF is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_cash_openings_write ON cash_openings;
CREATE TRIGGER trg_prevent_locked_cash_openings_write
  BEFORE INSERT OR UPDATE OR DELETE ON cash_openings
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_cash_openings_write();

-- ==================== EDIT PENDING SALES RPC WITH COST SNAPSHOTS ====================

CREATE OR REPLACE FUNCTION replace_pending_sale_order(
  p_sale_id UUID,
  p_payment_method payment_method,
  p_total_portions INTEGER,
  p_total_amount INTEGER,
  p_packaging_total INTEGER,
  p_cash_amount INTEGER,
  p_bank_amount INTEGER,
  p_observations TEXT,
  p_is_paid BOOLEAN,
  p_customer_note TEXT,
  p_packaging_supply_id UUID,
  p_total_cost_cop INTEGER,
  p_gross_margin_cop INTEGER,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item RECORD;
  v_addition RECORD;
  v_recipe_id UUID;
  v_ingredient RECORD;
  v_sale_item_id UUID;
  v_additions JSONB;
  v_had_item_packaging BOOLEAN;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale % must have at least one item', p_sale_id;
  END IF;

  SELECT *
  INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;

  IF is_accounting_period_locked(v_sale.store_id, (v_sale.created_at AT TIME ZONE 'America/Bogota')::DATE) THEN
    PERFORM raise_locked_period_error();
  END IF;

  IF COALESCE(v_sale.is_dispatched, false) THEN
    RAISE EXCEPTION 'Sale % cannot be edited after dispatch', p_sale_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM sale_items
    WHERE sale_id = p_sale_id
      AND packaging_supply_id IS NOT NULL
      AND COALESCE(packaging_quantity, 0) > 0
  )
  INTO v_had_item_packaging;

  FOR v_item IN
    SELECT *
    FROM sale_items
    WHERE sale_id = p_sale_id
  LOOP
    SELECT r.id
    INTO v_recipe_id
    FROM recipes r
    WHERE r.product_id = v_item.product_id;

    IF v_recipe_id IS NOT NULL THEN
      FOR v_ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = v_recipe_id
      LOOP
        PERFORM deduct_store_inventory(
          v_sale.store_id,
          v_ingredient.supply_id,
          -(v_ingredient.grams_per_portion * v_item.portions)
        );
      END LOOP;
    END IF;

    FOR v_addition IN
      SELECT sia.supply_id, sia.grams, sia.quantity
      FROM sale_item_additions sia
      WHERE sia.sale_item_id = v_item.id
    LOOP
      PERFORM deduct_store_inventory(
        v_sale.store_id,
        v_addition.supply_id,
        -(v_addition.grams * v_addition.quantity)
      );
    END LOOP;

    IF v_item.packaging_supply_id IS NOT NULL AND COALESCE(v_item.packaging_quantity, 0) > 0 THEN
      PERFORM deduct_store_inventory(
        v_sale.store_id,
        v_item.packaging_supply_id,
        -v_item.packaging_quantity
      );
    END IF;
  END LOOP;

  IF v_sale.packaging_supply_id IS NOT NULL AND NOT COALESCE(v_had_item_packaging, false) THEN
    PERFORM deduct_store_inventory(v_sale.store_id, v_sale.packaging_supply_id, -1);
  END IF;

  DELETE FROM sale_item_additions
  WHERE sale_item_id IN (
    SELECT id FROM sale_items WHERE sale_id = p_sale_id
  );

  DELETE FROM sale_items
  WHERE sale_id = p_sale_id;

  UPDATE sales
  SET
    payment_method = p_payment_method,
    total_portions = p_total_portions,
    total_amount = p_total_amount,
    packaging_total = COALESCE(p_packaging_total, 0),
    total_cost_cop = COALESCE(p_total_cost_cop, 0),
    gross_margin_cop = COALESCE(p_gross_margin_cop, p_total_amount - COALESCE(p_total_cost_cop, 0)),
    cash_amount = p_cash_amount,
    bank_amount = p_bank_amount,
    observations = COALESCE(p_observations, ''),
    is_paid = COALESCE(p_is_paid, false),
    customer_note = NULLIF(COALESCE(p_customer_note, ''), ''),
    packaging_supply_id = p_packaging_supply_id
  WHERE id = p_sale_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id,
      product_id,
      size,
      format_id,
      format_name,
      quantity,
      portions,
      unit_price,
      subtotal,
      additions_total,
      packaging_supply_id,
      packaging_label,
      packaging_unit_price,
      packaging_quantity,
      packaging_total,
      recipe_cost_cop,
      additions_cost_cop,
      packaging_cost_cop,
      total_cost_cop
    )
    VALUES (
      p_sale_id,
      (v_item.value->>'product_id')::UUID,
      CASE
        WHEN NULLIF(v_item.value->>'size', '') IS NULL THEN NULL
        ELSE (v_item.value->>'size')::pizza_size
      END,
      NULLIF(v_item.value->>'format_id', '')::UUID,
      NULLIF(COALESCE(v_item.value->>'format_name', ''), ''),
      COALESCE(NULLIF(v_item.value->>'quantity', '')::INTEGER, 1),
      COALESCE(NULLIF(v_item.value->>'portions', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'unit_price', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'subtotal', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'additions_total', '')::INTEGER, 0),
      NULLIF(v_item.value->>'packaging_supply_id', '')::UUID,
      NULLIF(COALESCE(v_item.value->>'packaging_label', ''), ''),
      COALESCE(NULLIF(v_item.value->>'packaging_unit_price', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'packaging_quantity', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'packaging_total', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'recipe_cost_cop', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'additions_cost_cop', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'packaging_cost_cop', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'total_cost_cop', '')::INTEGER, 0)
    )
    RETURNING id INTO v_sale_item_id;

    v_additions := CASE
      WHEN jsonb_typeof(v_item.value->'additions') = 'array' THEN v_item.value->'additions'
      ELSE '[]'::jsonb
    END;

    FOR v_addition IN
      SELECT value
      FROM jsonb_array_elements(v_additions)
    LOOP
      INSERT INTO sale_item_additions (
        sale_item_id,
        addition_catalog_id,
        supply_id,
        name,
        price,
        grams,
        quantity
      )
      VALUES (
        v_sale_item_id,
        (v_addition.value->>'addition_catalog_id')::UUID,
        (v_addition.value->>'supply_id')::UUID,
        COALESCE(v_addition.value->>'name', ''),
        COALESCE(NULLIF(v_addition.value->>'price', '')::INTEGER, 0),
        COALESCE(NULLIF(v_addition.value->>'grams', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_addition.value->>'quantity', '')::INTEGER, 1)
      );
    END LOOP;
  END LOOP;

  PERFORM deduct_inventory_for_sale(p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION replace_pending_sale_order(
  UUID,
  payment_method,
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  BOOLEAN,
  TEXT,
  UUID,
  INTEGER,
  INTEGER,
  JSONB
) TO authenticated;
