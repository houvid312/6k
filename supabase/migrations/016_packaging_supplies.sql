-- ============================================================
-- 016: Packaging Supplies (Cajas y Empaque)
-- Agrega insumos de empaque: Caja Familiar, Caja Mediana, Empaque Diamante/Individual
-- Agrega columna packaging_supply_id a sale_items para descontar empaques al vender
-- ============================================================

-- ==================== NUEVOS INSUMOS DE EMPAQUE ====================

INSERT INTO supplies (id, name, unit, grams_per_bag) VALUES
  ('00000000-0000-0000-0002-000000000101', 'Caja Familiar', 'UNIDAD', 1),
  ('00000000-0000-0000-0002-000000000102', 'Caja Mediana', 'UNIDAD', 1),
  ('00000000-0000-0000-0002-000000000103', 'Empaque Diamante/Individual', 'UNIDAD', 1);

-- ==================== COLUMNA DE EMPAQUE EN SALE_ITEMS ====================

ALTER TABLE sale_items ADD COLUMN packaging_supply_id UUID REFERENCES supplies(id);

-- ==================== INVENTARIO INICIAL DE EMPAQUES ====================

-- Local Principal - nivel STORE (50 unidades iniciales de cada uno)
INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
SELECT s.id, '00000000-0000-0000-0000-000000000002', 'STORE', 50
FROM supplies s
WHERE s.id IN (
  '00000000-0000-0000-0002-000000000101',
  '00000000-0000-0000-0002-000000000102',
  '00000000-0000-0000-0002-000000000103'
);

-- Centro de Produccion - nivel PROCESSED (200 unidades iniciales)
INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
SELECT s.id, '00000000-0000-0000-0000-000000000001', 'PROCESSED', 200
FROM supplies s
WHERE s.id IN (
  '00000000-0000-0000-0002-000000000101',
  '00000000-0000-0000-0002-000000000102',
  '00000000-0000-0000-0002-000000000103'
);

-- ==================== STOCK MINIMUMS (10 unidades diarias) ====================

-- Para cada tienda no-centro-de-produccion, minimo 10 unidades de cada empaque
INSERT INTO stock_minimums (supply_id, store_id, level, minimum_grams)
SELECT s.id, st.id, 'STORE', 10
FROM supplies s
CROSS JOIN stores st
WHERE s.id IN (
  '00000000-0000-0000-0002-000000000101',
  '00000000-0000-0000-0002-000000000102',
  '00000000-0000-0000-0002-000000000103'
)
AND st.is_production_center = false
ON CONFLICT (supply_id, store_id, level) DO UPDATE SET minimum_grams = 10;

-- ==================== ACTUALIZAR FUNCION DE DESCUENTO ====================
-- Ahora tambien descuenta empaques (packaging_supply_id) de sale_items

CREATE OR REPLACE FUNCTION deduct_inventory_for_sale(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  v_store_id UUID;
  item RECORD;
  ingredient RECORD;
  recipe_id_val UUID;
BEGIN
  -- Obtener el store_id de la venta
  SELECT store_id INTO v_store_id FROM sales WHERE id = p_sale_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada: %', p_sale_id;
  END IF;

  FOR item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    -- Descontar ingredientes de la receta
    SELECT r.id INTO recipe_id_val
    FROM recipes r WHERE r.product_id = item.product_id;

    IF recipe_id_val IS NOT NULL THEN
      FOR ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = recipe_id_val
      LOOP
        UPDATE inventory
        SET quantity_grams = quantity_grams - (ingredient.grams_per_portion * item.portions),
            last_updated = now()
        WHERE supply_id = ingredient.supply_id
          AND store_id = v_store_id
          AND level = 'STORE';
      END LOOP;
    END IF;

    -- Descontar empaque si tiene
    IF item.packaging_supply_id IS NOT NULL THEN
      UPDATE inventory
      SET quantity_grams = quantity_grams - item.quantity,
          last_updated = now()
      WHERE supply_id = item.packaging_supply_id
        AND store_id = v_store_id
        AND level = 'STORE';

      -- Si no existe el registro, crear con balance negativo
      IF NOT FOUND THEN
        INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
        VALUES (item.packaging_supply_id, v_store_id, 'STORE', -item.quantity);
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
