-- ============================================================
-- 027: Inventory flow fixes
-- - Transfers record their real received timestamp
-- - Sale inventory deduction includes recipe, additions, and packaging
-- - RLS helpers/policies for operational inventory workflows
-- ============================================================

-- ==================== TRANSFERS ====================

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_transfers_received_destination
  ON transfers(to_store_id, received_at)
  WHERE status = 'RECEIVED';

-- ==================== HELPERS ====================

CREATE OR REPLACE FUNCTION get_worker_role()
RETURNS worker_role AS $$
  SELECT w.role FROM workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_inventory_operator()
RETURNS boolean AS $$
  SELECT COALESCE(
    get_user_role() = 'ADMIN'
    OR get_worker_role() IN ('PREPARADOR', 'ADMINISTRADOR', 'CAJERO', 'COORDINADOR'),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_transfer_operator()
RETURNS boolean AS $$
  SELECT COALESCE(
    get_user_role() = 'ADMIN'
    OR get_worker_role() IN ('ADMINISTRADOR', 'CAJERO', 'COORDINADOR'),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ==================== SALE INVENTORY DEDUCTION ====================

CREATE OR REPLACE FUNCTION deduct_store_inventory(
  p_store_id UUID,
  p_supply_id UUID,
  p_grams NUMERIC
)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory
  SET quantity_grams = quantity_grams - p_grams,
      last_updated = now()
  WHERE supply_id = p_supply_id
    AND store_id = p_store_id
    AND level = 'STORE';

  IF NOT FOUND THEN
    INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
    VALUES (p_supply_id, p_store_id, 'STORE', -p_grams);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION deduct_inventory_for_sale(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  v_store_id UUID;
  v_packaging_supply_id UUID;
  item RECORD;
  ingredient RECORD;
  addition RECORD;
  recipe_id_val UUID;
BEGIN
  SELECT store_id, packaging_supply_id
  INTO v_store_id, v_packaging_supply_id
  FROM sales
  WHERE id = p_sale_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada: %', p_sale_id;
  END IF;

  FOR item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    SELECT r.id INTO recipe_id_val
    FROM recipes r
    WHERE r.product_id = item.product_id;

    IF recipe_id_val IS NOT NULL THEN
      FOR ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = recipe_id_val
      LOOP
        PERFORM deduct_store_inventory(
          v_store_id,
          ingredient.supply_id,
          ingredient.grams_per_portion * item.portions
        );
      END LOOP;
    END IF;

    FOR addition IN
      SELECT sia.supply_id, sia.grams, sia.quantity
      FROM sale_item_additions sia
      WHERE sia.sale_item_id = item.id
    LOOP
      PERFORM deduct_store_inventory(
        v_store_id,
        addition.supply_id,
        addition.grams * addition.quantity
      );
    END LOOP;
  END LOOP;

  IF v_packaging_supply_id IS NOT NULL THEN
    PERFORM deduct_store_inventory(v_store_id, v_packaging_supply_id, 1);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==================== RLS POLICIES ====================

DROP POLICY IF EXISTS "Admin manage inventory" ON inventory;
DROP POLICY IF EXISTS "Inventory operators manage inventory" ON inventory;
CREATE POLICY "Inventory operators manage inventory"
  ON inventory FOR ALL TO authenticated
  USING (is_inventory_operator())
  WITH CHECK (is_inventory_operator());

DROP POLICY IF EXISTS "Admin manage transfers" ON transfers;
DROP POLICY IF EXISTS "Transfer operators manage transfers" ON transfers;
CREATE POLICY "Transfer operators manage transfers"
  ON transfers FOR ALL TO authenticated
  USING (is_transfer_operator())
  WITH CHECK (is_transfer_operator());

DROP POLICY IF EXISTS "Admin manage transfer_items" ON transfer_items;
DROP POLICY IF EXISTS "Transfer operators manage transfer_items" ON transfer_items;
CREATE POLICY "Transfer operators manage transfer_items"
  ON transfer_items FOR ALL TO authenticated
  USING (is_transfer_operator())
  WITH CHECK (is_transfer_operator());

DROP POLICY IF EXISTS "Authenticated insert production_records" ON production_records;
DROP POLICY IF EXISTS "Production operators insert production_records" ON production_records;
CREATE POLICY "Production operators insert production_records"
  ON production_records FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'ADMIN'
    OR get_worker_role() IN ('PREPARADOR', 'ADMINISTRADOR', 'COORDINADOR')
  );

DROP POLICY IF EXISTS "Authenticated insert production_record_items" ON production_record_items;
DROP POLICY IF EXISTS "Production operators insert production_record_items" ON production_record_items;
CREATE POLICY "Production operators insert production_record_items"
  ON production_record_items FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'ADMIN'
    OR get_worker_role() IN ('PREPARADOR', 'ADMINISTRADOR', 'COORDINADOR')
  );

DROP POLICY IF EXISTS "Authenticated insert physical_counts" ON physical_counts;
DROP POLICY IF EXISTS "Count operators insert physical_counts" ON physical_counts;
CREATE POLICY "Count operators insert physical_counts"
  ON physical_counts FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'ADMIN'
    OR get_worker_role() IN ('CAJERO', 'ADMINISTRADOR', 'COORDINADOR')
  );

DROP POLICY IF EXISTS "Authenticated insert physical_count_items" ON physical_count_items;
DROP POLICY IF EXISTS "Count operators insert physical_count_items" ON physical_count_items;
CREATE POLICY "Count operators insert physical_count_items"
  ON physical_count_items FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() = 'ADMIN'
    OR get_worker_role() IN ('CAJERO', 'ADMINISTRADOR', 'COORDINADOR')
  );

DROP POLICY IF EXISTS "Inventory operators insert daily_alerts" ON daily_alerts;
CREATE POLICY "Inventory operators insert daily_alerts"
  ON daily_alerts FOR INSERT TO authenticated
  WITH CHECK (is_inventory_operator());

DROP POLICY IF EXISTS "Inventory operators delete daily_alerts" ON daily_alerts;
CREATE POLICY "Inventory operators delete daily_alerts"
  ON daily_alerts FOR DELETE TO authenticated
  USING (is_inventory_operator());
