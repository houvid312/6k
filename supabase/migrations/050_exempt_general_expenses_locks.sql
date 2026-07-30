-- 050_exempt_general_expenses_locks.sql
-- Flexibiliza el bloqueo de periodos contables para gastos generales y compras del administrador.
-- Solo se bloquean gastos de turno (cajero): 'Compra Turno' y 'Adelanto'.

CREATE OR REPLACE FUNCTION prevent_locked_expenses_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.category IN ('Compra Turno', 'Adelanto') AND is_accounting_period_locked(NEW.store_id, NEW.date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.category IN ('Compra Turno', 'Adelanto') AND is_accounting_period_locked(OLD.store_id, OLD.date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_locked_purchases_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permite compras en cualquier momento, ya que son de nivel administrador
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
