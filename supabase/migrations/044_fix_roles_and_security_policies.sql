-- 044_fix_roles_and_security_policies.sql
-- Fix RLS functions to recognize 'RODY' as a global administrative role alongside 'GERENTE',
-- and ensure explicit SELECT and WRITE policies for stock minimums, product assignments, and workers.

-- 1. Helper function for user_role with STABLE and SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT w.user_role FROM workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 2. Helper function for auth worker id
CREATE OR REPLACE FUNCTION get_auth_worker_id()
RETURNS UUID AS $$
  SELECT id FROM workers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 3. Check if user is GERENTE or RODY (global admin) or assigned to store
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

  -- 2. Si es Gerente o Rody, tiene acceso global
  IF current_role IN ('GERENTE', 'RODY') THEN
    RETURN TRUE;
  END IF;

  -- 3. Si es Admin Local, Vendedor o Preparador, verificar asignación
  IF current_role IN ('ADMIN_LOCAL', 'VENDEDOR', 'PREPARADOR') THEN
    RETURN EXISTS (
      SELECT 1 FROM worker_store_assignments
      WHERE worker_id = current_worker_id
        AND store_id = target_store_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 4. Check transfer access including RODY
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 5. Ensure SELECT policy on workers for authenticated users
DROP POLICY IF EXISTS "workers_select_policy" ON workers;
CREATE POLICY "workers_select_policy" ON workers
  FOR SELECT TO authenticated
  USING (true);

-- 6. Fix stock_minimums RLS policy so GERENTE, RODY and ADMIN_LOCAL can read and write stock minimums
DROP POLICY IF EXISTS "Admin manage stock_minimums" ON stock_minimums;
DROP POLICY IF EXISTS "Authenticated read stock_minimums" ON stock_minimums;
DROP POLICY IF EXISTS "stock_minimums_select_policy" ON stock_minimums;
DROP POLICY IF EXISTS "stock_minimums_write_policy" ON stock_minimums;

CREATE POLICY "stock_minimums_select_policy" ON stock_minimums
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_minimums_write_policy" ON stock_minimums
  FOR ALL TO authenticated
  USING (get_user_role() IN ('GERENTE', 'RODY', 'ADMIN_LOCAL'))
  WITH CHECK (get_user_role() IN ('GERENTE', 'RODY', 'ADMIN_LOCAL'));

-- 7. Fix product_store_assignments RLS policy so ADMIN_LOCAL can manage store availability
DROP POLICY IF EXISTS "Admin manage product_store_assignments" ON product_store_assignments;
DROP POLICY IF EXISTS "product_store_assignments_policy" ON product_store_assignments;
DROP POLICY IF EXISTS "product_store_assignments_select_policy" ON product_store_assignments;
DROP POLICY IF EXISTS "product_store_assignments_write_policy" ON product_store_assignments;

CREATE POLICY "product_store_assignments_select_policy" ON product_store_assignments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "product_store_assignments_write_policy" ON product_store_assignments
  FOR ALL TO authenticated
  USING (get_user_role() IN ('GERENTE', 'RODY', 'ADMIN_LOCAL'))
  WITH CHECK (get_user_role() IN ('GERENTE', 'RODY', 'ADMIN_LOCAL'));
