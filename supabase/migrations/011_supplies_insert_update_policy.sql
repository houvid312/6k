-- Allow authenticated users to create and update supplies
CREATE POLICY "Authenticated insert supplies"
  ON supplies FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update supplies"
  ON supplies FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
