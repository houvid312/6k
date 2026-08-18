-- Migration 071: Asignar correctamente Masa Familiar (75g = 1/8) a formato Individual / Porción
BEGIN;

-- 1. Formatos Individuales / Porción: consumen 1/8 de Masa Familiar (75g)
UPDATE public.product_formats
SET 
  masa_supply_id = '00000000-0000-0000-0002-000000000201', -- Masa Familiar
  masa_grams = 75
WHERE (name ILIKE '%individual%' OR name ILIKE '%porción%' OR name ILIKE '%porcion%')
  AND name NOT ILIKE '%diamante%';

-- 2. Formatos Diamante: consumen Masa Diamante (150g)
UPDATE public.product_formats
SET 
  masa_supply_id = '00000000-0000-0000-0002-000000000203', -- Masa Diamante
  masa_grams = 150
WHERE name ILIKE '%diamante%';

-- 3. Formatos Mediana: consumen Masa Mediana (300g)
UPDATE public.product_formats
SET 
  masa_supply_id = '00000000-0000-0000-0002-000000000202', -- Masa Mediana
  masa_grams = 300
WHERE name ILIKE '%mediana%';

-- 4. Formatos Familiar: consumen Masa Familiar (600g)
UPDATE public.product_formats
SET 
  masa_supply_id = '00000000-0000-0000-0002-000000000201', -- Masa Familiar
  masa_grams = 600
WHERE name ILIKE '%familiar%';

COMMIT;
