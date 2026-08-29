-- ============================================================
-- 088: Unificar catálogo de adiciones con insumos procesados activos
-- y asegurar adiciones para formatos Media Familiar y Media Mediana
-- ============================================================

-- 1. Actualizar Queso RAW a Queso Caja PROCESSED
UPDATE addition_catalog
SET supply_id = '1a3a180b-1984-4077-ab06-d80474f8aa48', price = 2500, grams = 39
WHERE supply_id = '00000000-0000-0000-0002-000000000002';

-- 2. Actualizar Jamón Bloque RAW a Jamon Bolsa PROCESSED
UPDATE addition_catalog
SET supply_id = 'a8d18486-d904-4045-89c0-fd90038c1fb9', price = 2500, grams = 17
WHERE supply_id = '00000000-0000-0000-0002-000000000004';

-- 3. Actualizar Piña RAW a Piña Calada Bolsa PROCESSED
UPDATE addition_catalog
SET supply_id = 'a594e8d0-67f2-481c-acc4-f093c74e28ad', price = 1500, grams = 27
WHERE supply_id = '00000000-0000-0000-0002-000000000006';

-- 4. Actualizar Pollo RAW a Pollo Bolsa PROCESSED
UPDATE addition_catalog
SET supply_id = '37850381-d932-4188-9f63-fad110bd8628', name = 'Extra Pollo', price = 2500, grams = 13
WHERE supply_id = '00000000-0000-0000-0002-000000000008';

-- 5. Actualizar Aceitunas RAW a Aceitunas producidas PROCESSED
UPDATE addition_catalog
SET supply_id = '71d0aaf8-86c3-4442-8126-13ac5bcdf1ee', price = 2000, grams = 19
WHERE supply_id = '00000000-0000-0000-0002-000000000022';

-- 6. Actualizar Pimentón RAW a Pimentón producido PROCESSED
UPDATE addition_catalog
SET supply_id = '77cfb560-19e6-4617-a7c0-69307454b876', price = 1000, grams = 42
WHERE supply_id = '00000000-0000-0000-0002-000000000024';

-- 7. Actualizar precios estándar en formatos normales
UPDATE addition_catalog
SET price = 2500
WHERE supply_id IN (
  '00000000-0000-0000-0002-000000000007', -- Pepperoni
  '00000000-0000-0000-0002-000000000005', -- Tocineta
  '00000000-0000-0000-0002-000000000009'  -- Champiñones
) AND format_id IN (
  SELECT id FROM product_formats WHERE name NOT ILIKE '%diamante%'
);

-- 8. Insertar adiciones faltantes para cualquier formato activo de Pizza
INSERT INTO addition_catalog (supply_id, format_id, name, price, grams, sort_order)
SELECT s.supply_id, pf.id, s.add_name, s.price, s.grams, s.sort_order
FROM (VALUES
  ('1a3a180b-1984-4077-ab06-d80474f8aa48'::UUID, 'Extra Queso',                    2500, 39,  1),
  ('00000000-0000-0000-0002-000000000003'::UUID, 'Extra Salsa Napolitana',         1000, 50,  2),
  ('a8d18486-d904-4045-89c0-fd90038c1fb9'::UUID, 'Extra Jamón',                    2500, 17,  3),
  ('37850381-d932-4188-9f63-fad110bd8628'::UUID, 'Extra Pollo',                    2500, 13,  4),
  ('00000000-0000-0000-0002-000000000005'::UUID, 'Extra Tocineta',                 2500, 31,  5),
  ('00000000-0000-0000-0002-000000000007'::UUID, 'Extra Pepperoni',                2500, 31,  6),
  ('a594e8d0-67f2-481c-acc4-f093c74e28ad'::UUID, 'Extra Piña',                     1500, 27,  7),
  ('00000000-0000-0000-0002-000000000009'::UUID, 'Extra Champiñones',              2500, 31,  8),
  ('00000000-0000-0000-0002-000000000020'::UUID, 'Extra Maicitos',                 1000, 40,  9),
  ('00000000-0000-0000-0002-000000000021'::UUID, 'Extra Jalapeño',                 1000, 25, 10),
  ('71d0aaf8-86c3-4442-8126-13ac5bcdf1ee'::UUID, 'Extra Aceitunas',                2000, 19, 11),
  ('00000000-0000-0000-0002-000000000012'::UUID, 'Extra Carne Molida',             2000, 25, 12),
  ('00000000-0000-0000-0002-000000000023'::UUID, 'Extra Tomate Pico de Gallo',     1000, 42, 13),
  ('77cfb560-19e6-4617-a7c0-69307454b876'::UUID, 'Extra Pimentón Cebolla Cilantro',1000, 42, 14),
  ('00000000-0000-0000-0002-000000000013'::UUID, 'Extra Guacamole',                1000, 42, 15),
  ('00000000-0000-0000-0002-000000000025'::UUID, 'Extra Salsa de Ajo',             1000, 10, 16),
  ('00000000-0000-0000-0002-000000000017'::UUID, 'Extra Salsa de Jalapeño',        1000, 50, 17),
  ('00000000-0000-0000-0002-000000000016'::UUID, 'Extra Salsa de Albahaca',        1000, 50, 18),
  ('00000000-0000-0000-0002-000000000026'::UUID, 'Extra Miel Picante',             1000, 50, 19),
  ('00000000-0000-0000-0002-000000000027'::UUID, 'Extra Pimienta Cayena',          1000, 50, 20),
  ('00000000-0000-0000-0002-000000000028'::UUID, 'Extra Atún',                     2000, 25, 21)
) AS s(supply_id, add_name, price, grams, sort_order)
CROSS JOIN product_formats pf
JOIN products p ON pf.product_id = p.id
WHERE pf.is_active = true
  AND p.category = 'PIZZA'
  AND pf.name NOT ILIKE '%diamante%'
ON CONFLICT (supply_id, format_id) DO UPDATE
SET name = EXCLUDED.name,
    price = EXCLUDED.price,
    grams = EXCLUDED.grams,
    sort_order = EXCLUDED.sort_order;
