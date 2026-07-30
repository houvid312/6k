-- 054_supply_categories.sql
-- Agrega la columna 'category' a la tabla 'supplies' para diferenciar entre Materias Primas ('RAW'), Insumos Procesados ('PROCESSED') y Empaques / Consumibles Operativos ('OPERATIVE').

ALTER TABLE public.supplies
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'PROCESSED'
  CHECK (category IN ('RAW', 'PROCESSED', 'OPERATIVE'));

-- Actualización inicial basada en nombres y tipos de unidad para categorización por defecto
UPDATE public.supplies
SET category = 'OPERATIVE'
WHERE unit = 'UNIDAD' 
   OR name ILIKE '%caja%' 
   OR name ILIKE '%bolsa%' 
   OR name ILIKE '%vaso%' 
   OR name ILIKE '%tapa%' 
   OR name ILIKE '%servilleta%' 
   OR name ILIKE '%aluminio%';
