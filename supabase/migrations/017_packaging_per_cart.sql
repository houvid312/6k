-- ============================================================
-- 017: Packaging per Cart (not per item)
-- Mueve packaging_supply_id de sale_items a sales
-- Ahora se selecciona UNA caja/empaque por venta, no por pizza
-- ============================================================

-- ==================== NUEVA COLUMNA EN SALES ====================

ALTER TABLE sales ADD COLUMN packaging_supply_id UUID REFERENCES supplies(id);

-- ==================== MIGRAR DATOS EXISTENTES ====================
-- Toma el primer packaging_supply_id encontrado en los items de cada venta
UPDATE sales s
SET packaging_supply_id = (
  SELECT si.packaging_supply_id
  FROM sale_items si
  WHERE si.sale_id = s.id
    AND si.packaging_supply_id IS NOT NULL
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM sale_items si
  WHERE si.sale_id = s.id
    AND si.packaging_supply_id IS NOT NULL
);

-- ==================== ELIMINAR COLUMNA DE SALE_ITEMS ====================

ALTER TABLE sale_items DROP COLUMN packaging_supply_id;

-- ==================== ACTUALIZAR FUNCION DE DESCUENTO ====================
-- Ahora descuenta 1 unidad de empaque por venta (no por item)

CREATE OR REPLACE FUNCTION deduct_inventory_for_sale(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  v_store_id UUID;
  v_packaging_supply_id UUID;
  item RECORD;
  ingredient RECORD;
  recipe_id_val UUID;
BEGIN
  -- Obtener el store_id y packaging de la venta
  SELECT store_id, packaging_supply_id
  INTO v_store_id, v_packaging_supply_id
  FROM sales WHERE id = p_sale_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada: %', p_sale_id;
  END IF;

  -- Descontar ingredientes de cada item
  FOR item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
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
  END LOOP;

  -- Descontar 1 unidad de empaque por venta (si tiene)
  IF v_packaging_supply_id IS NOT NULL THEN
    UPDATE inventory
    SET quantity_grams = quantity_grams - 1,
        last_updated = now()
    WHERE supply_id = v_packaging_supply_id
      AND store_id = v_store_id
      AND level = 'STORE';

    IF NOT FOUND THEN
      INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
      VALUES (v_packaging_supply_id, v_store_id, 'STORE', -1);
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
