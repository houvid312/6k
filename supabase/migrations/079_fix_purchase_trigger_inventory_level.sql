-- Migration 079: Corregir tipo de dato inventory_level en trigger de compras add_purchase_to_raw_inventory
BEGIN;

CREATE OR REPLACE FUNCTION add_purchase_to_raw_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_is_production_center BOOLEAN;
  v_supply_category TEXT;
  v_target_level inventory_level;
BEGIN
  SELECT is_production_center INTO v_is_production_center
  FROM stores
  WHERE id = NEW.store_id;

  SELECT category INTO v_supply_category
  FROM supplies
  WHERE id = NEW.supply_id;

  IF COALESCE(v_is_production_center, false) THEN
    IF v_supply_category = 'RAW' THEN
      v_target_level := 'RAW'::inventory_level;
    ELSE
      v_target_level := 'PROCESSED'::inventory_level;
    END IF;
  ELSE
    v_target_level := 'STORE'::inventory_level;
  END IF;

  INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
  VALUES (NEW.store_id, NEW.supply_id, v_target_level, NEW.quantity_grams, now())
  ON CONFLICT (supply_id, store_id, level)
  DO UPDATE SET
    quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
    last_updated = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
