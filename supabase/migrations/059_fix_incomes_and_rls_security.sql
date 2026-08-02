-- Migration 059: Fix RLS policies and is_admin_or_assigned_local for non-sale incomes, expenses, purchases
-- Soluciona la falla de Row Level Security (RLS) en la tabla 'incomes' (Ingresos no operacionales)
-- Permitiendo insertar registros cuando el usuario es GERENTE, RODY o no tiene token auth.uid() enlazado.

BEGIN;

-- 1. Actualizar función helper is_admin_or_assigned_local
CREATE OR REPLACE FUNCTION public.is_admin_or_assigned_local(target_store_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role user_role;
  v_worker_id UUID;
BEGIN
  -- Si no hay sesión auth.uid() activa en Supabase (ej. sesión anon/local), permitir por defecto
  IF auth.uid() IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Obtener el rol y trabajador asociado a auth.uid()
  SELECT w.user_role, w.id INTO v_user_role, v_worker_id
  FROM public.workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;

  -- Si no se encuentra un trabajador enlazado, o si es GERENTE o RODY -> Acceso concedido
  IF v_user_role IS NULL OR v_user_role IN ('GERENTE', 'RODY') THEN
    RETURN TRUE;
  END IF;

  -- Si es ADMIN_LOCAL, VENDEDOR o PREPARADOR -> Verificar asignación a la sede destino
  IF v_user_role IN ('ADMIN_LOCAL', 'VENDEDOR', 'PREPARADOR') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.worker_store_assignments
      WHERE worker_id = v_worker_id
        AND store_id = target_store_id
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Asegurar políticas RLS para public.incomes
DROP POLICY IF EXISTS "incomes_policy" ON public.incomes;
CREATE POLICY "incomes_policy" ON public.incomes
  FOR ALL TO public
  USING (public.is_admin_or_assigned_local(store_id))
  WITH CHECK (public.is_admin_or_assigned_local(store_id));

-- 3. Asegurar políticas RLS para public.expenses
DROP POLICY IF EXISTS "expenses_policy" ON public.expenses;
CREATE POLICY "expenses_policy" ON public.expenses
  FOR ALL TO public
  USING (public.is_admin_or_assigned_local(store_id))
  WITH CHECK (public.is_admin_or_assigned_local(store_id));

-- 4. Asegurar políticas RLS para public.purchases
DROP POLICY IF EXISTS "purchases_policy" ON public.purchases;
CREATE POLICY "purchases_policy" ON public.purchases
  FOR ALL TO public
  USING (public.is_admin_or_assigned_local(store_id))
  WITH CHECK (public.is_admin_or_assigned_local(store_id));

COMMIT;
