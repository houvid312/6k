-- Migration 070: Fix function overloading for replace_pending_sale_order
BEGIN;

-- 1. Eliminar todas las versiones sobrecargadas de replace_pending_sale_order
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'replace_pending_sale_order'
          AND pronamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE;';
    END LOOP;
END $$;

-- 2. Crear la única versión canónica de replace_pending_sale_order
CREATE OR REPLACE FUNCTION public.replace_pending_sale_order(
  p_sale_id UUID,
  p_payment_method payment_method,
  p_total_portions INTEGER,
  p_total_amount INTEGER,
  p_packaging_total INTEGER DEFAULT 0,
  p_cash_amount INTEGER DEFAULT 0,
  p_bank_amount INTEGER DEFAULT 0,
  p_observations TEXT DEFAULT NULL,
  p_is_paid BOOLEAN DEFAULT FALSE,
  p_customer_note TEXT DEFAULT NULL,
  p_packaging_supply_id UUID DEFAULT NULL,
  p_total_cost_cop INTEGER DEFAULT 0,
  p_gross_margin_cop INTEGER DEFAULT 0,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_is_credit BOOLEAN DEFAULT FALSE,
  p_debtor_name TEXT DEFAULT NULL,
  p_debtor_type debtor_type DEFAULT 'TRABAJADOR'::debtor_type,
  p_debtor_worker_id UUID DEFAULT NULL,
  p_debtor_customer_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_had_item_packaging BOOLEAN;
  v_item RECORD;
  v_recipe_id UUID;
  v_ingredient RECORD;
  v_addition RECORD;
  v_sale_item_id UUID;
  v_old_format RECORD;
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
    -- 1. Revertir ingredientes de receta base
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

    -- 2. Revertir masa especifica del formato
    SELECT pf.masa_supply_id, pf.masa_grams
    INTO v_old_format
    FROM product_formats pf
    WHERE (pf.id = v_item.format_id)
       OR (v_item.format_id IS NULL AND pf.product_id = v_item.product_id AND pf.name = v_item.format_name)
    LIMIT 1;

    IF v_old_format.masa_supply_id IS NOT NULL AND COALESCE(v_old_format.masa_grams, 0) > 0 THEN
      PERFORM deduct_store_inventory(
        v_sale.store_id,
        v_old_format.masa_supply_id,
        -(v_old_format.masa_grams * v_item.quantity)
      );
    END IF;

    -- 3. Revertir adiciones
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

    -- 4. Revertir empaque por item
    IF v_item.packaging_supply_id IS NOT NULL AND COALESCE(v_item.packaging_quantity, 0) > 0 THEN
      PERFORM deduct_store_inventory(
        v_sale.store_id,
        v_item.packaging_supply_id,
        -v_item.packaging_quantity
      );
    END IF;
  END LOOP;

  -- 5. Revertir empaque de venta general
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
    is_credit = COALESCE(p_is_credit, false),
    debtor_name = p_debtor_name,
    debtor_type = p_debtor_type,
    debtor_worker_id = p_debtor_worker_id,
    debtor_customer_id = p_debtor_customer_id,
    customer_note = NULLIF(COALESCE(p_customer_note, ''), ''),
    packaging_supply_id = p_packaging_supply_id
  WHERE id = p_sale_id;

  FOR v_item IN
    SELECT
      (elem.value->>'product_id')::UUID AS product_id,
      CASE
        WHEN NULLIF(elem.value->>'size', '') IS NULL THEN NULL
        ELSE (elem.value->>'size')::pizza_size
      END AS size,
      NULLIF(elem.value->>'format_id', '')::UUID AS format_id,
      NULLIF(COALESCE(elem.value->>'format_name', ''), '') AS format_name,
      COALESCE(NULLIF(elem.value->>'quantity', '')::INTEGER, 1) AS quantity,
      COALESCE(NULLIF(elem.value->>'portions', '')::INTEGER, 0) AS portions,
      COALESCE(NULLIF(elem.value->>'unit_price', '')::INTEGER, 0) AS unit_price,
      COALESCE(NULLIF(elem.value->>'subtotal', '')::INTEGER, 0) AS subtotal,
      COALESCE(NULLIF(elem.value->>'additions_total', '')::INTEGER, 0) AS additions_total,
      NULLIF(elem.value->>'packaging_supply_id', '')::UUID AS packaging_supply_id,
      NULLIF(COALESCE(elem.value->>'packaging_label', ''), '') AS packaging_label,
      COALESCE(NULLIF(elem.value->>'packaging_unit_price', '')::INTEGER, 0) AS packaging_unit_price,
      COALESCE(NULLIF(elem.value->>'packaging_quantity', '')::INTEGER, 0) AS packaging_quantity,
      COALESCE(NULLIF(elem.value->>'packaging_total', '')::INTEGER, 0) AS packaging_total,
      COALESCE(NULLIF(elem.value->>'recipe_cost_cop', '')::INTEGER, 0) AS recipe_cost_cop,
      COALESCE(NULLIF(elem.value->>'additions_cost_cop', '')::INTEGER, 0) AS additions_cost_cop,
      COALESCE(NULLIF(elem.value->>'packaging_cost_cop', '')::INTEGER, 0) AS packaging_cost_cop,
      COALESCE(NULLIF(elem.value->>'total_cost_cop', '')::INTEGER, 0) AS total_cost_cop,
      CASE
        WHEN jsonb_typeof(elem.value->'additions') = 'array' THEN elem.value->'additions'
        ELSE '[]'::jsonb
      END AS additions
    FROM jsonb_array_elements(p_items) AS elem
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
      v_item.product_id,
      v_item.size,
      v_item.format_id,
      v_item.format_name,
      v_item.quantity,
      v_item.portions,
      v_item.unit_price,
      v_item.subtotal,
      v_item.additions_total,
      v_item.packaging_supply_id,
      v_item.packaging_label,
      v_item.packaging_unit_price,
      v_item.packaging_quantity,
      v_item.packaging_total,
      v_item.recipe_cost_cop,
      v_item.additions_cost_cop,
      v_item.packaging_cost_cop,
      v_item.total_cost_cop
    )
    RETURNING id INTO v_sale_item_id;

    FOR v_addition IN
      SELECT
        (add_elem.value->>'addition_catalog_id')::UUID AS addition_catalog_id,
        (add_elem.value->>'supply_id')::UUID AS supply_id,
        add_elem.value->>'name' AS name,
        COALESCE(NULLIF(add_elem.value->>'price', '')::INTEGER, 0) AS price,
        COALESCE(NULLIF(add_elem.value->>'grams', '')::NUMERIC, 0) AS grams,
        COALESCE(NULLIF(add_elem.value->>'quantity', '')::INTEGER, 1) AS quantity
      FROM jsonb_array_elements(v_item.additions) AS add_elem
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
        v_addition.addition_catalog_id,
        v_addition.supply_id,
        v_addition.name,
        v_addition.price,
        v_addition.grams,
        v_addition.quantity
      );
    END LOOP;
  END LOOP;

  -- Descontar inventario de los nuevos items
  PERFORM deduct_inventory_for_sale(p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_pending_sale_order TO authenticated, service_role, anon;

COMMIT;
