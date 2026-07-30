-- 056_supply_local_purchase_flag.sql
-- Añade la columna 'allow_local_purchase' a la tabla 'supplies' para autorizar insumos de compra directa en sede local.

ALTER TABLE public.supplies
  ADD COLUMN IF NOT EXISTS allow_local_purchase BOOLEAN NOT NULL DEFAULT false;

-- Asegurar que los insumos existentes tengan false por defecto si es nulo
UPDATE public.supplies
SET allow_local_purchase = false
WHERE allow_local_purchase IS NULL;
