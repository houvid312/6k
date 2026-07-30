-- ============================================================
-- 041: Sincronización de Ventas a Crédito y Adelantos con Cartera y Nómina
-- ============================================================

-- 1. Crear tabla de clientes (customers) si no existe
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS en customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS en customers
DROP POLICY IF EXISTS "Authenticated users select customers" ON customers;
CREATE POLICY "Authenticated users select customers" ON customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users insert customers" ON customers;
CREATE POLICY "Authenticated users insert customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users update customers" ON customers;
CREATE POLICY "Authenticated users update customers" ON customers FOR UPDATE TO authenticated USING (true);


-- 2. Agregar columnas a sales, expenses y credit_entries
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS is_credit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS debtor_name TEXT,
  ADD COLUMN IF NOT EXISTS debtor_type debtor_type,
  ADD COLUMN IF NOT EXISTS debtor_worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS debtor_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id) ON DELETE SET NULL;

ALTER TABLE credit_entries
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE;

-- 3. Crear índices
CREATE INDEX IF NOT EXISTS idx_expenses_worker ON expenses(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_entries_sale ON credit_entries(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_entries_expense ON credit_entries(expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_entries_customer ON credit_entries(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_debtor_customer ON sales(debtor_customer_id) WHERE debtor_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_debtor_worker ON sales(debtor_worker_id) WHERE debtor_worker_id IS NOT NULL;


-- 4. Redefinir replace_pending_sale_order para incluir soporte a is_credit y deudores
CREATE OR REPLACE FUNCTION replace_pending_sale_order(
  p_sale_id UUID,
  p_payment_method payment_method,
  p_total_portions INTEGER,
  p_total_amount INTEGER,
  p_packaging_total INTEGER,
  p_cash_amount INTEGER,
  p_bank_amount INTEGER,
  p_observations TEXT,
  p_is_paid BOOLEAN,
  p_customer_note TEXT,
  p_packaging_supply_id UUID,
  p_total_cost_cop INTEGER,
  p_gross_margin_cop INTEGER,
  p_items JSONB,
  p_is_credit BOOLEAN DEFAULT false,
  p_debtor_name TEXT DEFAULT NULL,
  p_debtor_type debtor_type DEFAULT NULL,
  p_debtor_worker_id UUID DEFAULT NULL,
  p_debtor_customer_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item RECORD;
  v_addition RECORD;
  v_recipe_id UUID;
  v_ingredient RECORD;
  v_sale_item_id UUID;
  v_additions JSONB;
  v_had_item_packaging BOOLEAN;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale % must have at least one item', p_sale_id;
  END IF;

  SELECT *
  INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;

  IF is_accounting_period_locked(v_sale.store_id, (v_sale.created_at AT TIME ZONE 'America/Bogota')::DATE) THEN
    PERFORM raise_locked_period_error();
  END IF;

  IF COALESCE(v_sale.is_dispatched, false) THEN
    RAISE EXCEPTION 'Sale % cannot be edited after dispatch', p_sale_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM sale_items
    WHERE sale_id = p_sale_id
      AND packaging_supply_id IS NOT NULL
      AND COALESCE(packaging_quantity, 0) > 0
  )
  INTO v_had_item_packaging;

  FOR v_item IN
    SELECT *
    FROM sale_items
    WHERE sale_id = p_sale_id
  LOOP
    SELECT r.id
    INTO v_recipe_id
    FROM recipes r
    WHERE r.product_id = v_item.product_id;

    IF v_recipe_id IS NOT NULL THEN
      FOR v_ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = v_recipe_id
      LOOP
        PERFORM deduct_store_inventory(
          v_sale.store_id,
          v_ingredient.supply_id,
          -(v_ingredient.grams_per_portion * v_item.portions)
        );
      END LOOP;
    END IF;

    FOR v_addition IN
      SELECT sia.supply_id, sia.grams, sia.quantity
      FROM sale_item_additions sia
      WHERE sia.sale_item_id = v_item.id
    LOOP
      PERFORM deduct_store_inventory(
        v_sale.store_id,
        v_addition.supply_id,
        -(v_addition.grams * v_addition.quantity)
      );
    END LOOP;

    IF v_item.packaging_supply_id IS NOT NULL AND COALESCE(v_item.packaging_quantity, 0) > 0 THEN
      PERFORM deduct_store_inventory(
        v_sale.store_id,
        v_item.packaging_supply_id,
        -v_item.packaging_quantity
      );
    END IF;
  END LOOP;

  IF v_sale.packaging_supply_id IS NOT NULL AND NOT COALESCE(v_had_item_packaging, false) THEN
    PERFORM deduct_store_inventory(v_sale.store_id, v_sale.packaging_supply_id, -1);
  END IF;

  DELETE FROM sale_item_additions
  WHERE sale_item_id IN (
    SELECT id FROM sale_items WHERE sale_id = p_sale_id
  );

  DELETE FROM sale_items
  WHERE sale_id = p_sale_id;

  UPDATE sales
  SET
    payment_method = p_payment_method,
    total_portions = p_total_portions,
    total_amount = p_total_amount,
    packaging_total = COALESCE(p_packaging_total, 0),
    total_cost_cop = COALESCE(p_total_cost_cop, 0),
    gross_margin_cop = COALESCE(p_gross_margin_cop, p_total_amount - COALESCE(p_total_cost_cop, 0)),
    cash_amount = p_cash_amount,
    bank_amount = p_bank_amount,
    observations = COALESCE(p_observations, ''),
    is_paid = COALESCE(p_is_paid, false),
    is_credit = COALESCE(p_is_credit, false),
    debtor_name = p_debtor_name,
    debtor_type = p_debtor_type,
    debtor_worker_id = p_debtor_worker_id,
    debtor_customer_id = p_debtor_customer_id,
    customer_note = NULLIF(COALESCE(p_customer_note, ''), ''),
    packaging_supply_id = p_packaging_supply_id
  WHERE id = p_sale_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id,
      product_id,
      size,
      format_id,
      format_name,
      quantity,
      portions,
      unit_price,
      subtotal,
      additions_total,
      packaging_supply_id,
      packaging_label,
      packaging_unit_price,
      packaging_quantity,
      packaging_total,
      recipe_cost_cop,
      additions_cost_cop,
      packaging_cost_cop,
      total_cost_cop
    )
    VALUES (
      p_sale_id,
      (v_item.value->>'product_id')::UUID,
      CASE
        WHEN NULLIF(v_item.value->>'size', '') IS NULL THEN NULL
        ELSE (v_item.value->>'size')::pizza_size
      END,
      NULLIF(v_item.value->>'format_id', '')::UUID,
      NULLIF(COALESCE(v_item.value->>'format_name', ''), ''),
      COALESCE(NULLIF(v_item.value->>'quantity', '')::INTEGER, 1),
      COALESCE(NULLIF(v_item.value->>'portions', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'unit_price', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'subtotal', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'additions_total', '')::INTEGER, 0),
      NULLIF(v_item.value->>'packaging_supply_id', '')::UUID,
      NULLIF(COALESCE(v_item.value->>'packaging_label', ''), ''),
      COALESCE(NULLIF(v_item.value->>'packaging_unit_price', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'packaging_quantity', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'packaging_total', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'recipe_cost_cop', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'additions_cost_cop', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'packaging_cost_cop', '')::INTEGER, 0),
      COALESCE(NULLIF(v_item.value->>'total_cost_cop', '')::INTEGER, 0)
    )
    RETURNING id INTO v_sale_item_id;

    v_additions := CASE
      WHEN jsonb_typeof(v_item.value->'additions') = 'array' THEN v_item.value->'additions'
      ELSE '[]'::jsonb
    END;

    FOR v_addition IN
      SELECT value
      FROM jsonb_array_elements(v_additions)
    LOOP
      INSERT INTO sale_item_additions (
        sale_item_id,
        addition_catalog_id,
        supply_id,
        name,
        price,
        grams,
        quantity
      )
      VALUES (
        v_sale_item_id,
        (v_addition.value->>'addition_catalog_id')::UUID,
        (v_addition.value->>'supply_id')::UUID,
        v_addition.value->>'name',
        COALESCE(NULLIF(v_addition.value->>'price', '')::INTEGER, 0),
        COALESCE(NULLIF(v_addition.value->>'grams', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_addition.value->>'quantity', '')::INTEGER, 1)
      );
    END LOOP;
  END LOOP;

  -- Descontar inventario ahora que los sale_items y adiciones ya existen
  PERFORM deduct_inventory_for_sale(p_sale_id);
END;
$$;


-- 5. Trigger para crear automáticamente la deuda al insertar una venta a crédito
CREATE OR REPLACE FUNCTION sync_sale_credit_to_portfolio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_credit = true THEN
      INSERT INTO credit_entries (
        debtor_name, debtor_type, worker_id, customer_id, concept, amount, balance, is_paid, date, store_id, sale_id
      )
      VALUES (
        NEW.debtor_name, NEW.debtor_type, NEW.debtor_worker_id, NEW.debtor_customer_id,
        'Fiado de venta: ' || COALESCE(NEW.observations, ''),
        NEW.total_amount, NEW.total_amount, false,
        (NEW.created_at AT TIME ZONE 'America/Bogota')::DATE,
        NEW.store_id, NEW.id
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- 1. Si antes no era crédito y ahora sí
    IF (OLD.is_credit = false OR OLD.is_credit IS NULL) AND NEW.is_credit = true THEN
      INSERT INTO credit_entries (
        debtor_name, debtor_type, worker_id, customer_id, concept, amount, balance, is_paid, date, store_id, sale_id
      )
      VALUES (
        NEW.debtor_name, NEW.debtor_type, NEW.debtor_worker_id, NEW.debtor_customer_id,
        'Fiado de venta: ' || COALESCE(NEW.observations, ''),
        NEW.total_amount, NEW.total_amount, false,
        (NEW.created_at AT TIME ZONE 'America/Bogota')::DATE,
        NEW.store_id, NEW.id
      );
    -- 2. Si antes era crédito y ahora no
    ELSIF OLD.is_credit = true AND NEW.is_credit = false THEN
      DELETE FROM credit_entries WHERE sale_id = NEW.id;
    -- 3. Si cambió el monto, concepto o deudores
    ELSIF NEW.is_credit = true THEN
      UPDATE credit_entries
      SET debtor_name = NEW.debtor_name,
          debtor_type = NEW.debtor_type,
          worker_id = NEW.debtor_worker_id,
          customer_id = NEW.debtor_customer_id,
          amount = NEW.total_amount,
          balance = CASE WHEN is_paid = false THEN NEW.total_amount ELSE balance END,
          concept = 'Fiado de venta: ' || COALESCE(NEW.observations, '')
      WHERE sale_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_credit_to_portfolio ON sales;
CREATE TRIGGER trg_sync_sale_credit_to_portfolio
  AFTER INSERT OR UPDATE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sale_credit_to_portfolio();


-- 6. Triggers para actualizar/sincronizar el estado de cobro de ventas
CREATE OR REPLACE FUNCTION sync_sale_payment_to_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si la venta pasa de no pagada a pagada, marcar el crédito en cartera como pagado
  IF OLD.is_paid = false AND NEW.is_paid = true THEN
    UPDATE credit_entries
    SET is_paid = true,
        paid_date = CURRENT_DATE,
        balance = 0
    WHERE sale_id = NEW.id AND is_paid = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_payment_to_credit ON sales;
CREATE TRIGGER trg_sync_sale_payment_to_credit
  AFTER UPDATE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sale_payment_to_credit();

CREATE OR REPLACE FUNCTION sync_sale_delete_to_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si se elimina una venta a crédito no pagada, eliminar el registro de cartera
  DELETE FROM credit_entries WHERE sale_id = OLD.id AND is_paid = false;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_delete_to_credit ON sales;
CREATE TRIGGER trg_sync_sale_delete_to_credit
  AFTER DELETE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sale_delete_to_credit();


-- 7. Triggers para sincronización de adelantos (expenses)
CREATE OR REPLACE FUNCTION sync_expense_advance_to_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Al registrar un egreso de categoría 'Adelanto' con un trabajador asignado, crear el crédito
  IF NEW.category = 'Adelanto' AND NEW.worker_id IS NOT NULL THEN
    INSERT INTO credit_entries (
      debtor_name,
      debtor_type,
      worker_id,
      customer_id,
      concept,
      amount,
      balance,
      is_paid,
      date,
      store_id,
      expense_id
    )
    SELECT
      w.name,
      'TRABAJADOR'::debtor_type,
      NEW.worker_id,
      NULL,
      'Adelanto de caja: ' || NEW.description,
      NEW.amount,
      NEW.amount,
      false,
      NEW.date,
      NEW.store_id,
      NEW.id
    FROM workers w
    WHERE w.id = NEW.worker_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_expense_advance_to_credit ON expenses;
CREATE TRIGGER trg_sync_expense_advance_to_credit
  AFTER INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION sync_expense_advance_to_credit();

CREATE OR REPLACE FUNCTION sync_expense_update_to_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si se actualiza el adelanto, actualizar el crédito correspondiente en cartera
  IF NEW.category = 'Adelanto' AND NEW.worker_id IS NOT NULL THEN
    UPDATE credit_entries
    SET amount = NEW.amount,
        balance = NEW.amount - (amount - balance), -- Preservar abonos parciales si existen
        concept = 'Adelanto de caja: ' || NEW.description,
        date = NEW.date,
        worker_id = NEW.worker_id
    WHERE expense_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_expense_update_to_credit ON expenses;
CREATE TRIGGER trg_sync_expense_update_to_credit
  AFTER UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION sync_expense_update_to_credit();

CREATE OR REPLACE FUNCTION sync_expense_delete_to_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si se elimina el egreso de adelanto, eliminar el registro de cartera
  DELETE FROM credit_entries WHERE expense_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_expense_delete_to_credit ON expenses;
CREATE TRIGGER trg_sync_expense_delete_to_credit
  AFTER DELETE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION sync_expense_delete_to_credit();
