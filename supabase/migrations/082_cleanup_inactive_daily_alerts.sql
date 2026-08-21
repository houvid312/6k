-- Migration 082: Depurar alertas historicas de insumos inactivos y materias primas no autorizadas
BEGIN;

-- 1. Eliminar alertas historicas de insumos desactivados / obsoletos
DELETE FROM public.daily_alerts
WHERE supply_id IN (
  SELECT id FROM public.supplies WHERE is_active = false
);

-- 2. Eliminar alertas en tiendas locales de materias primas exclusivas de planta
DELETE FROM public.daily_alerts
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
