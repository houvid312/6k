-- Porciones disponibles por turno/día por producto por tienda
CREATE TABLE IF NOT EXISTS shift_portions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  product_id UUID NOT NULL REFERENCES products(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  portions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id, date)
);

CREATE INDEX idx_shift_portions_store_date ON shift_portions(store_id, date);

-- RLS
ALTER TABLE shift_portions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read shift_portions" ON shift_portions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated manage shift_portions" ON shift_portions
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
