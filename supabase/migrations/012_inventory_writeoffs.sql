-- ============================================================
-- 012: Inventory Write-offs (Bajas de Inventario)
-- ============================================================

-- Enum for writeoff status
CREATE TYPE writeoff_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Enum for writeoff reason
CREATE TYPE writeoff_reason AS ENUM (
  'DAMAGED',
  'EXPIRED',
  'SPILLED',
  'CONTAMINATED',
  'OTHER'
);

-- Main table
CREATE TABLE inventory_writeoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  level inventory_level NOT NULL DEFAULT 'STORE',
  quantity_grams NUMERIC NOT NULL CHECK (quantity_grams > 0),
  reason writeoff_reason NOT NULL DEFAULT 'OTHER',
  notes TEXT NOT NULL DEFAULT '',
  status writeoff_status NOT NULL DEFAULT 'PENDING',
  requested_by UUID NOT NULL REFERENCES workers(id),
  reviewed_by UUID REFERENCES workers(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_writeoffs_store_status ON inventory_writeoffs(store_id, status);
CREATE INDEX idx_writeoffs_store_date ON inventory_writeoffs(store_id, created_at);
CREATE INDEX idx_writeoffs_supply ON inventory_writeoffs(supply_id);

-- RLS
ALTER TABLE inventory_writeoffs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated read writeoffs"
  ON inventory_writeoffs FOR SELECT TO authenticated USING (true);

-- All authenticated users can create writeoff requests
CREATE POLICY "Authenticated insert writeoffs"
  ON inventory_writeoffs FOR INSERT TO authenticated WITH CHECK (true);

-- Only admin can approve/reject (update)
CREATE POLICY "Admin update writeoffs"
  ON inventory_writeoffs FOR UPDATE TO authenticated
  USING (get_user_role() = 'ADMIN')
  WITH CHECK (get_user_role() = 'ADMIN');
