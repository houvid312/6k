-- Migration 069: Refactorizacion de Masas Estiradas y Nuevos Formatos Medias Pizzas
BEGIN;

-- 1. IDs constantes para las masas
-- Masa Generica: '00000000-0000-0000-0002-000000000001'
-- Masa Familiar: '00000000-0000-0000-0002-000000000201' (600g)
-- Masa Mediana:  '00000000-0000-0000-0002-000000000202' (300g)
-- Masa Diamante: '00000000-0000-0000-0002-000000000203' (150g)

-- 2. Alterar product_formats para soportar masa especifica por formato
ALTER TABLE public.product_formats
  ADD COLUMN IF NOT EXISTS masa_supply_id UUID REFERENCES public.supplies(id),
  ADD COLUMN IF NOT EXISTS masa_grams NUMERIC DEFAULT 0;

-- 3. Crear los 3 nuevos insumos de masa estirada en supplies
DO $$
DECLARE
  v_base_price NUMERIC;
BEGIN
  SELECT commercial_price_cop INTO v_base_price 
  FROM public.supplies 
  WHERE id = '00000000-0000-0000-0002-000000000001';
  
  IF v_base_price IS NULL OR v_base_price <= 0 THEN
    v_base_price := 5000;
  END IF;

  INSERT INTO public.supplies (id, name, unit, grams_per_bag, category, is_active, commercial_price_cop, is_billable_to_store)
  VALUES
    ('00000000-0000-0000-0002-000000000201', 'Masa Familiar', 'GRAMOS', 600, 'PROCESSED', true, v_base_price, true),
    ('00000000-0000-0000-0002-000000000202', 'Masa Mediana', 'GRAMOS', 300, 'PROCESSED', true, ROUND(v_base_price / 2), true),
    ('00000000-0000-0000-0002-000000000203', 'Masa Diamante', 'GRAMOS', 150, 'PROCESSED', true, ROUND(v_base_price / 4), true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    unit = EXCLUDED.unit,
    grams_per_bag = EXCLUDED.grams_per_bag,
    category = EXCLUDED.category,
    is_active = EXCLUDED.is_active,
    commercial_price_cop = EXCLUDED.commercial_price_cop,
    is_billable_to_store = EXCLUDED.is_billable_to_store;
END $$;

-- 4. Crear Recetas de Produccion para convertir Masa Generica en Masas Estiradas
INSERT INTO public.production_recipes (id, supply_id, name, output_grams, output_bags, is_active)
VALUES
  ('00000000-0000-0000-0005-000000000201', '00000000-0000-0000-0002-000000000201', 'Estirado Masa Familiar', 600, 1, true),
  ('00000000-0000-0000-0005-000000000202', '00000000-0000-0000-0002-000000000202', 'Estirado Masa Mediana', 300, 1, true),
  ('00000000-0000-0000-0005-000000000203', '00000000-0000-0000-0002-000000000203', 'Estirado Masa Diamante', 150, 1, true)
ON CONFLICT (id) DO UPDATE SET
  supply_id = EXCLUDED.supply_id,
  name = EXCLUDED.name,
  output_grams = EXCLUDED.output_grams,
  output_bags = EXCLUDED.output_bags,
  is_active = EXCLUDED.is_active;

-- Insumos requeridos para las recetas de produccion de estirado (consumen Masa Generica)
INSERT INTO public.production_recipe_inputs (production_recipe_id, supply_id, grams_required)
VALUES
  ('00000000-0000-0000-0005-000000000201', '00000000-0000-0000-0002-000000000001', 600),
  ('00000000-0000-0000-0005-000000000202', '00000000-0000-0000-0002-000000000001', 300),
  ('00000000-0000-0000-0005-000000000203', '00000000-0000-0000-0002-000000000001', 150)
ON CONFLICT (production_recipe_id, supply_id) DO UPDATE SET
  grams_required = EXCLUDED.grams_required;

-- 5. Configurar formatos existentes de pizzas para vincularlos a su masa correspondiente
-- Familiar (600g)
UPDATE public.product_formats
SET 
  masa_supply_id = '00000000-0000-0000-0002-000000000201',
  masa_grams = 600
WHERE name ILIKE '%familiar%'
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- Mediana (300g)
UPDATE public.product_formats
SET 
  masa_supply_id = '00000000-0000-0000-0002-000000000202',
  masa_grams = 300
WHERE name ILIKE '%mediana%'
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- Diamante / Individual (150g)
UPDATE public.product_formats
SET 
  masa_supply_id = '00000000-0000-0000-0002-000000000203',
  masa_grams = 150
WHERE (name ILIKE '%diamante%' OR name ILIKE '%individual%')
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- 6. Crear formatos nuevos de Medias Pizzas para todas las pizzas que tienen formato Familiar o Mediana
-- Formato "Media Familiar": 4 porciones, mitad de precio, 300g de Masa Familiar
INSERT INTO public.product_formats (id, product_id, name, portions, price, is_active, sort_order, masa_supply_id, masa_grams)
SELECT
  gen_random_uuid(),
  pf.product_id,
  'Media Familiar',
  4,
  ROUND(pf.price / 2),
  true,
  pf.sort_order + 1,
  '00000000-0000-0000-0002-000000000201',
  300
FROM public.product_formats pf
JOIN public.products p ON p.id = pf.product_id
WHERE p.category = 'PIZZA'
  AND pf.name ILIKE 'Familiar%'
ON CONFLICT (product_id, name) DO UPDATE SET
  portions = EXCLUDED.portions,
  price = EXCLUDED.price,
  masa_supply_id = EXCLUDED.masa_supply_id,
  masa_grams = EXCLUDED.masa_grams;

-- Formato "Media Mediana": 2 porciones, mitad de precio, 150g de Masa Mediana
INSERT INTO public.product_formats (id, product_id, name, portions, price, is_active, sort_order, masa_supply_id, masa_grams)
SELECT
  gen_random_uuid(),
  pf.product_id,
  'Media Mediana',
  2,
  ROUND(pf.price / 2),
  true,
  pf.sort_order + 1,
  '00000000-0000-0000-0002-000000000202',
  150
FROM public.product_formats pf
JOIN public.products p ON p.id = pf.product_id
WHERE p.category = 'PIZZA'
  AND pf.name ILIKE 'Mediana%'
ON CONFLICT (product_id, name) DO UPDATE SET
  portions = EXCLUDED.portions,
  price = EXCLUDED.price,
  masa_supply_id = EXCLUDED.masa_supply_id,
  masa_grams = EXCLUDED.masa_grams;

-- 7. Eliminar el insumo Masa generico de recipe_ingredients para evitar doble deduccion
DELETE FROM public.recipe_ingredients
WHERE supply_id = '00000000-0000-0000-0002-000000000001';

-- 8. Actualizar funcion deduct_inventory_for_sale para descontar la masa por formato
CREATE OR REPLACE FUNCTION public.deduct_inventory_for_sale(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  v_store_id UUID;
  v_packaging_supply_id UUID;
  v_has_item_packaging BOOLEAN;
  item RECORD;
  ingredient RECORD;
  addition RECORD;
  recipe_id_val UUID;
  v_format RECORD;
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
    -- 1. Descontar ingredientes de receta base (queso, salsas, toppings)
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

    -- 2. Descontar masa especifica segun el formato vendido
    SELECT pf.masa_supply_id, pf.masa_grams
    INTO v_format
    FROM product_formats pf
    WHERE (pf.id = item.format_id)
       OR (item.format_id IS NULL AND pf.product_id = item.product_id AND pf.name = item.format_name)
    LIMIT 1;

    IF v_format.masa_supply_id IS NOT NULL AND COALESCE(v_format.masa_grams, 0) > 0 THEN
      PERFORM deduct_store_inventory(
        v_store_id,
        v_format.masa_supply_id,
        v_format.masa_grams * item.quantity
      );
    END IF;

    -- 3. Descontar adiciones
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

    -- 4. Descontar empaque por item
    IF item.packaging_supply_id IS NOT NULL AND COALESCE(item.packaging_quantity, 0) > 0 THEN
      PERFORM deduct_store_inventory(v_store_id, item.packaging_supply_id, item.packaging_quantity);
    END IF;
  END LOOP;

  -- 5. Descontar empaque general de la venta si no habia por item
  IF v_packaging_supply_id IS NOT NULL AND NOT COALESCE(v_has_item_packaging, false) THEN
    PERFORM deduct_store_inventory(v_store_id, v_packaging_supply_id, 1);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Actualizar funcion replace_pending_sale_order para revertir correctamente la masa por formato
CREATE OR REPLACE FUNCTION public.replace_pending_sale_order(
  p_sale_id UUID,
  p_payment_method payment_method,
  p_total_portions INTEGER,
  p_total_amount INTEGER,
  p_packaging_total INTEGER,
  p_total_cost_cop INTEGER,
  p_gross_margin_cop INTEGER,
  p_cash_amount INTEGER,
  p_bank_amount INTEGER,
  p_observations TEXT,
  p_is_paid BOOLEAN,
  p_is_credit BOOLEAN,
  p_debtor_name TEXT,
  p_debtor_type debtor_type,
  p_debtor_worker_id UUID,
  p_debtor_customer_id UUID,
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

COMMIT;
