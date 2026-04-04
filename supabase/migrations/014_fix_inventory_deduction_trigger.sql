-- ==================== FIX: Trigger de descuento de inventario ====================
-- Problema: El trigger en `sales` se ejecutaba ANTES de que existieran los sale_items,
-- por lo que nunca encontraba items y no descontaba nada del inventario.
-- Solución: Reemplazar el trigger por una función RPC que se llama explícitamente
-- desde la app después de insertar los sale_items.

-- 1. Eliminar el trigger viejo que no funciona
DROP TRIGGER IF EXISTS trigger_deduct_inventory ON sales;

-- 2. Crear función RPC para descontar inventario de una venta
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
