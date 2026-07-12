-- 043_user_roles_security_policies.sql
-- Migra de forma segura los roles de usuario existentes y restringe las políticas RLS.

-- 1. Migrar de forma segura los roles de usuario existentes
UPDATE workers
SET user_role = 'GERENTE'
WHERE user_role = 'ADMIN';

UPDATE workers
SET user_role = CASE role
  WHEN 'PREPARADOR' THEN 'PREPARADOR'::user_role
  WHEN 'CAJERO' THEN 'VENDEDOR'::user_role
  WHEN 'ADMINISTRADOR' THEN 'ADMIN_LOCAL'::user_role
  ELSE 'VENDEDOR'::user_role
END
WHERE user_role = 'COLABORADOR';

-- 2. Crear funciones auxiliares de seguridad
CREATE OR REPLACE FUNCTION get_auth_worker_id()
RETURNS UUID AS $$
  SELECT id FROM workers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_assigned_local(target_store_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_role user_role;
  current_worker_id UUID;
BEGIN
  -- 1. Obtener rol y id del trabajador autenticado
  SELECT w.user_role, w.id INTO current_role, current_worker_id
  FROM workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;

  -- 2. Si es Gerente (CEO), tiene acceso completo
  IF current_role = 'GERENTE' THEN
    RETURN TRUE;
  END IF;

  -- 3. Si es Admin Local o Vendedor, verificar asignación
  IF current_role IN ('ADMIN_LOCAL', 'VENDEDOR') THEN
    RETURN EXISTS (
      SELECT 1 FROM worker_store_assignments
      WHERE worker_id = current_worker_id
        AND store_id = target_store_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_access_transfer(from_store UUID, to_store UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_role user_role;
  current_worker_id UUID;
BEGIN
  SELECT w.user_role, w.id INTO current_role, current_worker_id
  FROM workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;

  IF current_role IN ('GERENTE', 'PREPARADOR', 'RODY') THEN
    RETURN TRUE;
  END IF;

  IF current_role IN ('ADMIN_LOCAL', 'VENDEDOR') THEN
    RETURN EXISTS (
      SELECT 1 FROM worker_store_assignments
      WHERE worker_id = current_worker_id
        AND store_id IN (from_store, to_store)
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. Actualizar Políticas RLS por Tabla

-- VENTAS (sales)
DROP POLICY IF EXISTS "Admin manage sales" ON sales;
DROP POLICY IF EXISTS "Authenticated read sales" ON sales;
DROP POLICY IF EXISTS "Authenticated insert sales" ON sales;

CREATE POLICY "sales_select_policy" ON sales
  FOR SELECT TO authenticated
  USING (is_admin_or_assigned_local(store_id));

CREATE POLICY "sales_insert_policy" ON sales
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_assigned_local(store_id));

CREATE POLICY "sales_update_policy" ON sales
  FOR UPDATE TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

CREATE POLICY "sales_delete_policy" ON sales
  FOR DELETE TO authenticated
  USING (is_admin_or_assigned_local(store_id));

-- ITEMS DE VENTA (sale_items)
DROP POLICY IF EXISTS "Admin manage sale_items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated read sale_items" ON sale_items;
DROP POLICY IF EXISTS "Authenticated insert sale_items" ON sale_items;

CREATE POLICY "sale_items_select_policy" ON sale_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = sale_items.sale_id
      AND is_admin_or_assigned_local(s.store_id)
  ));

CREATE POLICY "sale_items_insert_policy" ON sale_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = sale_items.sale_id
      AND is_admin_or_assigned_local(s.store_id)
  ));

CREATE POLICY "sale_items_update_policy" ON sale_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = sale_items.sale_id
      AND is_admin_or_assigned_local(s.store_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = sale_items.sale_id
      AND is_admin_or_assigned_local(s.store_id)
  ));

CREATE POLICY "sale_items_delete_policy" ON sale_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = sale_items.sale_id
      AND is_admin_or_assigned_local(s.store_id)
  ));

-- INVENTARIO (inventory)
DROP POLICY IF EXISTS "Admin manage inventory" ON inventory;
DROP POLICY IF EXISTS "Authenticated read inventory" ON inventory;

CREATE POLICY "inventory_select_policy" ON inventory
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('GERENTE', 'PREPARADOR') OR
    is_admin_or_assigned_local(store_id)
  );

CREATE POLICY "inventory_write_policy" ON inventory
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)))
  WITH CHECK (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)));

-- GASTOS (expenses)
DROP POLICY IF EXISTS "Admin manage expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated read expenses" ON expenses;

CREATE POLICY "expenses_policy" ON expenses
  FOR ALL TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

-- CARTERA (credit_entries)
DROP POLICY IF EXISTS "Admin manage credit_entries" ON credit_entries;
DROP POLICY IF EXISTS "Authenticated read credit_entries" ON credit_entries;

CREATE POLICY "credit_entries_policy" ON credit_entries
  FOR ALL TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

-- ARQUEOS DE CAJA (cash_closings)
DROP POLICY IF EXISTS "Admin manage cash_closings" ON cash_closings;
DROP POLICY IF EXISTS "Authenticated read cash_closings" ON cash_closings;
DROP POLICY IF EXISTS "Authenticated insert cash_closings" ON cash_closings;

CREATE POLICY "cash_closings_policy" ON cash_closings
  FOR ALL TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

-- TRASLADOS (transfers)
DROP POLICY IF EXISTS "Admin manage transfers" ON transfers;
DROP POLICY IF EXISTS "Authenticated read transfers" ON transfers;

CREATE POLICY "transfers_policy" ON transfers
  FOR ALL TO authenticated
  USING (can_access_transfer(from_store_id, to_store_id))
  WITH CHECK (can_access_transfer(from_store_id, to_store_id));

-- TRASLADO ITEMS (transfer_items)
DROP POLICY IF EXISTS "Admin manage transfer_items" ON transfer_items;
DROP POLICY IF EXISTS "Authenticated read transfer_items" ON transfer_items;

CREATE POLICY "transfer_items_policy" ON transfer_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM transfers t
    WHERE t.id = transfer_items.transfer_id
      AND can_access_transfer(t.from_store_id, t.to_store_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM transfers t
    WHERE t.id = transfer_items.transfer_id
      AND can_access_transfer(t.from_store_id, t.to_store_id)
  ));

-- ASISTENCIA (attendance)
DROP POLICY IF EXISTS "Admin manage attendance" ON attendance;
DROP POLICY IF EXISTS "Authenticated read attendance" ON attendance;

CREATE POLICY "attendance_policy" ON attendance
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)))
  WITH CHECK (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)));

-- HORARIOS (schedules)
DROP POLICY IF EXISTS "Admin manage schedules" ON schedules;
DROP POLICY IF EXISTS "Authenticated read schedules" ON schedules;

CREATE POLICY "schedules_policy" ON schedules
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)))
  WITH CHECK (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)));

-- PERIODOS DE NOMINA (payroll_periods)
DROP POLICY IF EXISTS "Admin manage payroll_periods" ON payroll_periods;
DROP POLICY IF EXISTS "Allow all for authenticated" ON payroll_periods;

CREATE POLICY "payroll_periods_policy" ON payroll_periods
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)))
  WITH CHECK (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)));

-- NOMINAS (payroll_entries)
DROP POLICY IF EXISTS "Admin manage payroll_entries" ON payroll_entries;
DROP POLICY IF EXISTS "Authenticated read payroll_entries" ON payroll_entries;

CREATE POLICY "payroll_entries_policy" ON payroll_entries
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)))
  WITH CHECK (get_user_role() = 'GERENTE' OR (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id)));

-- TRABAJADORES (workers)
DROP POLICY IF EXISTS "Admin manage workers" ON workers;

CREATE POLICY "workers_write_policy" ON workers
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'GERENTE' OR
    (get_user_role() = 'ADMIN_LOCAL' AND EXISTS (
      SELECT 1 FROM worker_store_assignments wsa_caller
      JOIN worker_store_assignments wsa_target ON wsa_caller.store_id = wsa_target.store_id
      WHERE wsa_caller.worker_id = get_auth_worker_id()
        AND wsa_target.worker_id = workers.id
    ))
  )
  WITH CHECK (
    get_user_role() = 'GERENTE' OR
    (get_user_role() = 'ADMIN_LOCAL' AND EXISTS (
      SELECT 1 FROM worker_store_assignments wsa_caller
      JOIN worker_store_assignments wsa_target ON wsa_caller.store_id = wsa_target.store_id
      WHERE wsa_caller.worker_id = get_auth_worker_id()
        AND wsa_target.worker_id = workers.id
    ))
  );
