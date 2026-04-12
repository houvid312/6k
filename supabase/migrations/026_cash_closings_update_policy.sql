-- Add missing UPDATE policy for cash_closings
CREATE POLICY "Authenticated update cash_closings" ON cash_closings
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Also ensure sales have full CRUD for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sales' AND policyname = 'Authenticated update sales'
  ) THEN
    CREATE POLICY "Authenticated update sales" ON sales
      FOR UPDATE TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
