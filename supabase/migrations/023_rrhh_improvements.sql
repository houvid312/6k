-- Fase 5: RRHH Improvements (H1-H6)

-- H4: Clock in/out columns on attendance
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES workers(id);

-- H5: Payroll periods
CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL DEFAULT 'SEMANAL', -- SEMANAL, QUINCENAL, MENSUAL
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ABIERTO', -- ABIERTO, CERRADO, PAGADO
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES payroll_periods(id),
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- RLS
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON payroll_periods
  FOR ALL USING (true) WITH CHECK (true);
