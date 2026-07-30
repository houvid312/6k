-- 053_fix_rls_purchases_expenses.sql
-- Corrige las políticas RLS para las tablas 'purchases' y 'expenses' para permitir que el rol 'GERENTE', 'ADMIN_LOCAL' y los trabajadores asignados a la tienda puedan insertar/gestionar compras y egresos.

-- 1. Políticas para 'purchases'
DROP POLICY IF EXISTS "Admin manage purchases" ON public.purchases;
DROP POLICY IF EXISTS "purchases_policy" ON public.purchases;
CREATE POLICY "purchases_policy" ON public.purchases
  FOR ALL TO authenticated
  USING (public.is_admin_or_assigned_local(store_id))
  WITH CHECK (public.is_admin_or_assigned_local(store_id));

-- 2. Políticas para 'expenses'
DROP POLICY IF EXISTS "Admin manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "expenses_policy" ON public.expenses;
CREATE POLICY "expenses_policy" ON public.expenses
  FOR ALL TO authenticated
  USING (public.is_admin_or_assigned_local(store_id))
  WITH CHECK (public.is_admin_or_assigned_local(store_id));
