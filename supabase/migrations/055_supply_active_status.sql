-- 055_supply_active_status.sql
-- Añade la columna 'is_active' a la tabla 'supplies' para permitir el archivado / soft-delete de insumos con historial contable o de inventario.

ALTER TABLE public.supplies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Asegurar que todos los insumos existentes estén activos por defecto
UPDATE public.supplies
SET is_active = true
WHERE is_active IS NULL;
