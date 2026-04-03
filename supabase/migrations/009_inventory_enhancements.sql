-- ============================================================
-- 009: Inventory Module Enhancements
-- - purchases: add store_id + trigger to feed RAW inventory
-- - physical_counts: add worker_id
-- - validations: add worker_id, physical_count_id
-- - New tables: production_recipes, production_records, demand_estimates, daily_alerts
-- ============================================================

-- ==================== 1. MODIFY purchases ====================

ALTER TABLE purchases ADD COLUMN store_id UUID REFERENCES stores(id);

-- Backfill existing purchases to production center
UPDATE purchases SET store_id = (
  SELECT id FROM stores WHERE is_production_center = true LIMIT 1
);

ALTER TABLE purchases ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX idx_purchases_store ON purchases(store_id);

-- Trigger: auto-add purchase to RAW inventory
CREATE OR REPLACE FUNCTION add_purchase_to_raw_inventory()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
  VALUES (NEW.supply_id, NEW.store_id, 'RAW', NEW.quantity_grams)
  ON CONFLICT (supply_id, store_id, level)
  DO UPDATE SET quantity_grams = inventory.quantity_grams + NEW.quantity_grams,
               last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_add_purchase_to_inventory
  AFTER INSERT ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION add_purchase_to_raw_inventory();

-- ==================== 2. MODIFY physical_counts ====================

ALTER TABLE physical_counts ADD COLUMN worker_id UUID REFERENCES workers(id);

-- ==================== 3. MODIFY validations ====================

ALTER TABLE validations ADD COLUMN worker_id UUID REFERENCES workers(id);
ALTER TABLE validations ADD COLUMN physical_count_id UUID REFERENCES physical_counts(id);

-- ==================== 4. production_recipes ====================

CREATE TABLE production_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  name TEXT NOT NULL,
  output_grams NUMERIC NOT NULL,
  output_bags INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_recipe_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_recipe_id UUID NOT NULL REFERENCES production_recipes(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id),
  grams_required NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(production_recipe_id, supply_id)
);

-- ==================== 5. production_records ====================

CREATE TABLE production_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  worker_id UUID NOT NULL REFERENCES workers(id),
  production_recipe_id UUID NOT NULL REFERENCES production_recipes(id),
  batches INTEGER NOT NULL DEFAULT 1,
  total_grams_produced NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_record_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_record_id UUID NOT NULL REFERENCES production_records(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id),
  grams_consumed NUMERIC NOT NULL DEFAULT 0
);

-- ==================== 6. demand_estimates ====================

CREATE TABLE demand_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  product_id UUID NOT NULL REFERENCES products(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  estimated_portions INTEGER NOT NULL DEFAULT 0,
  UNIQUE(store_id, product_id, day_of_week)
);

-- ==================== 7. daily_alerts ====================

CREATE TABLE daily_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date DATE NOT NULL,
  physical_count_id UUID REFERENCES physical_counts(id),
  closing_worker_id UUID REFERENCES workers(id),
  count_worker_id UUID REFERENCES workers(id),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  theoretical_grams NUMERIC NOT NULL DEFAULT 0,
  real_grams NUMERIC NOT NULL DEFAULT 0,
  difference_grams NUMERIC NOT NULL DEFAULT 0,
  difference_percent NUMERIC NOT NULL DEFAULT 0,
  alert_type alert_type NOT NULL DEFAULT 'OK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==================== 8. INDEXES ====================

CREATE INDEX idx_production_records_store ON production_records(store_id, created_at);
CREATE INDEX idx_production_recipes_supply ON production_recipes(supply_id);
CREATE INDEX idx_demand_estimates_store_day ON demand_estimates(store_id, day_of_week);
CREATE INDEX idx_daily_alerts_store_date ON daily_alerts(store_id, date);

-- ==================== 9. RLS ====================

ALTER TABLE production_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_recipe_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_record_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_alerts ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated
CREATE POLICY "Authenticated read production_recipes" ON production_recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read production_recipe_inputs" ON production_recipe_inputs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read production_records" ON production_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read production_record_items" ON production_record_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read demand_estimates" ON demand_estimates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read daily_alerts" ON daily_alerts FOR SELECT TO authenticated USING (true);

-- Admin write for config tables
CREATE POLICY "Admin manage production_recipes" ON production_recipes FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin manage production_recipe_inputs" ON production_recipe_inputs FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin manage demand_estimates" ON demand_estimates FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin manage daily_alerts" ON daily_alerts FOR ALL TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');

-- Colaborador can insert production records (PREPARADOR does production)
CREATE POLICY "Authenticated insert production_records" ON production_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated insert production_record_items" ON production_record_items FOR INSERT TO authenticated WITH CHECK (true);

-- Update physical_counts policy to allow COLABORADOR to insert (CAJERO does physical count)
DROP POLICY IF EXISTS "Admin manage physical_counts" ON physical_counts;
CREATE POLICY "Authenticated insert physical_counts" ON physical_counts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin manage physical_counts" ON physical_counts FOR UPDATE TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin delete physical_counts" ON physical_counts FOR DELETE TO authenticated USING (get_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admin manage physical_count_items" ON physical_count_items;
CREATE POLICY "Authenticated insert physical_count_items" ON physical_count_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin manage physical_count_items" ON physical_count_items FOR UPDATE TO authenticated USING (get_user_role() = 'ADMIN') WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Admin delete physical_count_items" ON physical_count_items FOR DELETE TO authenticated USING (get_user_role() = 'ADMIN');

-- ==================== 10. SEED: Demand estimates for Local Principal (store 2) ====================

-- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday (JS Date convention)

-- LUNES (1)
INSERT INTO demand_estimates (store_id, product_id, day_of_week, estimated_portions) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 1, 25),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', 1, 19),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', 1, 9),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004', 1, 10),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005', 1, 6),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006', 1, 7),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007', 1, 4);

-- MARTES (2)
INSERT INTO demand_estimates (store_id, product_id, day_of_week, estimated_portions) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 2, 25),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', 2, 19),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', 2, 9),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004', 2, 10),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005', 2, 6),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006', 2, 7),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007', 2, 4);

-- MIERCOLES (3)
INSERT INTO demand_estimates (store_id, product_id, day_of_week, estimated_portions) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 3, 25),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', 3, 19),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', 3, 9),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004', 3, 10),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005', 3, 6),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006', 3, 7),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007', 3, 4);

-- JUEVES (4)
INSERT INTO demand_estimates (store_id, product_id, day_of_week, estimated_portions) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 4, 31),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', 4, 24),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', 4, 12),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004', 4, 12),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005', 4, 8),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006', 4, 9),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007', 4, 6);

-- VIERNES (5)
INSERT INTO demand_estimates (store_id, product_id, day_of_week, estimated_portions) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 5, 40),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', 5, 31),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', 5, 15),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004', 5, 16),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005', 5, 10),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006', 5, 11),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007', 5, 7);

-- SABADO (6)
INSERT INTO demand_estimates (store_id, product_id, day_of_week, estimated_portions) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 6, 49),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', 6, 38),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', 6, 19),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004', 6, 19),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005', 6, 12),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006', 6, 14),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007', 6, 9);

-- DOMINGO (0)
INSERT INTO demand_estimates (store_id, product_id, day_of_week, estimated_portions) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 0, 40),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002', 0, 31),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003', 0, 15),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004', 0, 16),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005', 0, 10),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006', 0, 11),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007', 0, 7);
