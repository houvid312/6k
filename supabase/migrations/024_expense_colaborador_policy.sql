-- Allow COLABORADOR to insert expenses (for Compra Turno from ventas screen)
CREATE POLICY "Colaborador insert expenses" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (true);
