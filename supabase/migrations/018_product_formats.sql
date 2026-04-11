-- ============================================================
-- 018: Catálogo de productos dinámico
-- - product_formats: reemplaza product_prices (formatos parametrizables por producto)
-- - product_store_assignments: disponibilidad por sede
-- - products.has_recipe: indica si el producto consume inventario STORE
-- - sale_items: añade format_id y format_name (backwards compat con size)
-- ============================================================

-- 1. Tabla de formatos (reemplaza product_prices)
CREATE TABLE product_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  portions INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, name)
);

CREATE INDEX idx_product_formats_product ON product_formats(product_id);

-- 2. Poblar desde product_prices existente
INSERT INTO product_formats (product_id, name, portions, price, sort_order, created_at)
SELECT
  product_id,
  CASE size
    WHEN 'INDIVIDUAL' THEN 'Individual'
    WHEN 'DIAMANTE'   THEN 'Diamante'
    WHEN 'MEDIANA'    THEN 'Mediana'
    WHEN 'FAMILIAR'   THEN 'Familiar'
  END AS name,
  CASE size
    WHEN 'FAMILIAR'   THEN 8
    WHEN 'MEDIANA'    THEN 4
    WHEN 'DIAMANTE'   THEN 2
    WHEN 'INDIVIDUAL' THEN 1
  END AS portions,
  price,
  CASE size
    WHEN 'INDIVIDUAL' THEN 1
    WHEN 'DIAMANTE'   THEN 2
    WHEN 'MEDIANA'    THEN 3
    WHEN 'FAMILIAR'   THEN 4
  END AS sort_order,
  created_at
FROM product_prices;

-- 3. Flag has_recipe en products
ALTER TABLE products ADD COLUMN has_recipe BOOLEAN NOT NULL DEFAULT false;
UPDATE products SET has_recipe = true WHERE category = 'PIZZA';

-- 4. Columnas format_id y format_name en sale_items (nullable para backwards compat)
ALTER TABLE sale_items ADD COLUMN format_id UUID REFERENCES product_formats(id);
ALTER TABLE sale_items ADD COLUMN format_name TEXT;

-- 5. Disponibilidad por sede
CREATE TABLE product_store_assignments (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (product_id, store_id)
);

CREATE INDEX idx_psa_store ON product_store_assignments(store_id, is_active);

-- Poblar: todos los productos activos en todos los locales activos (backwards compat)
INSERT INTO product_store_assignments (product_id, store_id)
SELECT p.id, s.id
FROM products p
CROSS JOIN stores s
WHERE p.is_active = true AND s.is_active = true;

-- 6. RLS
ALTER TABLE product_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_store_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read product_formats"
  ON product_formats FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage product_formats"
  ON product_formats FOR ALL TO authenticated
  USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');

CREATE POLICY "Authenticated read product_store_assignments"
  ON product_store_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage product_store_assignments"
  ON product_store_assignments FOR ALL TO authenticated
  USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
