-- 046_user_roles_security_policies_addons.sql
-- Actualiza las políticas RLS restantes que dependían del rol heredado 'ADMIN' para soportar los nuevos roles 'GERENTE' y 'ADMIN_LOCAL'.

-- 1. ASIGNACIONES DE TIENDA (worker_store_assignments)
DROP POLICY IF EXISTS "Admin manage worker_store_assignments" ON worker_store_assignments;
CREATE POLICY "worker_store_assignments_write_policy" ON worker_store_assignments
  FOR ALL TO authenticated
  USING (
    get_user_role() = 'GERENTE' OR 
    (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id))
  )
  WITH CHECK (
    get_user_role() = 'GERENTE' OR 
    (get_user_role() = 'ADMIN_LOCAL' AND is_admin_or_assigned_local(store_id))
  );

-- 2. PAGOS DE CARTERA (credit_payments)
DROP POLICY IF EXISTS "Admin manage credit_payments" ON credit_payments;
CREATE POLICY "credit_payments_policy" ON credit_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM credit_entries ce
      WHERE ce.id = credit_payments.credit_id
        AND is_admin_or_assigned_local(ce.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM credit_entries ce
      WHERE ce.id = credit_payments.credit_id
        AND is_admin_or_assigned_local(ce.store_id)
    )
  );

-- 3. TIENDAS (stores)
DROP POLICY IF EXISTS "Admin manage stores" ON stores;
CREATE POLICY "stores_policy" ON stores
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

-- 4. PRODUCTOS (products, product_prices, product_formats)
DROP POLICY IF EXISTS "Admin manage products" ON products;
CREATE POLICY "products_policy" ON products
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

DROP POLICY IF EXISTS "Admin manage product_prices" ON product_prices;
CREATE POLICY "product_prices_policy" ON product_prices
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

DROP POLICY IF EXISTS "Admin manage product_formats" ON product_formats;
DROP POLICY IF EXISTS "Admin manage product_format_prices" ON product_formats;
CREATE POLICY "product_formats_policy" ON product_formats
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

-- 5. INSUMOS Y MÍNIMOS DE STOCK (supplies, stock_minimums)
DROP POLICY IF EXISTS "Admin manage supplies" ON supplies;
CREATE POLICY "supplies_policy" ON supplies
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

DROP POLICY IF EXISTS "Admin manage stock_minimums" ON stock_minimums;
CREATE POLICY "stock_minimums_policy" ON stock_minimums
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

-- 6. RECETAS DE PRODUCCIÓN (production_recipes, production_recipe_inputs)
DROP POLICY IF EXISTS "Admin manage production_recipes" ON production_recipes;
CREATE POLICY "production_recipes_policy" ON production_recipes
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

DROP POLICY IF EXISTS "Admin manage production_recipe_inputs" ON production_recipe_inputs;
CREATE POLICY "production_recipe_inputs_policy" ON production_recipe_inputs
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

-- 7. ESTIMACIONES DE DEMANDA Y ALERTAS (demand_estimates, daily_alerts)
DROP POLICY IF EXISTS "Admin manage demand_estimates" ON demand_estimates;
CREATE POLICY "demand_estimates_policy" ON demand_estimates
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

DROP POLICY IF EXISTS "Admin manage daily_alerts" ON daily_alerts;
CREATE POLICY "daily_alerts_policy" ON daily_alerts
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');

-- 8. BAJAS DE INVENTARIO (writeoffs)
DROP POLICY IF EXISTS "Admin manage writeoffs" ON writeoffs;
CREATE POLICY "writeoffs_policy" ON writeoffs
  FOR ALL TO authenticated
  USING (is_admin_or_assigned_local(store_id))
  WITH CHECK (is_admin_or_assigned_local(store_id));

-- 9. CIERRES CONTABLES / LOCKS (accounting_locks)
DROP POLICY IF EXISTS "Admin manage accounting_locks" ON accounting_locks;
CREATE POLICY "accounting_locks_policy" ON accounting_locks
  FOR ALL TO authenticated
  USING (get_user_role() = 'GERENTE')
  WITH CHECK (get_user_role() = 'GERENTE');
