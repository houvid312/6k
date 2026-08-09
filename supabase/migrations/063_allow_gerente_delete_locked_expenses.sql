-- Migration 063: Exempt GERENTE role from locked period restrictions on expenses
BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_locked_expenses_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si el usuario conectado es GERENTE, se permite la modificacion/eliminacion sin restricciones de bloqueo
  IF public.get_user_role() = 'GERENTE' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

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

COMMIT;
