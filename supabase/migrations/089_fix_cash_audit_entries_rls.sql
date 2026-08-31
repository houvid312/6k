-- ============================================================
-- 089: Asegurar políticas RLS estrictas para cash_audit_entries
-- Restringe acceso exclusivamente a usuarios autenticados con permisos sobre la sede
-- ============================================================

DROP POLICY IF EXISTS "Allow read cash_audit_entries" ON cash_audit_entries;
DROP POLICY IF EXISTS "Allow manage cash_audit_entries" ON cash_audit_entries;
DROP POLICY IF EXISTS "Authenticated manage cash_audit_entries" ON cash_audit_entries;
DROP POLICY IF EXISTS "Authenticated read cash_audit_entries" ON cash_audit_entries;
DROP POLICY IF EXISTS "cash_audit_select_policy" ON cash_audit_entries;
DROP POLICY IF EXISTS "cash_audit_manage_policy" ON cash_audit_entries;

-- 1. Política de lectura: solo usuarios autenticados asignados a la sede o con rol global
CREATE POLICY "cash_audit_select_policy"
  ON cash_audit_entries FOR SELECT TO authenticated
  USING (is_admin_or_assigned_local(store_id));

-- 2. Política de gestión: solo usuarios autenticados asignados a la sede o con rol global
CREATE POLICY "cash_audit_manage_policy"
  ON cash_audit_entries FOR ALL TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

-- 3. Revocar acceso a usuarios anónimos (anon) y otorgar a autenticados
REVOKE ALL ON TABLE cash_audit_entries FROM anon;
GRANT ALL ON TABLE cash_audit_entries TO authenticated, service_role;
