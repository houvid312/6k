-- ============================================================
-- 089: Asegurar políticas RLS para cash_audit_entries
-- Permite lectura y escritura para public/authenticated/anon
-- ============================================================

DROP POLICY IF EXISTS "Authenticated manage cash_audit_entries" ON cash_audit_entries;
DROP POLICY IF EXISTS "Authenticated read cash_audit_entries" ON cash_audit_entries;
DROP POLICY IF EXISTS "Allow read cash_audit_entries" ON cash_audit_entries;
DROP POLICY IF EXISTS "Allow manage cash_audit_entries" ON cash_audit_entries;

CREATE POLICY "Allow read cash_audit_entries"
  ON cash_audit_entries FOR SELECT TO public USING (true);

CREATE POLICY "Allow manage cash_audit_entries"
  ON cash_audit_entries FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL ON TABLE cash_audit_entries TO anon, authenticated, service_role;
