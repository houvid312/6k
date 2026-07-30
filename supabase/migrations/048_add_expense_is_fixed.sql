-- 048_add_expense_is_fixed.sql
-- 1. Añade la columna is_fixed a la tabla expenses para clasificar los egresos como costos fijos o variables.
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT true;

UPDATE public.expenses
SET is_fixed = false
WHERE category IN ('PUBLICIDAD', 'VARIABLE', 'INSUMOS_EXTRA', 'PRODUCTO');

-- 2. Actualizar la funcion de restriccion de insumos para usar el rol GERENTE en lugar de ADMIN.
CREATE OR REPLACE FUNCTION prevent_non_admin_supply_commercial_update()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Solo GERENTE puede modificar costos de produccion y precios comerciales franquiciados
  IF COALESCE(get_user_role() = 'GERENTE', false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.production_cost_cop, 0) <> 0
       OR COALESCE(NEW.commercial_price_cop, 0) <> 0
       OR COALESCE(NEW.sale_price_cop, 0) <> 0
       OR COALESCE(NEW.is_billable_to_store, true) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Only GERENTE can set supply commercial billing fields';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.production_cost_cop IS DISTINCT FROM OLD.production_cost_cop
       OR NEW.commercial_price_cop IS DISTINCT FROM OLD.commercial_price_cop
       OR NEW.sale_price_cop IS DISTINCT FROM OLD.sale_price_cop
       OR NEW.is_billable_to_store IS DISTINCT FROM OLD.is_billable_to_store THEN
      RAISE EXCEPTION 'Only GERENTE can update supply commercial billing fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
