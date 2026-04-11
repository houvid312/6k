-- ============================================================
-- 020: Stock mínimos para supplies de adiciones
-- 5 unidades mínimas por cada supply de adición en cada sede
-- ============================================================

INSERT INTO stock_minimums (supply_id, store_id, level, minimum_grams)
SELECT DISTINCT s.supply_id, st.id, 'STORE'::inventory_level, s.grams * 5
FROM (VALUES
  ('00000000-0000-0000-0002-000000000002'::UUID, 39),   -- Queso
  ('00000000-0000-0000-0002-000000000003'::UUID, 50),   -- Salsa Napolitana
  ('00000000-0000-0000-0002-000000000004'::UUID, 17),   -- Jamon
  ('00000000-0000-0000-0002-000000000008'::UUID, 13),   -- Pechuga
  ('00000000-0000-0000-0002-000000000005'::UUID, 31),   -- Tocineta
  ('00000000-0000-0000-0002-000000000007'::UUID, 31),   -- Pepperoni
  ('00000000-0000-0000-0002-000000000006'::UUID, 27),   -- Piña
  ('00000000-0000-0000-0002-000000000009'::UUID, 31),   -- Champiñones
  ('00000000-0000-0000-0002-000000000020'::UUID, 40),   -- Maicitos
  ('00000000-0000-0000-0002-000000000021'::UUID, 25),   -- Jalapeño
  ('00000000-0000-0000-0002-000000000022'::UUID, 19),   -- Aceitunas
  ('00000000-0000-0000-0002-000000000012'::UUID, 25),   -- Carne Molida
  ('00000000-0000-0000-0002-000000000023'::UUID, 42),   -- Tomate Pico de Gallo
  ('00000000-0000-0000-0002-000000000024'::UUID, 42),   -- Pimentón Cebolla Cilantro
  ('00000000-0000-0000-0002-000000000013'::UUID, 42),   -- Guacamole
  ('00000000-0000-0000-0002-000000000025'::UUID, 10),   -- Salsa de Ajo
  ('00000000-0000-0000-0002-000000000017'::UUID, 50),   -- Salsa de Jalapeño
  ('00000000-0000-0000-0002-000000000016'::UUID, 50),   -- Salsa de Albahaca
  ('00000000-0000-0000-0002-000000000026'::UUID, 50),   -- Miel Picante
  ('00000000-0000-0000-0002-000000000027'::UUID, 50),   -- Pimienta Cayena
  ('00000000-0000-0000-0002-000000000028'::UUID, 25)    -- Atún
) AS s(supply_id, grams)
CROSS JOIN stores st
WHERE st.is_active = true
ON CONFLICT (supply_id, store_id, level)
DO UPDATE SET minimum_grams = GREATEST(stock_minimums.minimum_grams, EXCLUDED.minimum_grams);
