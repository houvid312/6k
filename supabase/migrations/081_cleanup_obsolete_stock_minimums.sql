-- Migration 081: Depurar minimos de insumos inactivos y blindar minimos de tiendas locales
BEGIN;

-- 1. Eliminar minimos de insumos desactivados / obsoletos
DELETE FROM public.stock_minimums
WHERE supply_id IN (
  SELECT id FROM public.supplies WHERE is_active = false
);

-- 2. Eliminar minimos en tiendas locales de materias primas exclusivas de fabrica
DELETE FROM public.stock_minimums
WHERE store_id IN (
  SELECT id FROM public.stores WHERE is_production_center = false
)
AND supply_id IN (
  SELECT id FROM public.supplies 
  WHERE category = 'RAW' 
    AND is_billable_to_store = false 
    AND allow_local_purchase = false
);

COMMIT;
