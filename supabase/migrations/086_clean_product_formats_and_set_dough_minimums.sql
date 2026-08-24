-- Migration 086: Limpieza de formatos de masa y configuracion de minimos de stock para masas estiradas
BEGIN;

-- 1. Limpiar masa en productos que no son Pizza (Bebidas, Empaques, Otros)
UPDATE public.product_formats
SET masa_supply_id = NULL,
    masa_grams = 0
WHERE product_id IN (SELECT id FROM public.products WHERE category != 'PIZZA');

-- 2. Asegurar configuracion exacta de masas por formato en Pizzas
-- Masa Familiar (600g): '00000000-0000-0000-0002-000000000201'
-- Masa Mediana  (300g): '00000000-0000-0000-0002-000000000202'
-- Masa Diamante (150g): '00000000-0000-0000-0002-000000000203'

-- Formato Individual (1 porcion = 1/8 de familiar = 75g de Masa Familiar)
UPDATE public.product_formats
SET masa_supply_id = '00000000-0000-0000-0002-000000000201',
    masa_grams = 75
WHERE name ILIKE '%individual%'
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- Formato Familiar (8 porciones = 600g de Masa Familiar)
UPDATE public.product_formats
SET masa_supply_id = '00000000-0000-0000-0002-000000000201',
    masa_grams = 600
WHERE name ILIKE '%familiar%'
  AND name NOT ILIKE '%media%'
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- Formato Media Familiar (4 porciones = 300g de Masa Familiar)
UPDATE public.product_formats
SET masa_supply_id = '00000000-0000-0000-0002-000000000201',
    masa_grams = 300
WHERE name ILIKE '%media familiar%'
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- Formato Mediana (300g de Masa Mediana)
UPDATE public.product_formats
SET masa_supply_id = '00000000-0000-0000-0002-000000000202',
    masa_grams = 300
WHERE name ILIKE '%mediana%'
  AND name NOT ILIKE '%media%'
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- Formato Media Mediana (150g de Masa Mediana)
UPDATE public.product_formats
SET masa_supply_id = '00000000-0000-0000-0002-000000000202',
    masa_grams = 150
WHERE name ILIKE '%media mediana%'
  AND product_id IN (SELECT id FROM public.products WHERE category = 'PIZZA');

-- Formato Diamante (150g de Masa Diamante para Pizza Diamante)
UPDATE public.product_formats
SET masa_supply_id = '00000000-0000-0000-0002-000000000203',
    masa_grams = 150
WHERE name ILIKE '%diamante%'
  AND product_id IN (SELECT id FROM public.products WHERE name ILIKE '%diamante%');

-- 3. Limpiar minimos antiguos del insumo generico 'Masa'
DELETE FROM public.stock_minimums
WHERE supply_id = '00000000-0000-0000-0002-000000000001';

-- 4. Asignar Minimos de Stock para las masas estiradas en cada sede
DO $$
DECLARE
  v_sj_id UUID;
  v_mg_id UUID;
  v_cp_id UUID;
BEGIN
  SELECT id INTO v_sj_id FROM public.stores WHERE name ILIKE '%San Juan%' LIMIT 1;
  SELECT id INTO v_mg_id FROM public.stores WHERE name ILIKE '%Margaritas%' LIMIT 1;
  SELECT id INTO v_cp_id FROM public.stores WHERE is_production_center = true LIMIT 1;

  -- San Juan
  IF v_sj_id IS NOT NULL THEN
    INSERT INTO public.stock_minimums (id, store_id, supply_id, level, minimum_grams)
    VALUES
      (gen_random_uuid(), v_sj_id, '00000000-0000-0000-0002-000000000201', 'STORE', 4800), -- 8 masas familiares
      (gen_random_uuid(), v_sj_id, '00000000-0000-0000-0002-000000000202', 'STORE', 1200), -- 4 masas medianas
      (gen_random_uuid(), v_sj_id, '00000000-0000-0000-0002-000000000203', 'STORE', 600)   -- 4 masas diamante
    ON CONFLICT (store_id, supply_id, level) 
    DO UPDATE SET minimum_grams = EXCLUDED.minimum_grams;
  END IF;

  -- Margaritas
  IF v_mg_id IS NOT NULL THEN
    INSERT INTO public.stock_minimums (id, store_id, supply_id, level, minimum_grams)
    VALUES
      (gen_random_uuid(), v_mg_id, '00000000-0000-0000-0002-000000000201', 'STORE', 6000), -- 10 masas familiares
      (gen_random_uuid(), v_mg_id, '00000000-0000-0000-0002-000000000202', 'STORE', 1800), -- 6 masas medianas
      (gen_random_uuid(), v_mg_id, '00000000-0000-0000-0002-000000000203', 'STORE', 600)   -- 4 masas diamante
    ON CONFLICT (store_id, supply_id, level) 
    DO UPDATE SET minimum_grams = EXCLUDED.minimum_grams;
  END IF;

  -- Centro de Produccion (PROCESSED)
  IF v_cp_id IS NOT NULL THEN
    INSERT INTO public.stock_minimums (id, store_id, supply_id, level, minimum_grams)
    VALUES
      (gen_random_uuid(), v_cp_id, '00000000-0000-0000-0002-000000000201', 'PROCESSED', 12000),
      (gen_random_uuid(), v_cp_id, '00000000-0000-0000-0002-000000000202', 'PROCESSED', 6000),
      (gen_random_uuid(), v_cp_id, '00000000-0000-0000-0002-000000000203', 'PROCESSED', 1500)
    ON CONFLICT (store_id, supply_id, level) 
    DO UPDATE SET minimum_grams = EXCLUDED.minimum_grams;
  END IF;
END $$;

COMMIT;
