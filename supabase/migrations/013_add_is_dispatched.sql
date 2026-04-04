-- Add is_dispatched column to sales table
ALTER TABLE sales ADD COLUMN is_dispatched BOOLEAN NOT NULL DEFAULT false;
