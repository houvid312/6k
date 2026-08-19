-- Migration 077: Blindar materias primas exclusivas de planta (is_billable_to_store = false)
BEGIN;

-- 1. Marcar como exclusivas de Centro de Producción todas las materias primas que no se despachan directas a tienda
UPDATE supplies
SET is_billable_to_store = false, allow_local_purchase = false
WHERE category = 'RAW'
  AND name NOT IN (
    'Orégano Molido',
    'Pimienta negra (molida)',
    'Pimienta Cayena',
    'Sal',
    'Sal de Ajo',
    'Tomillo Molido',
    'Vinagre',
    'Vinagre balsamico',
    'Soda (300 ml)',
    'Aceite de Girasol',
    'Aceite Gourmet',
    'Aceite Sevillano'
  );

-- 2. Asegurar que las especias y condimentos autorizados para tiendas tengan is_billable_to_store = true
UPDATE supplies
SET is_billable_to_store = true
WHERE name IN (
  'Orégano Molido',
  'Pimienta negra (molida)',
  'Pimienta Cayena',
  'Sal',
  'Sal de Ajo',
  'Tomillo Molido',
  'Vinagre',
  'Vinagre balsamico',
  'Soda (300 ml)'
);

COMMIT;
