-- ============================================================
-- 032: Sale item packaging pricing
-- Moves operational packaging selection to the sale item level and stores
-- price snapshots so future packaging charges do not mutate old sales.
-- ============================================================

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS packaging_supply_id UUID REFERENCES supplies(id),
  ADD COLUMN IF NOT EXISTS packaging_label TEXT,
  ADD COLUMN IF NOT EXISTS packaging_unit_price INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS packaging_total INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION deduct_inventory_for_sale(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  v_store_id UUID;
  v_packaging_supply_id UUID;
  v_has_item_packaging BOOLEAN;
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

  SELECT EXISTS (
    SELECT 1
    FROM sale_items
    WHERE sale_id = p_sale_id
      AND packaging_supply_id IS NOT NULL
      AND COALESCE(packaging_quantity, 0) > 0
  )
  INTO v_has_item_packaging;

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

    IF item.packaging_supply_id IS NOT NULL AND COALESCE(item.packaging_quantity, 0) > 0 THEN
      PERFORM deduct_store_inventory(v_store_id, item.packaging_supply_id, item.packaging_quantity);
    END IF;
  END LOOP;

  IF v_packaging_supply_id IS NOT NULL AND NOT COALESCE(v_has_item_packaging, false) THEN
    PERFORM deduct_store_inventory(v_store_id, v_packaging_supply_id, 1);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
      packaging_total
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
      COALESCE(NULLIF(v_item.value->>'packaging_total', '')::INTEGER, 0)
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
  JSONB
) TO authenticated;
