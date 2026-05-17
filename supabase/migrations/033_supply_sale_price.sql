-- Precio de venta al cliente para insumos que se cobran en el POS, como empaques.
-- Es independiente del costo de produccion y del precio comercial interno al local.

ALTER TABLE supplies
  ADD COLUMN IF NOT EXISTS sale_price_cop INTEGER NOT NULL DEFAULT 0;

UPDATE supplies
SET sale_price_cop = 0
WHERE id IN (
  '00000000-0000-0000-0002-000000000101',
  '00000000-0000-0000-0002-000000000102',
  '00000000-0000-0000-0002-000000000103'
)
AND sale_price_cop IS DISTINCT FROM 0;

CREATE OR REPLACE FUNCTION prevent_non_admin_supply_commercial_update()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(get_user_role() = 'ADMIN', false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.production_cost_cop, 0) <> 0
       OR COALESCE(NEW.commercial_price_cop, 0) <> 0
       OR COALESCE(NEW.sale_price_cop, 0) <> 0
       OR COALESCE(NEW.is_billable_to_store, true) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Only admins can set supply commercial billing fields';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.production_cost_cop IS DISTINCT FROM OLD.production_cost_cop
       OR NEW.commercial_price_cop IS DISTINCT FROM OLD.commercial_price_cop
       OR NEW.sale_price_cop IS DISTINCT FROM OLD.sale_price_cop
       OR NEW.is_billable_to_store IS DISTINCT FROM OLD.is_billable_to_store THEN
      RAISE EXCEPTION 'Only admins can update supply commercial billing fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
