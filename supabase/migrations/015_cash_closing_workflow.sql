-- 015: Add workflow status to cash closings
-- States: DRAFT → CONFIRMED → APPROVED

-- Create enum type
CREATE TYPE closing_status AS ENUM ('DRAFT', 'CONFIRMED', 'APPROVED');

-- Add status and worker tracking columns
ALTER TABLE cash_closings
  ADD COLUMN status closing_status NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN confirmed_by_worker_id UUID REFERENCES workers(id),
  ADD COLUMN approved_by_worker_id UUID REFERENCES workers(id);

-- Update existing closings to APPROVED (they were already completed)
UPDATE cash_closings SET status = 'APPROVED';
