-- Migration 061: Clean pre-August snapshot data from inventory table and recalculate from real August sales

-- 1. Delete pre-August daily alerts, physical counts, and initial seed adjustments
DELETE FROM public.daily_alerts WHERE date < '2026-08-01';
DELETE FROM public.physical_counts WHERE date < '2026-08-01';
DELETE FROM public.inventory_adjustments WHERE created_at < '2026-08-01T00:00:00-05:00';

-- 2. Reset STORE inventory levels to 0g (clean baseline before production sales)
UPDATE public.inventory
SET quantity_grams = 0, last_updated = NOW()
WHERE level = 'STORE';

-- 3. Re-apply inventory deductions for all real August sales
DO $$
DECLARE
  v_sale RECORD;
  v_item RECORD;
  v_recipe_id UUID;
  v_ingredient RECORD;
  v_addition RECORD;
BEGIN
  FOR v_sale IN
    SELECT id, store_id
    FROM sales
    WHERE created_at >= '2026-08-01T00:00:00-05:00'
    ORDER BY created_at ASC
  LOOP
    FOR v_item IN
      SELECT *
      FROM sale_items
      WHERE sale_id = v_sale.id
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
  END LOOP;
END $$;
