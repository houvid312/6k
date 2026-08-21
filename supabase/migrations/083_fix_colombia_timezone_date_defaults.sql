-- Migration 083: Corregir defaults de columnas tipo date a zona horaria Colombia (America/Bogota)
BEGIN;

-- 1. Gastos (expenses)
ALTER TABLE public.expenses 
  ALTER COLUMN date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

-- 2. Ingresos (incomes)
ALTER TABLE public.incomes 
  ALTER COLUMN date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

-- 3. Asistencia (attendance)
ALTER TABLE public.attendance 
  ALTER COLUMN date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

-- 4. Cartera (credit_entries & credit_payments)
ALTER TABLE public.credit_entries 
  ALTER COLUMN date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

ALTER TABLE public.credit_payments 
  ALTER COLUMN date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

-- 5. Porciones de turno (shift_portions)
ALTER TABLE public.shift_portions 
  ALTER COLUMN date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

-- 6. Traslados (transfers)
ALTER TABLE public.transfers 
  ALTER COLUMN order_date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

-- 7. Validaciones (validations)
ALTER TABLE public.validations 
  ALTER COLUMN date SET DEFAULT (now() AT TIME ZONE 'America/Bogota')::date;

COMMIT;
