-- Migration 091: Agregar columna icon a products y poblar valores por defecto
BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT NULL;

-- Asignar íconos predeterminados a los productos existentes
UPDATE products 
SET icon = '🔶' 
WHERE name ILIKE '%diamante%';

UPDATE products 
SET icon = '💧' 
WHERE name ILIKE '%agua%' AND icon IS NULL;

UPDATE products 
SET icon = '🧃' 
WHERE name ILIKE '%jugo%' AND icon IS NULL;

UPDATE products 
SET icon = '🥤' 
WHERE category = 'BEBIDA' AND icon IS NULL;

UPDATE products 
SET icon = '🍕' 
WHERE category = 'PIZZA' AND icon IS NULL;

COMMIT;
