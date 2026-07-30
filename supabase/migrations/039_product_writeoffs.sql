-- ============================================================
-- 039: Product Write-offs (Ajustes de tabla si ya existe product_id)
-- ============================================================

-- NOTA: Si 'product_id' ya existe en tu tabla 'inventory_writeoffs',
-- solo necesitamos hacer que 'supply_id' sea opcional y añadir la restricción CHECK.

-- 1. Hacer que supply_id sea anulable (drop NOT NULL constraint)
ALTER TABLE inventory_writeoffs 
  ALTER COLUMN supply_id DROP NOT NULL;

-- 2. Añadir CHECK constraint para asegurar que se defina supply_id o product_id, pero no ambos
-- Usamos un bloque DO para evitar duplicar el constraint si ya existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_writeoff_target'
  ) THEN
    ALTER TABLE inventory_writeoffs 
      ADD CONSTRAINT chk_writeoff_target 
      CHECK (
        (supply_id IS NOT NULL AND product_id IS NULL) OR 
        (supply_id IS NULL AND product_id IS NOT NULL)
      );
  END IF;
END $$;
