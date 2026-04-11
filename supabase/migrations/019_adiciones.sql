-- ============================================================
-- 019: Adiciones de pizza + Producto Pizza Diamante
-- - addition_catalog: catálogo de adiciones por formato
-- - sale_item_additions: adiciones compradas por sale_item
-- - sale_items.additions_total: total de adiciones por item
-- - Pizza Diamante como producto independiente (no formato)
-- - Actualiza deduct_inventory_for_sale para descontar adiciones
-- ============================================================

-- ==================== PARTE A: Tablas de adiciones ====================

-- 1. Catálogo de adiciones (por formato, no por producto)
CREATE TABLE addition_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  format_id UUID NOT NULL REFERENCES product_formats(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  grams INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supply_id, format_id)
);

CREATE INDEX idx_addition_catalog_format ON addition_catalog(format_id, is_active);

-- 2. Adiciones compradas por sale_item (snapshots para historial)
CREATE TABLE sale_item_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  addition_catalog_id UUID NOT NULL REFERENCES addition_catalog(id),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  grams INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_item_additions_item ON sale_item_additions(sale_item_id);

-- 3. Columna additions_total en sale_items
ALTER TABLE sale_items ADD COLUMN additions_total INTEGER NOT NULL DEFAULT 0;

-- 4. RLS
ALTER TABLE addition_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_item_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read addition_catalog"
  ON addition_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert addition_catalog"
  ON addition_catalog FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update addition_catalog"
  ON addition_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete addition_catalog"
  ON addition_catalog FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read sale_item_additions"
  ON sale_item_additions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert sale_item_additions"
  ON sale_item_additions FOR INSERT TO authenticated WITH CHECK (true);

-- ==================== PARTE B: Producto Pizza Diamante ====================

-- 5. Desactivar formato "Diamante" de las pizzas existentes (preserva historial)
UPDATE product_formats SET is_active = false
WHERE name = 'Diamante';

-- 6. Crear producto Pizza Diamante
INSERT INTO products (id, name, category, is_active, has_recipe)
VALUES ('00000000-0000-0000-0001-000000000100', 'Pizza Diamante', 'PIZZA', true, true)
ON CONFLICT DO NOTHING;

-- 7. Crear formato "Base" para Pizza Diamante (1 unidad = fisicamente 2 porciones normales)
INSERT INTO product_formats (product_id, name, portions, price, is_active, sort_order)
VALUES ('00000000-0000-0000-0001-000000000100', 'Diamante', 1, 15800, true, 1);

-- 8. Receta base de la Diamante (2x gramaje normal porque fisicamente es doble)
INSERT INTO recipes (id, product_id)
VALUES ('00000000-0000-0000-0003-000000000100', '00000000-0000-0000-0001-000000000100')
ON CONFLICT DO NOTHING;

INSERT INTO recipe_ingredients (recipe_id, supply_id, grams_per_portion)
VALUES
  -- Masa: 75.2g * 2 = 150.4g por unidad Diamante
  ('00000000-0000-0000-0003-000000000100', '00000000-0000-0000-0002-000000000001', 150.4),
  -- Queso: 39.1g * 2 = 78.2g por unidad Diamante
  ('00000000-0000-0000-0003-000000000100', '00000000-0000-0000-0002-000000000002', 78.2),
  -- Salsa Napolitana: 50g * 2 = 100g por unidad Diamante
  ('00000000-0000-0000-0003-000000000100', '00000000-0000-0000-0002-000000000003', 100);

-- 9. Asignar Pizza Diamante a todas las sedes activas
INSERT INTO product_store_assignments (product_id, store_id)
SELECT '00000000-0000-0000-0001-000000000100', s.id
FROM stores s WHERE s.is_active = true
ON CONFLICT DO NOTHING;

-- ==================== PARTE C: Nuevos supplies para adiciones ====================

-- 10. Supplies que no existían y se necesitan como adición
INSERT INTO supplies (id, name, unit, grams_per_bag) VALUES
  ('00000000-0000-0000-0002-000000000021', 'Jalapeño', 'GRAMOS', 500),
  ('00000000-0000-0000-0002-000000000022', 'Aceitunas', 'GRAMOS', 500),
  ('00000000-0000-0000-0002-000000000023', 'Tomate Pico de Gallo', 'GRAMOS', 1000),
  ('00000000-0000-0000-0002-000000000024', 'Pimentón Cebolla Cilantro', 'GRAMOS', 1000),
  ('00000000-0000-0000-0002-000000000025', 'Salsa de Ajo', 'GRAMOS', 600),
  ('00000000-0000-0000-0002-000000000026', 'Miel Picante', 'GRAMOS', 600),
  ('00000000-0000-0000-0002-000000000027', 'Pimienta Cayena', 'GRAMOS', 200),
  ('00000000-0000-0000-0002-000000000028', 'Atún', 'GRAMOS', 500)
ON CONFLICT DO NOTHING;

-- ==================== PARTE D: Poblar catálogo de adiciones ====================

-- 11. Adiciones para TODOS los formatos de pizzas normales (no Diamante)
-- Precio y gramos iguales para Individual, Mediana, Familiar
INSERT INTO addition_catalog (supply_id, format_id, name, price, grams, sort_order)
SELECT s.supply_id, pf.id, s.add_name, s.price, s.grams, s.sort_order
FROM (VALUES
  ('00000000-0000-0000-0002-000000000002'::UUID, 'Extra Queso',                    2000, 39,  1),
  ('00000000-0000-0000-0002-000000000003'::UUID, 'Extra Salsa Napolitana',         1000, 50,  2),
  ('00000000-0000-0000-0002-000000000004'::UUID, 'Extra Jamón',                    2000, 17,  3),
  ('00000000-0000-0000-0002-000000000008'::UUID, 'Extra Pechuga',                  2000, 13,  4),
  ('00000000-0000-0000-0002-000000000005'::UUID, 'Extra Tocineta',                 2000, 31,  5),
  ('00000000-0000-0000-0002-000000000007'::UUID, 'Extra Pepperoni',                2000, 31,  6),
  ('00000000-0000-0000-0002-000000000006'::UUID, 'Extra Piña',                     1000, 27,  7),
  ('00000000-0000-0000-0002-000000000009'::UUID, 'Extra Champiñones',              2000, 31,  8),
  ('00000000-0000-0000-0002-000000000020'::UUID, 'Extra Maicitos',                 1000, 40,  9),
  ('00000000-0000-0000-0002-000000000021'::UUID, 'Extra Jalapeño',                 1000, 25, 10),
  ('00000000-0000-0000-0002-000000000022'::UUID, 'Extra Aceitunas',                2000, 19, 11),
  ('00000000-0000-0000-0002-000000000012'::UUID, 'Extra Carne Molida',             2000, 25, 12),
  ('00000000-0000-0000-0002-000000000023'::UUID, 'Extra Tomate Pico de Gallo',     1000, 42, 13),
  ('00000000-0000-0000-0002-000000000024'::UUID, 'Extra Pimentón Cebolla Cilantro',1000, 42, 14),
  ('00000000-0000-0000-0002-000000000013'::UUID, 'Extra Guacamole',                1000, 42, 15),
  ('00000000-0000-0000-0002-000000000025'::UUID, 'Extra Salsa de Ajo',             1000, 10, 16),
  ('00000000-0000-0000-0002-000000000017'::UUID, 'Extra Salsa de Jalapeño',        1000, 50, 17),
  ('00000000-0000-0000-0002-000000000016'::UUID, 'Extra Salsa de Albahaca',        1000, 50, 18),
  ('00000000-0000-0000-0002-000000000026'::UUID, 'Extra Miel Picante',             1000, 50, 19),
  ('00000000-0000-0000-0002-000000000027'::UUID, 'Extra Pimienta Cayena',          1000, 50, 20),
  ('00000000-0000-0000-0002-000000000028'::UUID, 'Extra Atún',                     2000, 25, 21)
) AS s(supply_id, add_name, price, grams, sort_order)
CROSS JOIN product_formats pf
WHERE pf.is_active = true
  AND pf.product_id != '00000000-0000-0000-0001-000000000100';

-- 12. Adiciones para formato Diamante (precio y gramos diferentes)
INSERT INTO addition_catalog (supply_id, format_id, name, price, grams, sort_order)
SELECT s.supply_id, pf.id, s.add_name, s.price, s.grams, s.sort_order
FROM (VALUES
  ('00000000-0000-0000-0002-000000000002'::UUID, 'Extra Queso',                    3000, 78,  1),
  ('00000000-0000-0000-0002-000000000003'::UUID, 'Extra Salsa Napolitana',         1500,100,  2),
  ('00000000-0000-0000-0002-000000000004'::UUID, 'Extra Jamón',                    3000, 35,  3),
  ('00000000-0000-0000-0002-000000000008'::UUID, 'Extra Pechuga',                  3000, 25,  4),
  ('00000000-0000-0000-0002-000000000005'::UUID, 'Extra Tocineta',                 3000, 63,  5),
  ('00000000-0000-0000-0002-000000000007'::UUID, 'Extra Pepperoni',                3000, 63,  6),
  ('00000000-0000-0000-0002-000000000006'::UUID, 'Extra Piña',                     1500, 53,  7),
  ('00000000-0000-0000-0002-000000000009'::UUID, 'Extra Champiñones',              3000, 63,  8),
  ('00000000-0000-0000-0002-000000000020'::UUID, 'Extra Maicitos',                 1500, 80,  9),
  ('00000000-0000-0000-0002-000000000021'::UUID, 'Extra Jalapeño',                 1500, 50, 10),
  ('00000000-0000-0000-0002-000000000022'::UUID, 'Extra Aceitunas',                3000, 38, 11),
  ('00000000-0000-0000-0002-000000000012'::UUID, 'Extra Carne Molida',             3000, 50, 12),
  ('00000000-0000-0000-0002-000000000023'::UUID, 'Extra Tomate Pico de Gallo',     1500, 83, 13),
  ('00000000-0000-0000-0002-000000000024'::UUID, 'Extra Pimentón Cebolla Cilantro',1500, 83, 14),
  ('00000000-0000-0000-0002-000000000013'::UUID, 'Extra Guacamole',                1500, 83, 15),
  ('00000000-0000-0000-0002-000000000025'::UUID, 'Extra Salsa de Ajo',             1500, 21, 16),
  ('00000000-0000-0000-0002-000000000017'::UUID, 'Extra Salsa de Jalapeño',        1500,100, 17),
  ('00000000-0000-0000-0002-000000000016'::UUID, 'Extra Salsa de Albahaca',        1500,100, 18),
  ('00000000-0000-0000-0002-000000000026'::UUID, 'Extra Miel Picante',             1500,100, 19),
  ('00000000-0000-0000-0002-000000000027'::UUID, 'Extra Pimienta Cayena',          1500,100, 20),
  ('00000000-0000-0000-0002-000000000028'::UUID, 'Extra Atún',                     3000, 50, 21)
) AS s(supply_id, add_name, price, grams, sort_order)
CROSS JOIN product_formats pf
WHERE pf.product_id = '00000000-0000-0000-0001-000000000100';

-- ==================== PARTE E: Actualizar RPC ====================

-- 13. Actualizar RPC para descontar adiciones
CREATE OR REPLACE FUNCTION deduct_inventory_for_sale(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  v_store_id UUID;
  item RECORD;
  ingredient RECORD;
  addition RECORD;
  recipe_id_val UUID;
BEGIN
  SELECT store_id INTO v_store_id FROM sales WHERE id = p_sale_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada: %', p_sale_id;
  END IF;

  FOR item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    -- Descontar ingredientes de receta base
    SELECT r.id INTO recipe_id_val
    FROM recipes r WHERE r.product_id = item.product_id;

    IF recipe_id_val IS NOT NULL THEN
      FOR ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = recipe_id_val
      LOOP
        UPDATE inventory
        SET quantity_grams = quantity_grams - (ingredient.grams_per_portion * item.portions),
            last_updated = now()
        WHERE supply_id = ingredient.supply_id
          AND store_id = v_store_id
          AND level = 'STORE';
      END LOOP;
    END IF;

    -- Descontar adiciones
    FOR addition IN
      SELECT sia.supply_id, sia.grams, sia.quantity
      FROM sale_item_additions sia
      WHERE sia.sale_item_id = item.id
    LOOP
      UPDATE inventory
      SET quantity_grams = quantity_grams - (addition.grams * addition.quantity),
          last_updated = now()
      WHERE supply_id = addition.supply_id
        AND store_id = v_store_id
        AND level = 'STORE';
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== PARTE F: Stock mínimos para adiciones ====================

-- 14. Mínimos de 5 unidades por supply de adición en cada sede (nivel STORE)
-- Usa los grams de pizzas normales (no Diamante) como referencia
-- ON CONFLICT actualiza si ya existe un mínimo para ese supply/store/level
INSERT INTO stock_minimums (supply_id, store_id, level, minimum_grams)
SELECT DISTINCT s.supply_id, st.id, 'STORE', s.grams * 5
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
