-- Migration 074: Depuracion de insumos, remapeo de adiciones y alineacion del inventario en Centro de Produccion
BEGIN;

-- ==============================================================================
-- 1. REMAPEAR ADICIONES (addition_catalog) A INSUMOS PROCESADOS VIGENTES
-- ==============================================================================

-- Extra Jamon -> Jamon Bolsa
UPDATE public.addition_catalog
SET supply_id = (SELECT id FROM public.supplies WHERE name = 'Jamon Bolsa' LIMIT 1)
WHERE name = 'Extra Jamón';

-- Extra Piña -> Piña Calada Bolsa
UPDATE public.addition_catalog
SET supply_id = (SELECT id FROM public.supplies WHERE name = 'Piña Calada Bolsa' LIMIT 1)
WHERE name = 'Extra Piña';

-- Extra Queso -> Queso Caja
UPDATE public.addition_catalog
SET supply_id = (SELECT id FROM public.supplies WHERE name = 'Queso Caja' LIMIT 1)
WHERE name = 'Extra Queso';

-- Extra Aceitunas -> Aceitunas producidas
UPDATE public.addition_catalog
SET supply_id = (SELECT id FROM public.supplies WHERE name = 'Aceitunas producidas' LIMIT 1)
WHERE name = 'Extra Aceitunas';

-- Extra Pimenton Cebolla Cilantro -> Pimentón producido
UPDATE public.addition_catalog
SET supply_id = (SELECT id FROM public.supplies WHERE name = 'Pimentón producido' LIMIT 1)
WHERE name ILIKE '%Pimentón%';


-- ==============================================================================
-- 2. RECLASIFICAR CATEGORIAS DE INSUMOS ACTIVOS (COHERENCIA 100%)
-- ==============================================================================

-- Materias primas de cocina / preparacion que estaban como PROCESSED
UPDATE public.supplies
SET category = 'RAW'
WHERE name IN (
  'Sal',
  'Sal de Ajo',
  'Pimienta negra (molida)',
  'Pimienta Cayena',
  'Tomillo Molido',
  'Vinagre',
  'Vinagre balsamico',
  'Soda (300 ml)'
);

-- Bolsas de empaque y porcionado que estaban como RAW o PROCESSED
UPDATE public.supplies
SET category = 'OPERATIVE'
WHERE name IN (
  'Bolsa 2 kilos',
  'Bolsa 3 Kilos',
  'Bolsa resellable (grand)',
  'Bolsa resellable (med)',
  'Bolsa resellable (Pequeña)'
);


-- ==============================================================================
-- 3. ARCHIVAR INSUMOS OBSOLETOS E INACTIVOS Y SANEAR SALDOS RESIDUALES
-- ==============================================================================

-- Marcar inactivos los insumos obsoletos
UPDATE public.supplies
SET is_active = false
WHERE id IN (
  '00000000-0000-0000-0002-000000000101', -- Caja Familiar
  '00000000-0000-0000-0002-000000000102', -- Caja Mediana
  '00000000-0000-0000-0002-000000000103', -- Empaque Diamante/Individual
  '00000000-0000-0000-0002-000000000006', -- Piña 106g
  '00000000-0000-0000-0002-000000000022', -- Aceitunas 72g
  '00000000-0000-0000-0002-000000000024', -- Pimentón Cebolla Cilantro
  '00000000-0000-0000-0002-000000000004', -- Jamon Bloque viejo
  'b70d95f0-8ac8-4708-a9cf-b2ec39f52151', -- Jamón Tajado Totto
  '0d020e82-2d96-4c69-8b63-edd9caae28f3', -- Pico de gallo
  '00000000-0000-0000-0002-000000000023', -- Tomate Pico de Gallo
  '00000000-0000-0000-0002-000000000025', -- Salsa de Ajo
  '00000000-0000-0000-0002-000000000026', -- Miel Picante
  'ba73793e-a989-4726-b2c7-f247d94caf9c'  -- Aceite de Orujo
);

-- Neutralizar saldos negativos residuales de insumos obsoletos
UPDATE public.inventory
SET quantity_grams = 0, last_updated = now()
WHERE supply_id IN (
  '00000000-0000-0000-0002-000000000101',
  '00000000-0000-0000-0002-000000000102',
  '00000000-0000-0000-0002-000000000103',
  '00000000-0000-0000-0002-000000000006',
  '00000000-0000-0000-0002-000000000022',
  '00000000-0000-0000-0002-000000000024',
  '00000000-0000-0000-0002-000000000004',
  'b70d95f0-8ac8-4708-a9cf-b2ec39f52151',
  '0d020e82-2d96-4c69-8b63-edd9caae28f3',
  '00000000-0000-0000-0002-000000000023',
  '00000000-0000-0000-0002-000000000025',
  '00000000-0000-0000-0002-000000000026',
  'ba73793e-a989-4726-b2c7-f247d94caf9c'
) AND quantity_grams < 0;


-- ==============================================================================
-- 4. ACTUALIZAR TRIGGER DE COMPRAS (add_purchase_to_raw_inventory)
-- ==============================================================================
CREATE OR REPLACE FUNCTION add_purchase_to_raw_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_supply_category TEXT;
  v_target_level TEXT;
BEGIN
  SELECT category INTO v_supply_category FROM public.supplies WHERE id = NEW.supply_id;
  
  -- Si el insumo es OPERATIVE (cajas, bolsas, etc.) o PROCESSED (bebidas), entra a PROCESSED para despachos
  IF v_supply_category IN ('OPERATIVE', 'PROCESSED') THEN
    v_target_level := 'PROCESSED';
  ELSE
    v_target_level := 'RAW';
  END IF;

  INSERT INTO public.inventory (supply_id, store_id, level, quantity_grams, last_updated)
  VALUES (NEW.supply_id, NEW.store_id, v_target_level, NEW.quantity_grams, now())
  ON CONFLICT (supply_id, store_id, level)
  DO UPDATE SET 
    quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
    last_updated = now();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==============================================================================
-- 5. UNIFICAR SALDOS DE EMPAQUES (OPERATIVE) EN EL CENTRO DE PRODUCCIÓN
-- ==============================================================================
DO $$
DECLARE
  v_cp_id UUID;
  rec RECORD;
BEGIN
  SELECT id INTO v_cp_id FROM public.stores WHERE is_production_center = true LIMIT 1;

  IF v_cp_id IS NOT NULL THEN
    -- Mover los saldos atrapados en RAW hacia PROCESSED para insumos OPERATIVE
    FOR rec IN (
      SELECT inv.supply_id, inv.quantity_grams
      FROM public.inventory inv
      JOIN public.supplies s ON s.id = inv.supply_id
      WHERE inv.store_id = v_cp_id
        AND inv.level = 'RAW'
        AND s.category IN ('OPERATIVE', 'PROCESSED')
        AND inv.quantity_grams > 0
    ) LOOP
      -- Sumar al nivel PROCESSED
      INSERT INTO public.inventory (store_id, supply_id, level, quantity_grams, last_updated)
      VALUES (v_cp_id, rec.supply_id, 'PROCESSED', rec.quantity_grams, now())
      ON CONFLICT (supply_id, store_id, level)
      DO UPDATE SET
        quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
        last_updated = now();

      -- Poner en 0 el nivel RAW
      UPDATE public.inventory
      SET quantity_grams = 0, last_updated = now()
      WHERE store_id = v_cp_id
        AND supply_id = rec.supply_id
        AND level = 'RAW';
    END LOOP;
  END IF;
END $$;

COMMIT;
