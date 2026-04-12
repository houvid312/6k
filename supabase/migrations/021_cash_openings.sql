-- Fase 2: Cash openings (apertura de caja)
CREATE TABLE IF NOT EXISTS cash_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date TEXT NOT NULL,
  denominations JSONB NOT NULL DEFAULT '{}',
  total INTEGER NOT NULL DEFAULT 0,
  opened_by UUID REFERENCES workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);

-- RLS
ALTER TABLE cash_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON cash_openings
  FOR ALL USING (true) WITH CHECK (true);
