-- Allow collaborators to correct operational expenses created from store workflows.
-- Admins already have full access through "Admin manage expenses".
DROP POLICY IF EXISTS "Colaborador update expenses" ON expenses;
DROP POLICY IF EXISTS "Colaborador delete expenses" ON expenses;

CREATE POLICY "Colaborador update expenses" ON expenses
  FOR UPDATE TO authenticated
  USING (get_user_role() = 'COLABORADOR')
  WITH CHECK (get_user_role() = 'COLABORADOR');

CREATE POLICY "Colaborador delete expenses" ON expenses
  FOR DELETE TO authenticated
  USING (get_user_role() = 'COLABORADOR');
