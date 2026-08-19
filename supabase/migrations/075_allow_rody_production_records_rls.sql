-- Migration 075: Permitir a usuarios con rol RODY registrar produccion en el Centro de Produccion
BEGIN;

-- 1. Actualizar politica de insercion en production_records
DROP POLICY IF EXISTS "production_records_insert_policy" ON public.production_records;
DROP POLICY IF EXISTS "Admin manage production_records" ON public.production_records;
DROP POLICY IF EXISTS "Authenticated insert production_records" ON public.production_records;

CREATE POLICY "production_records_insert_policy" ON public.production_records
FOR INSERT TO authenticated
WITH CHECK (
  (get_user_role() IN ('GERENTE', 'RODY', 'ADMIN_LOCAL', 'PREPARADOR')) OR
  (get_worker_role() IN ('PREPARADOR', 'ADMINISTRADOR', 'COORDINADOR', 'ESTIRADOR', 'HORNERO'))
);

-- Asegurar lectura de production_records
DROP POLICY IF EXISTS "Authenticated read production_records" ON public.production_records;
CREATE POLICY "Authenticated read production_records" ON public.production_records
FOR SELECT TO authenticated
USING (true);

COMMIT;
