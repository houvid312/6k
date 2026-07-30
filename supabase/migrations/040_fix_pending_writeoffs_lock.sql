-- ============================================================
-- 040: Permitir aprobación/rechazo de bajas pendientes en periodos bloqueados
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_locked_writeoffs_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := (COALESCE(OLD.reviewed_at, OLD.created_at) AT TIME ZONE 'America/Bogota')::DATE;
    -- Si el estado anterior era PENDING, no bloqueamos la actualización (aprobación/rechazo)
    -- ya que el efecto contable y de inventario se registra con la fecha de revisión (hoy)
    IF OLD.status <> 'PENDING' AND is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
