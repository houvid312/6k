-- ============================================================
-- 030: Franchise internal billing seed and receive RPC
-- Seeds production costs / commercial prices from the clean CSV table
-- and receives transfers atomically with billing snapshots.
-- ============================================================

-- Ensure the one supply present in the CSV but missing from current seed data.
INSERT INTO supplies (
  id,
  name,
  unit,
  grams_per_bag,
  production_cost_cop,
  commercial_price_cop,
  is_billable_to_store
)
VALUES (
  '00000000-0000-0000-0002-000000000104',
  'Vasos desechables',
  'UNIDAD',
  1,
  1700,
  2210,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  grams_per_bag = EXCLUDED.grams_per_bag,
  production_cost_cop = EXCLUDED.production_cost_cop,
  commercial_price_cop = EXCLUDED.commercial_price_cop,
  is_billable_to_store = EXCLUDED.is_billable_to_store;

WITH commercial_seed(supply_name, grams_per_bag, production_cost_cop, commercial_price_cop) AS (
  VALUES
    ('Masa', 600::numeric, 1189.80::numeric, 5000),
    ('Salsa Napolitana', 3000::numeric, 6359.00::numeric, 20000),
    ('Queso Bolsa', 312::numeric, 7471.00::numeric, 9000),
    ('Jamon Bolsa', 134::numeric, 4217.00::numeric, 6400),
    ('Pollo Bolsa', 50::numeric, 1365.00::numeric, 2000),
    ('Tocineta Bolsa', 125::numeric, 2565.00::numeric, 3900),
    ('Pepperoni Bolsa', 125::numeric, 4326.00::numeric, 6100),
    ('Piña Calada Bolsa', 107::numeric, 935.00::numeric, 2000),
    ('Champinones Bolsa', 125::numeric, 2999.00::numeric, 3800),
    ('Maicitos bolsa', 100::numeric, 771.00::numeric, 1300),
    ('Aceitunas', 72::numeric, 3312.00::numeric, 4300),
    ('Carne lista Mexicana', 200::numeric, 3853.00::numeric, 7400),
    ('Salsa Jalapeño', 670::numeric, 4080.00::numeric, 7000),
    ('Guacamole', 670::numeric, 7023.00::numeric, 10600),
    ('Salsa Albahaca', 670::numeric, 4326.00::numeric, 7000),
    ('Portapizzas', 1::numeric, 80.00::numeric, 100),
    ('Caja Mediana', 1::numeric, 2040.00::numeric, 2500),
    ('Caja Familiar', 1::numeric, 3480.00::numeric, 4200),
    ('Papel Aluminio', 1::numeric, 70000.00::numeric, 84000),
    ('Vasos desechables', 1::numeric, 1700.00::numeric, 2210)
)
UPDATE supplies s
SET
  grams_per_bag = commercial_seed.grams_per_bag,
  production_cost_cop = commercial_seed.production_cost_cop,
  commercial_price_cop = commercial_seed.commercial_price_cop,
  is_billable_to_store = true
FROM commercial_seed
WHERE s.name = commercial_seed.supply_name;

CREATE OR REPLACE FUNCTION receive_transfer_with_billing(p_transfer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer transfers%ROWTYPE;
  v_item RECORD;
  v_store_name TEXT;
  v_current_destination_grams NUMERIC;
  v_grams_per_bag NUMERIC;
  v_grams_to_transfer NUMERIC;
  v_unit_cost NUMERIC(12,2);
  v_unit_price INTEGER;
  v_line_cost NUMERIC(12,2);
  v_line_total INTEGER;
  v_total_cost NUMERIC(12,2) := 0;
  v_total_price INTEGER := 0;
  v_credit_id UUID;
  v_today DATE := (now() AT TIME ZONE 'America/Bogota')::DATE;
BEGIN
  SELECT *
  INTO v_transfer
  FROM transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('PENDING', 'IN_TRANSIT') THEN
    RAISE EXCEPTION 'Transfer % cannot be received in status %', p_transfer_id, v_transfer.status;
  END IF;

  SELECT name
  INTO v_store_name
  FROM stores
  WHERE id = v_transfer.to_store_id;

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'Destination store % not found', v_transfer.to_store_id;
  END IF;

  FOR v_item IN
    SELECT id, supply_id, bags_to_send
    FROM transfer_items
    WHERE transfer_id = p_transfer_id
    FOR UPDATE
  LOOP
    SELECT
      COALESCE(NULLIF(grams_per_bag, 0), 1),
      COALESCE(production_cost_cop, 0),
      CASE
        WHEN COALESCE(is_billable_to_store, true) THEN COALESCE(commercial_price_cop, 0)
        ELSE 0
      END
    INTO v_grams_per_bag, v_unit_cost, v_unit_price
    FROM supplies
    WHERE id = v_item.supply_id;

    IF v_grams_per_bag IS NULL THEN
      RAISE EXCEPTION 'Supply % not found', v_item.supply_id;
    END IF;

    v_grams_to_transfer := v_item.bags_to_send * v_grams_per_bag;
    v_line_cost := ROUND((v_item.bags_to_send * v_unit_cost)::NUMERIC, 2);
    v_line_total := v_item.bags_to_send * v_unit_price;

    SELECT quantity_grams
    INTO v_current_destination_grams
    FROM inventory
    WHERE store_id = v_transfer.to_store_id
      AND supply_id = v_item.supply_id
      AND level = 'STORE';

    v_current_destination_grams := COALESCE(v_current_destination_grams, 0);

    INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
    VALUES (v_transfer.from_store_id, v_item.supply_id, 'PROCESSED', -v_grams_to_transfer, now())
    ON CONFLICT (supply_id, store_id, level)
    DO UPDATE SET
      quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
      last_updated = now();

    INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
    VALUES (v_transfer.to_store_id, v_item.supply_id, 'STORE', v_grams_to_transfer, now())
    ON CONFLICT (supply_id, store_id, level)
    DO UPDATE SET
      quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
      last_updated = now();

    UPDATE transfer_items
    SET
      current_inventory_grams = v_current_destination_grams,
      target_grams = v_current_destination_grams + v_grams_to_transfer,
      grams_per_bag_snapshot = v_grams_per_bag,
      unit_cost_cop_snapshot = v_unit_cost,
      unit_price_cop_snapshot = v_unit_price,
      total_cost_cop_snapshot = v_line_cost,
      total_price_cop_snapshot = v_line_total
    WHERE id = v_item.id;

    v_total_cost := v_total_cost + v_line_cost;
    v_total_price := v_total_price + v_line_total;
  END LOOP;

  INSERT INTO credit_entries (
    debtor_name,
    debtor_type,
    store_id,
    transfer_id,
    concept,
    amount,
    balance,
    is_paid,
    paid_date,
    date
  )
  VALUES (
    v_store_name,
    'LOCAL'::debtor_type,
    v_transfer.to_store_id,
    p_transfer_id,
    'Cobro interno traslado ' || right(p_transfer_id::TEXT, 6),
    v_total_price,
    v_total_price,
    v_total_price = 0,
    CASE WHEN v_total_price = 0 THEN v_today ELSE NULL END,
    v_today
  )
  RETURNING id INTO v_credit_id;

  UPDATE transfers
  SET
    status = 'RECEIVED',
    received_at = now(),
    shipping_date = v_today,
    total_cost_cop = v_total_cost,
    total_price_cop = v_total_price,
    billed_at = now(),
    credit_entry_id = v_credit_id
  WHERE id = p_transfer_id;

  RETURN p_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION receive_transfer_with_billing(UUID) TO authenticated;
