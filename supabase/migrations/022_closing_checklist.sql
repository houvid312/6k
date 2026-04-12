-- Fase 3 V9: Checklist de aseo en cierre de caja
CREATE TABLE IF NOT EXISTS closing_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS closing_checklist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_closing_id UUID NOT NULL REFERENCES cash_closings(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES closing_checklist_items(id),
  status TEXT NOT NULL DEFAULT 'OK', -- OK, BAJO, AGOTADO
  notes TEXT DEFAULT '',
  UNIQUE(cash_closing_id, checklist_item_id)
);

-- RLS
ALTER TABLE closing_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON closing_checklist_items
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE closing_checklist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON closing_checklist_entries
  FOR ALL USING (true) WITH CHECK (true);

-- Seed data
INSERT INTO closing_checklist_items (name, sort_order) VALUES
  ('Jabon', 1),
  ('Papel higienico', 2),
  ('Desinfectante', 3),
  ('Bolsas de basura', 4),
  ('Servilletas', 5),
  ('Trapos de limpieza', 6);
