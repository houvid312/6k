-- Migration 092: Permitir gestionar recipes a GERENTE y RODY
BEGIN;

DROP POLICY IF EXISTS "Admin manage recipes" ON public.recipes;

CREATE POLICY "Admin manage recipes"
  ON public.recipes
  FOR ALL
  TO authenticated
  USING (
    get_user_role() IN ('GERENTE', 'RODY')
  )
  WITH CHECK (
    get_user_role() IN ('GERENTE', 'RODY')
  );

COMMIT;
