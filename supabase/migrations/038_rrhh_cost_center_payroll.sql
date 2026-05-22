-- RRHH by cost center: assignments, multi-shift attendance, payroll snapshots and debt payments.

CREATE TABLE IF NOT EXISTS worker_store_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worker_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_store_assignments_store
  ON worker_store_assignments(store_id, worker_id);

INSERT INTO worker_store_assignments (worker_id, store_id, is_primary)
SELECT w.id, s.id, s.is_production_center
FROM workers w
CROSS JOIN stores s
WHERE w.is_active = true
  AND s.is_active = true
ON CONFLICT (worker_id, store_id) DO NOTHING;

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_schedules_store_worker_day
  ON schedules(store_id, worker_id, day_of_week);

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_unplanned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'RECORDED';

CREATE INDEX IF NOT EXISTS idx_attendance_store_date
  ON attendance(store_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_schedule_date
  ON attendance(schedule_id, date)
  WHERE schedule_id IS NOT NULL;

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS total_gross INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deductions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_net INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE payroll_periods
  ALTER COLUMN status SET DEFAULT 'BORRADOR';

UPDATE payroll_periods
SET status = CASE status
  WHEN 'ABIERTO' THEN 'BORRADOR'
  WHEN 'CERRADO' THEN 'CERRADA'
  WHEN 'PAGADO' THEN 'PAGADA'
  ELSE status
END;

UPDATE payroll_periods
SET store_id = (SELECT id FROM stores WHERE is_production_center = true LIMIT 1)
WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_periods_store_type_range
  ON payroll_periods(store_id, period_type, start_date, end_date)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_periods_store_status
  ON payroll_periods(store_id, status);

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS hourly_rate INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_debt INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debt_deduction INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debt_credit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attendance_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE payroll_entries pe
SET store_id = pp.store_id
FROM payroll_periods pp
WHERE pe.period_id = pp.id
  AND pe.store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period
  ON payroll_entries(period_id);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_store_worker
  ON payroll_entries(store_id, worker_id);

CREATE TABLE IF NOT EXISTS credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_entry_id UUID NOT NULL REFERENCES credit_entries(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE SET NULL,
  payroll_entry_id UUID REFERENCES payroll_entries(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'PAYROLL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_payments_store_date
  ON credit_payments(store_id, date);

CREATE INDEX IF NOT EXISTS idx_credit_payments_credit
  ON credit_payments(credit_entry_id);

ALTER TABLE worker_store_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage worker_store_assignments" ON worker_store_assignments;
DROP POLICY IF EXISTS "Authenticated read worker_store_assignments" ON worker_store_assignments;
CREATE POLICY "Admin manage worker_store_assignments"
  ON worker_store_assignments FOR ALL TO authenticated
  USING (get_user_role() = 'ADMIN')
  WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read worker_store_assignments"
  ON worker_store_assignments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manage credit_payments" ON credit_payments;
DROP POLICY IF EXISTS "Authenticated read credit_payments" ON credit_payments;
CREATE POLICY "Admin manage credit_payments"
  ON credit_payments FOR ALL TO authenticated
  USING (get_user_role() = 'ADMIN')
  WITH CHECK (get_user_role() = 'ADMIN');
CREATE POLICY "Authenticated read credit_payments"
  ON credit_payments FOR SELECT TO authenticated
  USING (true);
