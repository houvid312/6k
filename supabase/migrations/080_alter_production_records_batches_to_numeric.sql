-- Migration 080: Cambiar batches en production_records a NUMERIC para permitir fracciones de lotes y produccion por bolsas
BEGIN;

ALTER TABLE public.production_records
  ALTER COLUMN batches TYPE NUMERIC(10, 3) USING batches::NUMERIC(10, 3);

COMMIT;
