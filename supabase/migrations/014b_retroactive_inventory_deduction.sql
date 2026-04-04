-- ==================== Descuento retroactivo de inventario ====================
-- Ejecuta deduct_inventory_for_sale() para TODAS las ventas existentes
-- que nunca descontaron inventario por el bug del trigger.
--
-- IMPORTANTE: Revisar el inventario antes y después de ejecutar.
-- Si ya hiciste cierres físicos que corrigieron las cantidades,
-- este script podría dejar valores negativos.

DO $$
DECLARE
  v_sale RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_sale IN
    SELECT id FROM sales ORDER BY created_at ASC
  LOOP
    PERFORM deduct_inventory_for_sale(v_sale.id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Inventario descontado retroactivamente para % ventas', v_count;
END;
$$;
