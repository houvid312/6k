


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."alert_type" AS ENUM (
    'LOSS',
    'SURPLUS',
    'OK'
);


ALTER TYPE "public"."alert_type" OWNER TO "postgres";


CREATE TYPE "public"."closing_status" AS ENUM (
    'DRAFT',
    'CONFIRMED',
    'APPROVED'
);


ALTER TYPE "public"."closing_status" OWNER TO "postgres";


CREATE TYPE "public"."debtor_type" AS ENUM (
    'CLIENTE',
    'TRABAJADOR',
    'LOCAL'
);


ALTER TYPE "public"."debtor_type" OWNER TO "postgres";


CREATE TYPE "public"."inventory_level" AS ENUM (
    'RAW',
    'PROCESSED',
    'STORE'
);


ALTER TYPE "public"."inventory_level" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'EFECTIVO',
    'TRANSFERENCIA',
    'MIXTO'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."pizza_size" AS ENUM (
    'FAMILIAR',
    'MEDIANA',
    'DIAMANTE',
    'INDIVIDUAL'
);


ALTER TYPE "public"."pizza_size" OWNER TO "postgres";


CREATE TYPE "public"."product_category" AS ENUM (
    'PIZZA',
    'BEBIDA',
    'OTRO'
);


ALTER TYPE "public"."product_category" OWNER TO "postgres";


CREATE TYPE "public"."transfer_status" AS ENUM (
    'PENDING',
    'IN_TRANSIT',
    'RECEIVED',
    'CANCELLED'
);


ALTER TYPE "public"."transfer_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'ADMIN',
    'COLABORADOR',
    'GERENTE',
    'ADMIN_LOCAL',
    'PREPARADOR',
    'RODY',
    'VENDEDOR'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."worker_role" AS ENUM (
    'PREPARADOR',
    'ADMINISTRADOR',
    'CAJERO',
    'HORNERO',
    'ESTIRADOR',
    'COORDINADOR'
);


ALTER TYPE "public"."worker_role" OWNER TO "postgres";


CREATE TYPE "public"."writeoff_reason" AS ENUM (
    'DAMAGED',
    'EXPIRED',
    'SPILLED',
    'CONTAMINATED',
    'OTHER'
);


ALTER TYPE "public"."writeoff_reason" OWNER TO "postgres";


CREATE TYPE "public"."writeoff_status" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE "public"."writeoff_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_purchase_to_raw_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
  VALUES (NEW.supply_id, NEW.store_id, 'RAW', NEW.quantity_grams)
  ON CONFLICT (supply_id, store_id, level)
  DO UPDATE SET quantity_grams = inventory.quantity_grams + NEW.quantity_grams,
               last_updated = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."add_purchase_to_raw_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."authenticate_worker"("worker_name" "text", "worker_pin" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    found_worker RECORD;
  BEGIN
    SELECT id, name, username, role, user_role,
  hourly_rate, phone
    INTO found_worker
    FROM workers
    WHERE LOWER(username) = LOWER(worker_name)
      AND pin = worker_pin
      AND is_active = true
    LIMIT 1;

    IF found_worker IS NULL THEN
      RETURN json_build_object('success', false, 'error',
  'Usuario o PIN incorrecto');
    END IF;

    RETURN json_build_object(
      'success', true,
      'user', json_build_object(
        'id', found_worker.id,
        'name', found_worker.name,
        'username', found_worker.username,
        'role', found_worker.user_role,
        'worker_role', found_worker.role,
        'hourly_rate', found_worker.hourly_rate,
        'phone', found_worker.phone
      )
    );
  END;
  $$;


ALTER FUNCTION "public"."authenticate_worker"("worker_name" "text", "worker_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_transfer"("from_store" "uuid", "to_store" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."can_access_transfer"("from_store" "uuid", "to_store" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_rls_check"("target_store_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_role text;
  current_worker_id UUID;
  uid_val UUID;
  row_count integer;
BEGIN
  -- Obtener el UID de la sesión actual
  uid_val := auth.uid();
  
  -- Contar si hay registros visibles en workers con ese UID
  SELECT COUNT(*) INTO row_count FROM public.workers WHERE auth_user_id = uid_val;
  
  -- Buscar el rol y ID
  SELECT w.user_role::text, w.id INTO current_role, current_worker_id
  FROM public.workers w
  WHERE w.auth_user_id = uid_val
  LIMIT 1;
  
  RETURN 'Sesion UID: ' || COALESCE(uid_val::text, 'NULL') || 
         ' | Filas en workers: ' || COALESCE(row_count::text, '0') || 
         ' | Rol detectado: ' || COALESCE(current_role, 'NULL') || 
         ' | Worker ID: ' || COALESCE(current_worker_id::text, 'NULL');
END;
$$;


ALTER FUNCTION "public"."debug_rls_check"("target_store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_inventory_for_sale"("p_sale_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_store_id UUID;
  v_packaging_supply_id UUID;
  v_has_item_packaging BOOLEAN;
  item RECORD;
  ingredient RECORD;
  addition RECORD;
  recipe_id_val UUID;
BEGIN
  SELECT store_id, packaging_supply_id
  INTO v_store_id, v_packaging_supply_id
  FROM sales
  WHERE id = p_sale_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada: %', p_sale_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM sale_items
    WHERE sale_id = p_sale_id
      AND packaging_supply_id IS NOT NULL
      AND COALESCE(packaging_quantity, 0) > 0
  )
  INTO v_has_item_packaging;

  FOR item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    SELECT r.id INTO recipe_id_val
    FROM recipes r
    WHERE r.product_id = item.product_id;

    IF recipe_id_val IS NOT NULL THEN
      FOR ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = recipe_id_val
      LOOP
        PERFORM deduct_store_inventory(
          v_store_id,
          ingredient.supply_id,
          ingredient.grams_per_portion * item.portions
        );
      END LOOP;
    END IF;

    FOR addition IN
      SELECT sia.supply_id, sia.grams, sia.quantity
      FROM sale_item_additions sia
      WHERE sia.sale_item_id = item.id
    LOOP
      PERFORM deduct_store_inventory(
        v_store_id,
        addition.supply_id,
        addition.grams * addition.quantity
      );
    END LOOP;

    IF item.packaging_supply_id IS NOT NULL AND COALESCE(item.packaging_quantity, 0) > 0 THEN
      PERFORM deduct_store_inventory(v_store_id, item.packaging_supply_id, item.packaging_quantity);
    END IF;
  END LOOP;

  IF v_packaging_supply_id IS NOT NULL AND NOT COALESCE(v_has_item_packaging, false) THEN
    PERFORM deduct_store_inventory(v_store_id, v_packaging_supply_id, 1);
  END IF;
END;
$$;


ALTER FUNCTION "public"."deduct_inventory_for_sale"("p_sale_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_inventory_on_sale"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  item RECORD;
  ingredient RECORD;
  recipe_id_val UUID;
  portions_sold INTEGER;
BEGIN
  FOR item IN SELECT * FROM sale_items WHERE sale_id = NEW.id
  LOOP
    portions_sold := item.portions;

    SELECT r.id INTO recipe_id_val
    FROM recipes r WHERE r.product_id = item.product_id;

    IF recipe_id_val IS NOT NULL THEN
      FOR ingredient IN
        SELECT ri.supply_id, ri.grams_per_portion
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = recipe_id_val
      LOOP
        UPDATE inventory
        SET quantity_grams = quantity_grams - (ingredient.grams_per_portion * portions_sold),
            last_updated = now()
        WHERE supply_id = ingredient.supply_id
          AND store_id = NEW.store_id
          AND level = 'STORE';
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_inventory_on_sale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_store_inventory"("p_store_id" "uuid", "p_supply_id" "uuid", "p_grams" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE inventory
  SET quantity_grams = quantity_grams - p_grams,
      last_updated = now()
  WHERE supply_id = p_supply_id
    AND store_id = p_store_id
    AND level = 'STORE';

  IF NOT FOUND THEN
    INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
    VALUES (p_supply_id, p_store_id, 'STORE', -p_grams);
  END IF;
END;
$$;


ALTER FUNCTION "public"."deduct_store_inventory"("p_store_id" "uuid", "p_supply_id" "uuid", "p_grams" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auth_worker_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM workers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_auth_worker_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT w.user_role FROM workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_worker_role"() RETURNS "public"."worker_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT w.role FROM workers w
  WHERE w.auth_user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_worker_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_accounting_period_locked"("p_store_id" "uuid", "p_date" "date") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM accounting_period_locks apl
    WHERE apl.store_id = p_store_id
      AND p_date BETWEEN apl.start_date AND apl.end_date
  );
$$;


ALTER FUNCTION "public"."is_accounting_period_locked"("p_store_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_assigned_local"("target_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_role user_role;
  v_worker_id UUID;
BEGIN
  -- Si no hay sesión auth.uid() activa en Supabase, permitir por defecto
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
$$;


ALTER FUNCTION "public"."is_admin_or_assigned_local"("target_store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_inventory_operator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    get_user_role() IN ('GERENTE', 'ADMIN_LOCAL')
    OR get_worker_role() IN ('PREPARADOR', 'ADMINISTRADOR', 'CAJERO', 'COORDINADOR'),
    false
  );
$$;


ALTER FUNCTION "public"."is_inventory_operator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_transfer_operator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    get_user_role() IN ('GERENTE', 'ADMIN_LOCAL')
    OR get_worker_role() IN ('ADMINISTRADOR', 'CAJERO', 'COORDINADOR'),
    false
  );
$$;


ALTER FUNCTION "public"."is_transfer_operator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_cash_openings_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := NEW.date::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := OLD.date::DATE;
    IF is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."prevent_locked_cash_openings_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_expenses_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."prevent_locked_expenses_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_purchases_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Permite compras en cualquier momento, ya que son de nivel administrador
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."prevent_locked_purchases_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_sale_items_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sale_id UUID;
  v_store_id UUID;
  v_sale_date DATE;
BEGIN
  v_sale_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;

  SELECT store_id, (created_at AT TIME ZONE 'America/Bogota')::DATE
  INTO v_store_id, v_sale_date
  FROM sales
  WHERE id = v_sale_id;

  IF v_store_id IS NOT NULL AND is_accounting_period_locked(v_store_id, v_sale_date) THEN
    PERFORM raise_locked_period_error();
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."prevent_locked_sale_items_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_sales_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := (NEW.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(NEW.store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_date := (OLD.created_at AT TIME ZONE 'America/Bogota')::DATE;
    IF is_accounting_period_locked(OLD.store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."prevent_locked_sales_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_transfers_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_date DATE;
  v_old_date DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_date := transfer_accounting_date(NEW);
    IF is_accounting_period_locked(NEW.from_store_id, v_new_date)
       OR is_accounting_period_locked(NEW.to_store_id, v_new_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.status = 'RECEIVED') THEN
    v_old_date := transfer_accounting_date(OLD);
    IF is_accounting_period_locked(OLD.from_store_id, v_old_date)
       OR is_accounting_period_locked(OLD.to_store_id, v_old_date) THEN
      PERFORM raise_locked_period_error();
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."prevent_locked_transfers_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_writeoffs_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."prevent_locked_writeoffs_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_non_admin_supply_commercial_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."prevent_non_admin_supply_commercial_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."raise_locked_period_error"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'Periodo contable bloqueado para este centro de costo. Reabre el cierre o registra un ajuste posterior.';
END;
$$;


ALTER FUNCTION "public"."raise_locked_period_error"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_transfer_with_billing"("p_transfer_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_transfer transfers%ROWTYPE;
  v_item RECORD;
  v_store_name TEXT;
  v_current_destination_grams NUMERIC;
  v_grams_per_bag NUMERIC;
  v_grams_to_transfer NUMERIC;
  v_unit_cost NUMERIC(12,2);
  v_unit_price INTEGER;
  v_line_cost NUMERIC(12,2);
  v_line_total INTEGER;
  v_total_cost NUMERIC(12,2) := 0;
  v_total_price INTEGER := 0;
  v_credit_id UUID;
  v_today DATE := (now() AT TIME ZONE 'America/Bogota')::DATE;
BEGIN
  SELECT *
  INTO v_transfer
  FROM transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('PENDING', 'IN_TRANSIT') THEN
    RAISE EXCEPTION 'Transfer % cannot be received in status %', p_transfer_id, v_transfer.status;
  END IF;

  SELECT name
  INTO v_store_name
  FROM stores
  WHERE id = v_transfer.to_store_id;

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'Destination store % not found', v_transfer.to_store_id;
  END IF;

  FOR v_item IN
    SELECT id, supply_id, bags_to_send
    FROM transfer_items
    WHERE transfer_id = p_transfer_id
    FOR UPDATE
  LOOP
    SELECT
      COALESCE(NULLIF(grams_per_bag, 0), 1),
      COALESCE(production_cost_cop, 0),
      CASE
        WHEN COALESCE(is_billable_to_store, true) THEN COALESCE(commercial_price_cop, 0)
        ELSE 0
      END
    INTO v_grams_per_bag, v_unit_cost, v_unit_price
    FROM supplies
    WHERE id = v_item.supply_id;

    IF v_grams_per_bag IS NULL THEN
      RAISE EXCEPTION 'Supply % not found', v_item.supply_id;
    END IF;

    v_grams_to_transfer := v_item.bags_to_send * v_grams_per_bag;
    v_line_cost := ROUND((v_item.bags_to_send * v_unit_cost)::NUMERIC, 2);
    v_line_total := v_item.bags_to_send * v_unit_price;

    SELECT quantity_grams
    INTO v_current_destination_grams
    FROM inventory
    WHERE store_id = v_transfer.to_store_id
      AND supply_id = v_item.supply_id
      AND level = 'STORE';

    v_current_destination_grams := COALESCE(v_current_destination_grams, 0);

    INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
    VALUES (v_transfer.from_store_id, v_item.supply_id, 'PROCESSED', -v_grams_to_transfer, now())
    ON CONFLICT (supply_id, store_id, level)
    DO UPDATE SET
      quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
      last_updated = now();

    INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
    VALUES (v_transfer.to_store_id, v_item.supply_id, 'STORE', v_grams_to_transfer, now())
    ON CONFLICT (supply_id, store_id, level)
    DO UPDATE SET
      quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
      last_updated = now();

    UPDATE transfer_items
    SET
      current_inventory_grams = v_current_destination_grams,
      target_grams = v_current_destination_grams + v_grams_to_transfer,
      grams_per_bag_snapshot = v_grams_per_bag,
      unit_cost_cop_snapshot = v_unit_cost,
      unit_price_cop_snapshot = v_unit_price,
      total_cost_cop_snapshot = v_line_cost,
      total_price_cop_snapshot = v_line_total
    WHERE id = v_item.id;

    v_total_cost := v_total_cost + v_line_cost;
    v_total_price := v_total_price + v_line_total;
  END LOOP;

  INSERT INTO credit_entries (
    debtor_name,
    debtor_type,
    store_id,
    transfer_id,
    concept,
    amount,
    balance,
    is_paid,
    paid_date,
    date
  )
  VALUES (
    v_store_name,
    'LOCAL'::debtor_type,
    v_transfer.to_store_id,
    p_transfer_id,
    'Cobro interno traslado ' || right(p_transfer_id::TEXT, 6),
    v_total_price,
    v_total_price,
    v_total_price = 0,
    CASE WHEN v_total_price = 0 THEN v_today ELSE NULL END,
    v_today
  )
  RETURNING id INTO v_credit_id;

  UPDATE transfers
  SET
    status = 'RECEIVED',
    received_at = now(),
    shipping_date = v_today,
    total_cost_cop = v_total_cost,
    total_price_cop = v_total_price,
    billed_at = now(),
    credit_entry_id = v_credit_id
  WHERE id = p_transfer_id;

  RETURN p_transfer_id;
END;
$$;


ALTER FUNCTION "public"."receive_transfer_with_billing"("p_transfer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item RECORD;
  v_addition RECORD;
  v_recipe_id UUID;
  v_ingredient RECORD;
  v_sale_item_id UUID;
  v_additions JSONB;
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

  IF COALESCE(v_sale.is_dispatched, false) THEN
    RAISE EXCEPTION 'Sale % cannot be edited after dispatch', p_sale_id;
  END IF;

  -- Restore previous recipe and addition consumption.
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
  END LOOP;

  IF v_sale.packaging_supply_id IS NOT NULL THEN
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
    cash_amount = p_cash_amount,
    bank_amount = p_bank_amount,
    observations = COALESCE(p_observations, ''),
    is_paid = COALESCE(p_is_paid, false),
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
      additions_total
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
      COALESCE(NULLIF(v_item.value->>'additions_total', '')::INTEGER, 0)
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
        COALESCE(v_addition.value->>'name', ''),
        COALESCE(NULLIF(v_addition.value->>'price', '')::INTEGER, 0),
        COALESCE(NULLIF(v_addition.value->>'grams', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_addition.value->>'quantity', '')::INTEGER, 1)
      );
    END LOOP;
  END LOOP;

  PERFORM deduct_inventory_for_sale(p_sale_id);
END;
$$;


ALTER FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    cash_amount = p_cash_amount,
    bank_amount = p_bank_amount,
    observations = COALESCE(p_observations, ''),
    is_paid = COALESCE(p_is_paid, false),
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
      packaging_total
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
      COALESCE(NULLIF(v_item.value->>'packaging_total', '')::INTEGER, 0)
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
        COALESCE(v_addition.value->>'name', ''),
        COALESCE(NULLIF(v_addition.value->>'price', '')::INTEGER, 0),
        COALESCE(NULLIF(v_addition.value->>'grams', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_addition.value->>'quantity', '')::INTEGER, 1)
      );
    END LOOP;
  END LOOP;

  PERFORM deduct_inventory_for_sale(p_sale_id);
END;
$$;


ALTER FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
        COALESCE(v_addition.value->>'name', ''),
        COALESCE(NULLIF(v_addition.value->>'price', '')::INTEGER, 0),
        COALESCE(NULLIF(v_addition.value->>'grams', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_addition.value->>'quantity', '')::INTEGER, 1)
      );
    END LOOP;
  END LOOP;

  PERFORM deduct_inventory_for_sale(p_sale_id);
END;
$$;


ALTER FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean DEFAULT false, "p_debtor_name" "text" DEFAULT NULL::"text", "p_debtor_type" "public"."debtor_type" DEFAULT NULL::"public"."debtor_type", "p_debtor_worker_id" "uuid" DEFAULT NULL::"uuid", "p_debtor_customer_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean, "p_debtor_name" "text", "p_debtor_type" "public"."debtor_type", "p_debtor_worker_id" "uuid", "p_debtor_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cash_audit_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_cash_audit_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_cash_closing_accounting_lock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_worker_id UUID;
  v_reason TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM accounting_period_locks
    WHERE source_cash_closing_id = OLD.id;
    RETURN OLD;
  END IF;

  DELETE FROM accounting_period_locks
  WHERE source_cash_closing_id = NEW.id;

  IF NEW.status IN ('CONFIRMED', 'APPROVED') THEN
    v_worker_id := COALESCE(NEW.approved_by_worker_id, NEW.confirmed_by_worker_id);
    v_reason := CASE
      WHEN NEW.status = 'APPROVED' THEN 'Cierre de caja aprobado'
      ELSE 'Cierre de caja confirmado'
    END;

    INSERT INTO accounting_period_locks (
      store_id,
      period_type,
      start_date,
      end_date,
      source_cash_closing_id,
      locked_by_worker_id,
      reason,
      locked_at
    )
    VALUES (
      NEW.store_id,
      'DAY',
      NEW.date,
      NEW.date,
      NEW.id,
      v_worker_id,
      v_reason,
      now()
    )
    ON CONFLICT (store_id, period_type, start_date, end_date)
    DO UPDATE SET
      source_cash_closing_id = EXCLUDED.source_cash_closing_id,
      locked_by_worker_id = EXCLUDED.locked_by_worker_id,
      reason = EXCLUDED.reason,
      locked_at = EXCLUDED.locked_at;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_cash_closing_accounting_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_expense_advance_to_credit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."sync_expense_advance_to_credit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_expense_delete_to_credit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Si se elimina el egreso de adelanto, eliminar el registro de cartera
  DELETE FROM credit_entries WHERE expense_id = OLD.id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."sync_expense_delete_to_credit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_expense_update_to_credit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."sync_expense_update_to_credit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_sale_credit_to_portfolio"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."sync_sale_credit_to_portfolio"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_sale_delete_to_credit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Si se elimina una venta a crédito no pagada, eliminar el registro de cartera
  DELETE FROM credit_entries WHERE sale_id = OLD.id AND is_paid = false;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."sync_sale_delete_to_credit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_sale_payment_to_credit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."sync_sale_payment_to_credit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_worker_credentials_to_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_auth_id UUID;
  user_email TEXT;
BEGIN
  -- Si no tiene auth_user_id pero sí tiene username y pin, crear o enlazar el usuario de Auth
  IF (NEW.auth_user_id IS NULL) AND (NEW.username IS NOT NULL) THEN
    user_email := LOWER(NEW.username) || '@6kpizza.app';
    
    -- Verificar si ya existe en auth.users para re-enlazar (en minúsculas)
    SELECT id INTO new_auth_id FROM auth.users WHERE LOWER(email) = LOWER(user_email) LIMIT 1;
    
    IF new_auth_id IS NULL THEN
      new_auth_id := gen_random_uuid();
      
      -- Insertar en auth.users (inicializando columnas opcionales a '' para evitar errores de scan en GoTrue,
      -- pero dejando 'phone' en NULL para respetar su restricción de unicidad users_phone_key)
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change_token_current,
        phone,
        phone_change,
        phone_change_token,
        email_change,
        reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_auth_id,
        'authenticated',
        'authenticated',
        user_email,
        crypt(COALESCE(NEW.pin, '123456'), gen_salt('bf')),
        now(),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('username', NEW.username),
        false,
        '',
        '',
        '',
        '',
        NULL, -- El teléfono DEBE ser NULL en lugar de '' para evitar violaciones de la restricción users_phone_key
        '',
        '',
        '',
        ''
      );
      -- Insertar en auth.identities
      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        new_auth_id,
        new_auth_id,
        user_email,
        jsonb_build_object('sub', new_auth_id::text, 'email', user_email),
        'email',
        now(),
        now(),
        now()
      );
    END IF;
    
    NEW.auth_user_id := new_auth_id;
  END IF;
  -- Si ya tiene auth_user_id, sincronizar cambios en pin o username
  IF NEW.auth_user_id IS NOT NULL THEN
    -- Si el pin cambió, actualizar contraseña en auth.users
    IF (TG_OP = 'UPDATE') AND (OLD.pin IS DISTINCT FROM NEW.pin) THEN
      UPDATE auth.users
      SET encrypted_password = crypt(NEW.pin, gen_salt('bf')),
          updated_at = now()
      WHERE id = NEW.auth_user_id;
    END IF;
    -- Si el username cambió, actualizar email y metadatos en auth.users
    IF (TG_OP = 'UPDATE') AND (OLD.username IS DISTINCT FROM NEW.username) THEN
      user_email := LOWER(NEW.username) || '@6kpizza.app';
      UPDATE auth.users
      SET email = user_email,
          raw_user_meta_data = jsonb_build_object('username', NEW.username),
          updated_at = now()
      WHERE id = NEW.auth_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_worker_credentials_to_auth"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_store_id" "uuid" NOT NULL,
    "to_store_id" "uuid" NOT NULL,
    "status" "public"."transfer_status" DEFAULT 'PENDING'::"public"."transfer_status" NOT NULL,
    "order_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "shipping_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "received_at" timestamp with time zone,
    "total_cost_cop" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_price_cop" integer DEFAULT 0 NOT NULL,
    "billed_at" timestamp with time zone,
    "credit_entry_id" "uuid"
);


ALTER TABLE "public"."transfers" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_accounting_date"("p_transfer" "public"."transfers") RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(
    (p_transfer.received_at AT TIME ZONE 'America/Bogota')::DATE,
    p_transfer.shipping_date,
    p_transfer.order_date,
    (p_transfer.created_at AT TIME ZONE 'America/Bogota')::DATE
  );
$$;


ALTER FUNCTION "public"."transfer_accounting_date"("p_transfer" "public"."transfers") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounting_period_locks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "period_type" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "source_cash_closing_id" "uuid",
    "locked_by_worker_id" "uuid",
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "locked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "accounting_period_locks_period_type_check" CHECK (("period_type" = ANY (ARRAY['DAY'::"text", 'MONTH'::"text"]))),
    CONSTRAINT "accounting_period_locks_valid_range" CHECK (("start_date" <= "end_date"))
);


ALTER TABLE "public"."accounting_period_locks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."addition_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "format_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "grams" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."addition_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "scheduled_hours" numeric DEFAULT 0 NOT NULL,
    "actual_hours" numeric DEFAULT 0 NOT NULL,
    "hourly_rate" integer DEFAULT 0 NOT NULL,
    "subtotal" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "check_in" timestamp with time zone,
    "check_out" timestamp with time zone,
    "is_verified" boolean DEFAULT false NOT NULL,
    "verified_by" "uuid",
    "schedule_id" "uuid",
    "notes" "text",
    "is_unplanned" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'MANUAL'::"text" NOT NULL,
    "status" "text" DEFAULT 'RECORDED'::"text" NOT NULL
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_audit_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "opening_base" integer DEFAULT 0 NOT NULL,
    "cash_sales" integer DEFAULT 0 NOT NULL,
    "cash_expenses" integer DEFAULT 0 NOT NULL,
    "theoretical_total" integer DEFAULT 0 NOT NULL,
    "actual_total" integer DEFAULT 0 NOT NULL,
    "discrepancy" integer DEFAULT 0 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bills_100k" integer DEFAULT 0 NOT NULL,
    "bills_50k" integer DEFAULT 0 NOT NULL,
    "bills_20k" integer DEFAULT 0 NOT NULL,
    "bills_10k" integer DEFAULT 0 NOT NULL,
    "bills_5k" integer DEFAULT 0 NOT NULL,
    "bills_2k" integer DEFAULT 0 NOT NULL,
    "coins" integer DEFAULT 0 NOT NULL,
    "bank_total" integer DEFAULT 0 NOT NULL,
    "cartera" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."cash_audit_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "bills_100k" integer DEFAULT 0 NOT NULL,
    "bills_50k" integer DEFAULT 0 NOT NULL,
    "bills_20k" integer DEFAULT 0 NOT NULL,
    "bills_10k" integer DEFAULT 0 NOT NULL,
    "bills_5k" integer DEFAULT 0 NOT NULL,
    "bills_2k" integer DEFAULT 0 NOT NULL,
    "coins" integer DEFAULT 0 NOT NULL,
    "bank_total" integer DEFAULT 0 NOT NULL,
    "expected_total" integer DEFAULT 0 NOT NULL,
    "actual_total" integer DEFAULT 0 NOT NULL,
    "discrepancy" integer DEFAULT 0 NOT NULL,
    "expenses" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."closing_status" DEFAULT 'DRAFT'::"public"."closing_status" NOT NULL,
    "confirmed_by_worker_id" "uuid",
    "approved_by_worker_id" "uuid"
);


ALTER TABLE "public"."cash_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_openings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "date" "text" NOT NULL,
    "denominations" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "total" integer DEFAULT 0 NOT NULL,
    "opened_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cash_openings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."closing_checklist_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cash_closing_id" "uuid" NOT NULL,
    "checklist_item_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'OK'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text"
);


ALTER TABLE "public"."closing_checklist_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."closing_checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."closing_checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "debtor_name" "text" NOT NULL,
    "debtor_type" "public"."debtor_type" DEFAULT 'CLIENTE'::"public"."debtor_type" NOT NULL,
    "worker_id" "uuid",
    "concept" "text" DEFAULT ''::"text" NOT NULL,
    "amount" integer DEFAULT 0 NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "is_paid" boolean DEFAULT false NOT NULL,
    "paid_date" "date",
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" "uuid",
    "transfer_id" "uuid",
    "sale_id" "uuid",
    "expense_id" "uuid",
    "customer_id" "uuid"
);


ALTER TABLE "public"."credit_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "credit_entry_id" "uuid" NOT NULL,
    "worker_id" "uuid",
    "store_id" "uuid",
    "payroll_period_id" "uuid",
    "payroll_entry_id" "uuid",
    "amount" integer NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "source" "text" DEFAULT 'PAYROLL'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "public"."payment_method" DEFAULT 'TRANSFERENCIA'::"public"."payment_method" NOT NULL,
    "status" "text" DEFAULT 'CONFIRMED'::"text" NOT NULL,
    "expense_id" "uuid",
    "income_id" "uuid",
    CONSTRAINT "credit_payments_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "credit_payments_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'CONFIRMED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."credit_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "physical_count_id" "uuid",
    "closing_worker_id" "uuid",
    "count_worker_id" "uuid",
    "supply_id" "uuid" NOT NULL,
    "theoretical_grams" numeric DEFAULT 0 NOT NULL,
    "real_grams" numeric DEFAULT 0 NOT NULL,
    "difference_grams" numeric DEFAULT 0 NOT NULL,
    "difference_percent" numeric DEFAULT 0 NOT NULL,
    "alert_type" "public"."alert_type" DEFAULT 'OK'::"public"."alert_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demand_estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "estimated_portions" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "demand_estimates_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."demand_estimates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "category" "text" DEFAULT 'Otro'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "amount" integer DEFAULT 0 NOT NULL,
    "payment_method" "public"."payment_method" DEFAULT 'EFECTIVO'::"public"."payment_method" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "worker_id" "uuid",
    "is_fixed" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "category" "text" DEFAULT 'Otro'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "amount" integer DEFAULT 0 NOT NULL,
    "payment_method" "public"."payment_method" DEFAULT 'EFECTIVO'::"public"."payment_method" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."incomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "level" "public"."inventory_level" DEFAULT 'STORE'::"public"."inventory_level" NOT NULL,
    "quantity_grams" numeric DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "level" character varying(20) NOT NULL,
    "previous_quantity_grams" numeric DEFAULT 0 NOT NULL,
    "new_quantity_grams" numeric DEFAULT 0 NOT NULL,
    "difference_grams" numeric DEFAULT 0 NOT NULL,
    "reason" character varying(255) NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_writeoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "supply_id" "uuid",
    "level" "public"."inventory_level" DEFAULT 'STORE'::"public"."inventory_level" NOT NULL,
    "quantity_grams" numeric NOT NULL,
    "reason" "public"."writeoff_reason" DEFAULT 'OTHER'::"public"."writeoff_reason" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "status" "public"."writeoff_status" DEFAULT 'PENDING'::"public"."writeoff_status" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_id" "uuid",
    CONSTRAINT "chk_writeoff_target" CHECK (((("supply_id" IS NOT NULL) AND ("product_id" IS NULL)) OR (("supply_id" IS NULL) AND ("product_id" IS NOT NULL)))),
    CONSTRAINT "inventory_writeoffs_quantity_grams_check" CHECK (("quantity_grams" > (0)::numeric))
);


ALTER TABLE "public"."inventory_writeoffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_hours" numeric DEFAULT 0 NOT NULL,
    "gross_pay" integer DEFAULT 0 NOT NULL,
    "deductions" integer DEFAULT 0 NOT NULL,
    "net_pay" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_id" "uuid",
    "is_paid" boolean DEFAULT false NOT NULL,
    "paid_at" timestamp with time zone,
    "store_id" "uuid",
    "hourly_rate" integer DEFAULT 0 NOT NULL,
    "active_debt" integer DEFAULT 0 NOT NULL,
    "debt_deduction" integer DEFAULT 0 NOT NULL,
    "debt_credit_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attendance_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."payroll_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_type" "text" DEFAULT 'SEMANAL'::"text" NOT NULL,
    "start_date" "text" NOT NULL,
    "end_date" "text" NOT NULL,
    "status" "text" DEFAULT 'BORRADOR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" "uuid",
    "total_gross" integer DEFAULT 0 NOT NULL,
    "total_deductions" integer DEFAULT 0 NOT NULL,
    "total_net" integer DEFAULT 0 NOT NULL,
    "closed_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "expense_id" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."payroll_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."physical_count_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "physical_count_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "bags" integer DEFAULT 0 NOT NULL,
    "loose_grams" numeric DEFAULT 0 NOT NULL,
    "total_grams" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."physical_count_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."physical_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "worker_id" "uuid"
);


ALTER TABLE "public"."physical_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_formats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "portions" integer DEFAULT 1 NOT NULL,
    "price" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_formats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "size" "public"."pizza_size",
    "price" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_store_assignments" (
    "product_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."product_store_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_recipe_inputs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "production_recipe_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "grams_required" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."production_recipe_inputs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "output_grams" numeric NOT NULL,
    "output_bags" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."production_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_record_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "production_record_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "grams_consumed" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."production_record_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "production_recipe_id" "uuid" NOT NULL,
    "batches" integer DEFAULT 1 NOT NULL,
    "total_grams_produced" numeric DEFAULT 0 NOT NULL,
    "notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."production_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "public"."product_category" DEFAULT 'PIZZA'::"public"."product_category" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_recipe" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "quantity_grams" numeric DEFAULT 0 NOT NULL,
    "price_cop" integer DEFAULT 0 NOT NULL,
    "supplier" "text" DEFAULT ''::"text" NOT NULL,
    "payment_method" "public"."payment_method" DEFAULT 'EFECTIVO'::"public"."payment_method" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" "uuid" NOT NULL
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "grams_per_portion" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_item_additions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_item_id" "uuid" NOT NULL,
    "addition_catalog_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "grams" integer NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sale_item_additions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "size" "public"."pizza_size",
    "quantity" integer DEFAULT 1 NOT NULL,
    "portions" integer DEFAULT 0 NOT NULL,
    "unit_price" integer DEFAULT 0 NOT NULL,
    "subtotal" integer DEFAULT 0 NOT NULL,
    "format_id" "uuid",
    "format_name" "text",
    "additions_total" integer DEFAULT 0 NOT NULL,
    "packaging_supply_id" "uuid",
    "packaging_label" "text",
    "packaging_unit_price" integer DEFAULT 0 NOT NULL,
    "packaging_quantity" integer DEFAULT 0 NOT NULL,
    "packaging_total" integer DEFAULT 0 NOT NULL,
    "recipe_cost_cop" integer DEFAULT 0 NOT NULL,
    "additions_cost_cop" integer DEFAULT 0 NOT NULL,
    "packaging_cost_cop" integer DEFAULT 0 NOT NULL,
    "total_cost_cop" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "worker_id" "uuid",
    "payment_method" "public"."payment_method" DEFAULT 'EFECTIVO'::"public"."payment_method" NOT NULL,
    "total_portions" integer DEFAULT 0 NOT NULL,
    "total_amount" integer DEFAULT 0 NOT NULL,
    "cash_amount" integer DEFAULT 0 NOT NULL,
    "bank_amount" integer DEFAULT 0 NOT NULL,
    "observations" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_paid" boolean DEFAULT true NOT NULL,
    "customer_note" "text",
    "is_dispatched" boolean DEFAULT false NOT NULL,
    "packaging_supply_id" "uuid",
    "packaging_total" integer DEFAULT 0 NOT NULL,
    "total_cost_cop" integer DEFAULT 0 NOT NULL,
    "gross_margin_cop" integer DEFAULT 0 NOT NULL,
    "is_credit" boolean DEFAULT false NOT NULL,
    "debtor_name" "text",
    "debtor_type" "public"."debtor_type",
    "debtor_worker_id" "uuid",
    "debtor_customer_id" "uuid"
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" "text" DEFAULT '08:00'::"text" NOT NULL,
    "end_time" "text" DEFAULT '16:00'::"text" NOT NULL,
    "hours" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_portions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "portions" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shift_portions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_minimums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "level" "public"."inventory_level" DEFAULT 'STORE'::"public"."inventory_level" NOT NULL,
    "minimum_grams" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."stock_minimums" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_production_center" boolean DEFAULT false NOT NULL,
    "address" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT 'GRAMOS'::"text" NOT NULL,
    "grams_per_bag" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "production_cost_cop" numeric(12,2) DEFAULT 0 NOT NULL,
    "commercial_price_cop" integer DEFAULT 0 NOT NULL,
    "is_billable_to_store" boolean DEFAULT true NOT NULL,
    "sale_price_cop" integer DEFAULT 0 NOT NULL,
    "category" "text" DEFAULT 'PROCESSED'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "allow_local_purchase" boolean DEFAULT false NOT NULL,
    CONSTRAINT "supplies_category_check" CHECK (("category" = ANY (ARRAY['RAW'::"text", 'PROCESSED'::"text", 'OPERATIVE'::"text"])))
);


ALTER TABLE "public"."supplies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transfer_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transfer_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "target_grams" numeric DEFAULT 0 NOT NULL,
    "current_inventory_grams" numeric DEFAULT 0 NOT NULL,
    "bags_to_send" integer DEFAULT 0 NOT NULL,
    "grams_per_bag_snapshot" numeric,
    "unit_cost_cop_snapshot" numeric(12,2),
    "unit_price_cop_snapshot" integer,
    "total_cost_cop_snapshot" numeric(12,2),
    "total_price_cop_snapshot" integer
);


ALTER TABLE "public"."transfer_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "theoretical_grams" numeric DEFAULT 0 NOT NULL,
    "real_grams" numeric DEFAULT 0 NOT NULL,
    "difference_grams" numeric DEFAULT 0 NOT NULL,
    "alert_percentage" numeric DEFAULT 0 NOT NULL,
    "alert_type" "public"."alert_type" DEFAULT 'OK'::"public"."alert_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "worker_id" "uuid",
    "physical_count_id" "uuid"
);


ALTER TABLE "public"."validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_store_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "store_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worker_store_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid",
    "name" "text" NOT NULL,
    "role" "public"."worker_role" NOT NULL,
    "user_role" "public"."user_role" DEFAULT 'COLABORADOR'::"public"."user_role" NOT NULL,
    "hourly_rate" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "phone" "text",
    "pin" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "username" "text" NOT NULL
);


ALTER TABLE "public"."workers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounting_period_locks"
    ADD CONSTRAINT "accounting_period_locks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."addition_catalog"
    ADD CONSTRAINT "addition_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."addition_catalog"
    ADD CONSTRAINT "addition_catalog_supply_id_format_id_key" UNIQUE ("supply_id", "format_id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_audit_entries"
    ADD CONSTRAINT "cash_audit_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_audit_entries"
    ADD CONSTRAINT "cash_audit_entries_store_id_date_key" UNIQUE ("store_id", "date");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_store_id_date_key" UNIQUE ("store_id", "date");



ALTER TABLE ONLY "public"."cash_openings"
    ADD CONSTRAINT "cash_openings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_openings"
    ADD CONSTRAINT "cash_openings_store_id_date_key" UNIQUE ("store_id", "date");



ALTER TABLE ONLY "public"."closing_checklist_entries"
    ADD CONSTRAINT "closing_checklist_entries_cash_closing_id_checklist_item_id_key" UNIQUE ("cash_closing_id", "checklist_item_id");



ALTER TABLE ONLY "public"."closing_checklist_entries"
    ADD CONSTRAINT "closing_checklist_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."closing_checklist_items"
    ADD CONSTRAINT "closing_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_entries"
    ADD CONSTRAINT "credit_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_alerts"
    ADD CONSTRAINT "daily_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demand_estimates"
    ADD CONSTRAINT "demand_estimates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demand_estimates"
    ADD CONSTRAINT "demand_estimates_store_id_product_id_day_of_week_key" UNIQUE ("store_id", "product_id", "day_of_week");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incomes"
    ADD CONSTRAINT "incomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_supply_id_store_id_level_key" UNIQUE ("supply_id", "store_id", "level");



ALTER TABLE ONLY "public"."inventory_writeoffs"
    ADD CONSTRAINT "inventory_writeoffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."physical_count_items"
    ADD CONSTRAINT "physical_count_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."physical_counts"
    ADD CONSTRAINT "physical_counts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_formats"
    ADD CONSTRAINT "product_formats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_formats"
    ADD CONSTRAINT "product_formats_product_id_name_key" UNIQUE ("product_id", "name");



ALTER TABLE ONLY "public"."product_prices"
    ADD CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_prices"
    ADD CONSTRAINT "product_prices_product_id_size_key" UNIQUE ("product_id", "size");



ALTER TABLE ONLY "public"."product_store_assignments"
    ADD CONSTRAINT "product_store_assignments_pkey" PRIMARY KEY ("product_id", "store_id");



ALTER TABLE ONLY "public"."production_recipe_inputs"
    ADD CONSTRAINT "production_recipe_inputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_recipe_inputs"
    ADD CONSTRAINT "production_recipe_inputs_production_recipe_id_supply_id_key" UNIQUE ("production_recipe_id", "supply_id");



ALTER TABLE ONLY "public"."production_recipes"
    ADD CONSTRAINT "production_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_record_items"
    ADD CONSTRAINT "production_record_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_records"
    ADD CONSTRAINT "production_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_supply_id_key" UNIQUE ("recipe_id", "supply_id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_product_id_key" UNIQUE ("product_id");



ALTER TABLE ONLY "public"."sale_item_additions"
    ADD CONSTRAINT "sale_item_additions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_portions"
    ADD CONSTRAINT "shift_portions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_portions"
    ADD CONSTRAINT "shift_portions_store_id_product_id_date_key" UNIQUE ("store_id", "product_id", "date");



ALTER TABLE ONLY "public"."stock_minimums"
    ADD CONSTRAINT "stock_minimums_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_minimums"
    ADD CONSTRAINT "stock_minimums_supply_id_store_id_level_key" UNIQUE ("supply_id", "store_id", "level");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfer_items"
    ADD CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."validations"
    ADD CONSTRAINT "validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_store_assignments"
    ADD CONSTRAINT "worker_store_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_store_assignments"
    ADD CONSTRAINT "worker_store_assignments_worker_id_store_id_key" UNIQUE ("worker_id", "store_id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_username_key" UNIQUE ("username");



CREATE INDEX "idx_accounting_period_locks_lookup" ON "public"."accounting_period_locks" USING "btree" ("store_id", "start_date", "end_date");



CREATE UNIQUE INDEX "idx_accounting_period_locks_unique" ON "public"."accounting_period_locks" USING "btree" ("store_id", "period_type", "start_date", "end_date");



CREATE INDEX "idx_addition_catalog_format" ON "public"."addition_catalog" USING "btree" ("format_id", "is_active");



CREATE INDEX "idx_attendance_schedule_date" ON "public"."attendance" USING "btree" ("schedule_id", "date") WHERE ("schedule_id" IS NOT NULL);



CREATE INDEX "idx_attendance_store_date" ON "public"."attendance" USING "btree" ("store_id", "date");



CREATE INDEX "idx_attendance_worker_date" ON "public"."attendance" USING "btree" ("worker_id", "date");



CREATE INDEX "idx_cash_audit_entries_store_date" ON "public"."cash_audit_entries" USING "btree" ("store_id", "date");



CREATE INDEX "idx_cash_closings_store_date" ON "public"."cash_closings" USING "btree" ("store_id", "date");



CREATE INDEX "idx_credit_entries_customer" ON "public"."credit_entries" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "idx_credit_entries_debtor" ON "public"."credit_entries" USING "btree" ("debtor_name", "is_paid");



CREATE INDEX "idx_credit_entries_expense" ON "public"."credit_entries" USING "btree" ("expense_id") WHERE ("expense_id" IS NOT NULL);



CREATE INDEX "idx_credit_entries_sale" ON "public"."credit_entries" USING "btree" ("sale_id") WHERE ("sale_id" IS NOT NULL);



CREATE INDEX "idx_credit_entries_store_status" ON "public"."credit_entries" USING "btree" ("store_id", "is_paid") WHERE ("store_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_credit_entries_transfer_id_unique" ON "public"."credit_entries" USING "btree" ("transfer_id") WHERE ("transfer_id" IS NOT NULL);



CREATE INDEX "idx_credit_entries_worker" ON "public"."credit_entries" USING "btree" ("worker_id") WHERE ("worker_id" IS NOT NULL);



CREATE INDEX "idx_credit_payments_credit" ON "public"."credit_payments" USING "btree" ("credit_entry_id");



CREATE INDEX "idx_credit_payments_store_date" ON "public"."credit_payments" USING "btree" ("store_id", "date");



CREATE INDEX "idx_daily_alerts_store_date" ON "public"."daily_alerts" USING "btree" ("store_id", "date");



CREATE INDEX "idx_demand_estimates_store_day" ON "public"."demand_estimates" USING "btree" ("store_id", "day_of_week");



CREATE INDEX "idx_expenses_store_date" ON "public"."expenses" USING "btree" ("store_id", "date");



CREATE INDEX "idx_expenses_worker" ON "public"."expenses" USING "btree" ("worker_id") WHERE ("worker_id" IS NOT NULL);



CREATE INDEX "idx_incomes_store_date" ON "public"."incomes" USING "btree" ("store_id", "date");



CREATE INDEX "idx_inventory_store_level" ON "public"."inventory" USING "btree" ("store_id", "level");



CREATE INDEX "idx_inventory_supply_store" ON "public"."inventory" USING "btree" ("supply_id", "store_id", "level");



CREATE INDEX "idx_payroll_entries_period" ON "public"."payroll_entries" USING "btree" ("period_id");



CREATE INDEX "idx_payroll_entries_store_worker" ON "public"."payroll_entries" USING "btree" ("store_id", "worker_id");



CREATE INDEX "idx_payroll_periods_store_status" ON "public"."payroll_periods" USING "btree" ("store_id", "status");



CREATE UNIQUE INDEX "idx_payroll_periods_store_type_range" ON "public"."payroll_periods" USING "btree" ("store_id", "period_type", "start_date", "end_date") WHERE ("store_id" IS NOT NULL);



CREATE INDEX "idx_product_formats_product" ON "public"."product_formats" USING "btree" ("product_id");



CREATE INDEX "idx_production_recipes_supply" ON "public"."production_recipes" USING "btree" ("supply_id");



CREATE INDEX "idx_production_records_store" ON "public"."production_records" USING "btree" ("store_id", "created_at");



CREATE INDEX "idx_psa_store" ON "public"."product_store_assignments" USING "btree" ("store_id", "is_active");



CREATE INDEX "idx_sale_item_additions_item" ON "public"."sale_item_additions" USING "btree" ("sale_item_id");



CREATE INDEX "idx_sale_items_sale" ON "public"."sale_items" USING "btree" ("sale_id");



CREATE INDEX "idx_sales_debtor_customer" ON "public"."sales" USING "btree" ("debtor_customer_id") WHERE ("debtor_customer_id" IS NOT NULL);



CREATE INDEX "idx_sales_debtor_worker" ON "public"."sales" USING "btree" ("debtor_worker_id") WHERE ("debtor_worker_id" IS NOT NULL);



CREATE INDEX "idx_sales_store_date" ON "public"."sales" USING "btree" ("store_id", "created_at");



CREATE INDEX "idx_schedules_store" ON "public"."schedules" USING "btree" ("store_id", "day_of_week");



CREATE INDEX "idx_schedules_store_worker_day" ON "public"."schedules" USING "btree" ("store_id", "worker_id", "day_of_week");



CREATE INDEX "idx_shift_portions_store_date" ON "public"."shift_portions" USING "btree" ("store_id", "date");



CREATE INDEX "idx_stock_minimums_store_level" ON "public"."stock_minimums" USING "btree" ("store_id", "level");



CREATE INDEX "idx_transfers_credit_entry_id" ON "public"."transfers" USING "btree" ("credit_entry_id") WHERE ("credit_entry_id" IS NOT NULL);



CREATE INDEX "idx_transfers_received_destination" ON "public"."transfers" USING "btree" ("to_store_id", "received_at") WHERE ("status" = 'RECEIVED'::"public"."transfer_status");



CREATE INDEX "idx_transfers_store" ON "public"."transfers" USING "btree" ("to_store_id", "status");



CREATE INDEX "idx_validations_store_date" ON "public"."validations" USING "btree" ("store_id", "date");



CREATE INDEX "idx_worker_store_assignments_store" ON "public"."worker_store_assignments" USING "btree" ("store_id", "worker_id");



CREATE INDEX "idx_workers_auth" ON "public"."workers" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "idx_writeoffs_store_date" ON "public"."inventory_writeoffs" USING "btree" ("store_id", "created_at");



CREATE INDEX "idx_writeoffs_store_status" ON "public"."inventory_writeoffs" USING "btree" ("store_id", "status");



CREATE INDEX "idx_writeoffs_supply" ON "public"."inventory_writeoffs" USING "btree" ("supply_id");



CREATE OR REPLACE TRIGGER "trg_cash_audit_updated_at" BEFORE UPDATE ON "public"."cash_audit_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_cash_audit_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_locked_cash_openings_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."cash_openings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_cash_openings_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_locked_expenses_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_expenses_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_locked_purchases_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."purchases" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_purchases_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_locked_sale_items_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_sale_items_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_locked_sales_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_sales_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_locked_transfers_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."transfers" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_transfers_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_locked_writeoffs_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."inventory_writeoffs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_writeoffs_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_non_admin_supply_commercial_update" BEFORE INSERT OR UPDATE ON "public"."supplies" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_non_admin_supply_commercial_update"();



CREATE OR REPLACE TRIGGER "trg_sync_cash_closing_accounting_lock" AFTER INSERT OR DELETE OR UPDATE ON "public"."cash_closings" FOR EACH ROW EXECUTE FUNCTION "public"."sync_cash_closing_accounting_lock"();



CREATE OR REPLACE TRIGGER "trg_sync_expense_advance_to_credit" AFTER INSERT ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."sync_expense_advance_to_credit"();



CREATE OR REPLACE TRIGGER "trg_sync_expense_delete_to_credit" AFTER DELETE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."sync_expense_delete_to_credit"();



CREATE OR REPLACE TRIGGER "trg_sync_expense_update_to_credit" AFTER UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."sync_expense_update_to_credit"();



CREATE OR REPLACE TRIGGER "trg_sync_sale_credit_to_portfolio" AFTER INSERT OR UPDATE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."sync_sale_credit_to_portfolio"();



CREATE OR REPLACE TRIGGER "trg_sync_sale_delete_to_credit" AFTER DELETE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."sync_sale_delete_to_credit"();



CREATE OR REPLACE TRIGGER "trg_sync_sale_payment_to_credit" AFTER UPDATE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."sync_sale_payment_to_credit"();



CREATE OR REPLACE TRIGGER "trg_sync_worker_credentials_to_auth" BEFORE INSERT OR UPDATE ON "public"."workers" FOR EACH ROW EXECUTE FUNCTION "public"."sync_worker_credentials_to_auth"();



CREATE OR REPLACE TRIGGER "trigger_add_purchase_to_inventory" AFTER INSERT ON "public"."purchases" FOR EACH ROW EXECUTE FUNCTION "public"."add_purchase_to_raw_inventory"();



ALTER TABLE ONLY "public"."accounting_period_locks"
    ADD CONSTRAINT "accounting_period_locks_locked_by_worker_id_fkey" FOREIGN KEY ("locked_by_worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."accounting_period_locks"
    ADD CONSTRAINT "accounting_period_locks_source_cash_closing_id_fkey" FOREIGN KEY ("source_cash_closing_id") REFERENCES "public"."cash_closings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."accounting_period_locks"
    ADD CONSTRAINT "accounting_period_locks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."addition_catalog"
    ADD CONSTRAINT "addition_catalog_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "public"."product_formats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."addition_catalog"
    ADD CONSTRAINT "addition_catalog_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_audit_entries"
    ADD CONSTRAINT "cash_audit_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_approved_by_worker_id_fkey" FOREIGN KEY ("approved_by_worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_confirmed_by_worker_id_fkey" FOREIGN KEY ("confirmed_by_worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."cash_openings"
    ADD CONSTRAINT "cash_openings_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."cash_openings"
    ADD CONSTRAINT "cash_openings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."closing_checklist_entries"
    ADD CONSTRAINT "closing_checklist_entries_cash_closing_id_fkey" FOREIGN KEY ("cash_closing_id") REFERENCES "public"."cash_closings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."closing_checklist_entries"
    ADD CONSTRAINT "closing_checklist_entries_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."closing_checklist_items"("id");



ALTER TABLE ONLY "public"."credit_entries"
    ADD CONSTRAINT "credit_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_entries"
    ADD CONSTRAINT "credit_entries_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_entries"
    ADD CONSTRAINT "credit_entries_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_entries"
    ADD CONSTRAINT "credit_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."credit_entries"
    ADD CONSTRAINT "credit_entries_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id");



ALTER TABLE ONLY "public"."credit_entries"
    ADD CONSTRAINT "credit_entries_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_credit_entry_id_fkey" FOREIGN KEY ("credit_entry_id") REFERENCES "public"."credit_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "public"."incomes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_payroll_entry_id_fkey" FOREIGN KEY ("payroll_entry_id") REFERENCES "public"."payroll_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_alerts"
    ADD CONSTRAINT "daily_alerts_closing_worker_id_fkey" FOREIGN KEY ("closing_worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."daily_alerts"
    ADD CONSTRAINT "daily_alerts_count_worker_id_fkey" FOREIGN KEY ("count_worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."daily_alerts"
    ADD CONSTRAINT "daily_alerts_physical_count_id_fkey" FOREIGN KEY ("physical_count_id") REFERENCES "public"."physical_counts"("id");



ALTER TABLE ONLY "public"."daily_alerts"
    ADD CONSTRAINT "daily_alerts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."daily_alerts"
    ADD CONSTRAINT "daily_alerts_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."demand_estimates"
    ADD CONSTRAINT "demand_estimates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."demand_estimates"
    ADD CONSTRAINT "demand_estimates_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incomes"
    ADD CONSTRAINT "incomes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."inventory_writeoffs"
    ADD CONSTRAINT "inventory_writeoffs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_writeoffs"
    ADD CONSTRAINT "inventory_writeoffs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."inventory_writeoffs"
    ADD CONSTRAINT "inventory_writeoffs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."inventory_writeoffs"
    ADD CONSTRAINT "inventory_writeoffs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."inventory_writeoffs"
    ADD CONSTRAINT "inventory_writeoffs_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."physical_count_items"
    ADD CONSTRAINT "physical_count_items_physical_count_id_fkey" FOREIGN KEY ("physical_count_id") REFERENCES "public"."physical_counts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."physical_count_items"
    ADD CONSTRAINT "physical_count_items_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."physical_counts"
    ADD CONSTRAINT "physical_counts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."physical_counts"
    ADD CONSTRAINT "physical_counts_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."product_formats"
    ADD CONSTRAINT "product_formats_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_prices"
    ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_store_assignments"
    ADD CONSTRAINT "product_store_assignments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_store_assignments"
    ADD CONSTRAINT "product_store_assignments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_recipe_inputs"
    ADD CONSTRAINT "production_recipe_inputs_production_recipe_id_fkey" FOREIGN KEY ("production_recipe_id") REFERENCES "public"."production_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_recipe_inputs"
    ADD CONSTRAINT "production_recipe_inputs_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."production_recipes"
    ADD CONSTRAINT "production_recipes_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."production_record_items"
    ADD CONSTRAINT "production_record_items_production_record_id_fkey" FOREIGN KEY ("production_record_id") REFERENCES "public"."production_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_record_items"
    ADD CONSTRAINT "production_record_items_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."production_records"
    ADD CONSTRAINT "production_records_production_recipe_id_fkey" FOREIGN KEY ("production_recipe_id") REFERENCES "public"."production_recipes"("id");



ALTER TABLE ONLY "public"."production_records"
    ADD CONSTRAINT "production_records_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."production_records"
    ADD CONSTRAINT "production_records_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_item_additions"
    ADD CONSTRAINT "sale_item_additions_addition_catalog_id_fkey" FOREIGN KEY ("addition_catalog_id") REFERENCES "public"."addition_catalog"("id");



ALTER TABLE ONLY "public"."sale_item_additions"
    ADD CONSTRAINT "sale_item_additions_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_item_additions"
    ADD CONSTRAINT "sale_item_additions_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "public"."product_formats"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_packaging_supply_id_fkey" FOREIGN KEY ("packaging_supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_debtor_customer_id_fkey" FOREIGN KEY ("debtor_customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_debtor_worker_id_fkey" FOREIGN KEY ("debtor_worker_id") REFERENCES "public"."workers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_packaging_supply_id_fkey" FOREIGN KEY ("packaging_supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_portions"
    ADD CONSTRAINT "shift_portions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."shift_portions"
    ADD CONSTRAINT "shift_portions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."stock_minimums"
    ADD CONSTRAINT "stock_minimums_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."stock_minimums"
    ADD CONSTRAINT "stock_minimums_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."transfer_items"
    ADD CONSTRAINT "transfer_items_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."transfer_items"
    ADD CONSTRAINT "transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_credit_entry_id_fkey" FOREIGN KEY ("credit_entry_id") REFERENCES "public"."credit_entries"("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_from_store_id_fkey" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_to_store_id_fkey" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."validations"
    ADD CONSTRAINT "validations_physical_count_id_fkey" FOREIGN KEY ("physical_count_id") REFERENCES "public"."physical_counts"("id");



ALTER TABLE ONLY "public"."validations"
    ADD CONSTRAINT "validations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."validations"
    ADD CONSTRAINT "validations_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."validations"
    ADD CONSTRAINT "validations_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id");



ALTER TABLE ONLY "public"."worker_store_assignments"
    ADD CONSTRAINT "worker_store_assignments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_store_assignments"
    ADD CONSTRAINT "worker_store_assignments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admin manage accounting_period_locks" ON "public"."accounting_period_locks" TO "authenticated" USING (("public"."get_user_role"() = 'ADMIN'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'ADMIN'::"public"."user_role"));



CREATE POLICY "Admin manage recipe_ingredients" ON "public"."recipe_ingredients" USING (true) WITH CHECK (true);



CREATE POLICY "Admin manage validations" ON "public"."validations" TO "authenticated" USING (("public"."get_user_role"() = 'ADMIN'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'ADMIN'::"public"."user_role"));



CREATE POLICY "Admin update writeoffs" ON "public"."inventory_writeoffs" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = 'ADMIN'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'ADMIN'::"public"."user_role"));



CREATE POLICY "Allow all for authenticated" ON "public"."cash_openings" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for authenticated" ON "public"."closing_checklist_entries" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for authenticated" ON "public"."closing_checklist_items" USING (true) WITH CHECK (true);



CREATE POLICY "Allow update sales" ON "public"."sales" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated delete addition_catalog" ON "public"."addition_catalog" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated insert         
  supplies" ON "public"."supplies" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated insert addition_catalog" ON "public"."addition_catalog" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated insert sale_item_additions" ON "public"."sale_item_additions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated insert writeoffs" ON "public"."inventory_writeoffs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated manage cash_audit_entries" ON "public"."cash_audit_entries" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated manage shift_portions" ON "public"."shift_portions" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated read accounting_period_locks" ON "public"."accounting_period_locks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read addition_catalog" ON "public"."addition_catalog" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read cash_audit_entries" ON "public"."cash_audit_entries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read credit_payments" ON "public"."credit_payments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read daily_alerts" ON "public"."daily_alerts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read demand_estimates" ON "public"."demand_estimates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read product_formats" ON "public"."product_formats" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read product_prices" ON "public"."product_prices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read product_store_assignments" ON "public"."product_store_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read production_recipe_inputs" ON "public"."production_recipe_inputs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read production_recipes" ON "public"."production_recipes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read production_record_items" ON "public"."production_record_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read production_records" ON "public"."production_records" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read products" ON "public"."products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read purchases" ON "public"."purchases" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read recipe_ingredients" ON "public"."recipe_ingredients" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read recipes" ON "public"."recipes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read sale_item_additions" ON "public"."sale_item_additions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read shift_portions" ON "public"."shift_portions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated read stores" ON "public"."stores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read supplies" ON "public"."supplies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read validations" ON "public"."validations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read worker_store_assignments" ON "public"."worker_store_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read workers" ON "public"."workers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read writeoffs" ON "public"."inventory_writeoffs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated update         
  supplies" ON "public"."supplies" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated update addition_catalog" ON "public"."addition_catalog" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated update cash_closings" ON "public"."cash_closings" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated update sales" ON "public"."sales" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users insert customers" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users select customers" ON "public"."customers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users update customers" ON "public"."customers" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Colaborador delete expenses" ON "public"."expenses" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'COLABORADOR'::"public"."user_role"));



CREATE POLICY "Colaborador insert expenses" ON "public"."expenses" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Colaborador update expenses" ON "public"."expenses" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = 'COLABORADOR'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'COLABORADOR'::"public"."user_role"));



CREATE POLICY "Inventory operators delete daily_alerts" ON "public"."daily_alerts" FOR DELETE TO "authenticated" USING ("public"."is_inventory_operator"());



CREATE POLICY "Inventory operators insert daily_alerts" ON "public"."daily_alerts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_inventory_operator"());



CREATE POLICY "Transfer operators manage transfer_items" ON "public"."transfer_items" TO "authenticated" USING ("public"."is_transfer_operator"()) WITH CHECK ("public"."is_transfer_operator"());



CREATE POLICY "Transfer operators manage transfers" ON "public"."transfers" TO "authenticated" USING ("public"."is_transfer_operator"()) WITH CHECK ("public"."is_transfer_operator"());



CREATE POLICY "accounting_locks_policy" ON "public"."accounting_period_locks" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."accounting_period_locks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."addition_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_policy" ON "public"."attendance" TO "authenticated" USING ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id")))) WITH CHECK ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id"))));



ALTER TABLE "public"."cash_audit_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_closings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_closings_policy" ON "public"."cash_closings" TO "authenticated" USING ("public"."is_admin_or_assigned_local"("store_id")) WITH CHECK ("public"."is_admin_or_assigned_local"("store_id"));



ALTER TABLE "public"."cash_openings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."closing_checklist_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."closing_checklist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_entries_policy" ON "public"."credit_entries" TO "authenticated" USING (("public"."is_admin_or_assigned_local"("store_id") OR (("transfer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."transfers" "t"
  WHERE (("t"."id" = "credit_entries"."transfer_id") AND "public"."is_admin_or_assigned_local"("t"."from_store_id"))))))) WITH CHECK (("public"."is_admin_or_assigned_local"("store_id") OR (("transfer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."transfers" "t"
  WHERE (("t"."id" = "credit_entries"."transfer_id") AND "public"."is_admin_or_assigned_local"("t"."from_store_id")))))));



ALTER TABLE "public"."credit_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_payments_policy" ON "public"."credit_payments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."credit_entries" "ce"
  WHERE (("ce"."id" = "credit_payments"."credit_entry_id") AND ("public"."is_admin_or_assigned_local"("ce"."store_id") OR (("ce"."transfer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."transfers" "t"
          WHERE (("t"."id" = "ce"."transfer_id") AND "public"."is_admin_or_assigned_local"("t"."from_store_id")))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."credit_entries" "ce"
  WHERE (("ce"."id" = "credit_payments"."credit_entry_id") AND ("public"."is_admin_or_assigned_local"("ce"."store_id") OR (("ce"."transfer_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."transfers" "t"
          WHERE (("t"."id" = "ce"."transfer_id") AND "public"."is_admin_or_assigned_local"("t"."from_store_id"))))))))));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_alerts_policy" ON "public"."daily_alerts" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."demand_estimates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "demand_estimates_policy" ON "public"."demand_estimates" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_policy" ON "public"."expenses" USING ("public"."is_admin_or_assigned_local"("store_id")) WITH CHECK ("public"."is_admin_or_assigned_local"("store_id"));



ALTER TABLE "public"."incomes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "incomes_policy" ON "public"."incomes" USING ("public"."is_admin_or_assigned_local"("store_id")) WITH CHECK ("public"."is_admin_or_assigned_local"("store_id"));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_adjustments_select_policy" ON "public"."inventory_adjustments" FOR SELECT USING (true);



CREATE POLICY "inventory_adjustments_write_policy" ON "public"."inventory_adjustments" USING (true) WITH CHECK (true);



CREATE POLICY "inventory_select_policy" ON "public"."inventory" FOR SELECT USING (true);



CREATE POLICY "inventory_write_policy" ON "public"."inventory" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inventory_writeoffs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_entries_policy" ON "public"."payroll_entries" TO "authenticated" USING ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id")))) WITH CHECK ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id"))));



ALTER TABLE "public"."payroll_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_periods_policy" ON "public"."payroll_periods" TO "authenticated" USING ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id")))) WITH CHECK ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id"))));



CREATE POLICY "physical_count_items_delete_policy" ON "public"."physical_count_items" FOR DELETE USING (true);



CREATE POLICY "physical_count_items_insert_policy" ON "public"."physical_count_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "physical_count_items_select_policy" ON "public"."physical_count_items" FOR SELECT USING (true);



CREATE POLICY "physical_count_items_update_policy" ON "public"."physical_count_items" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "physical_counts_delete_policy" ON "public"."physical_counts" FOR DELETE USING (true);



CREATE POLICY "physical_counts_insert_policy" ON "public"."physical_counts" FOR INSERT WITH CHECK (true);



CREATE POLICY "physical_counts_select_policy" ON "public"."physical_counts" FOR SELECT USING (true);



CREATE POLICY "physical_counts_update_policy" ON "public"."physical_counts" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."product_formats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_formats_policy" ON "public"."product_formats" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."product_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_prices_policy" ON "public"."product_prices" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."product_store_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_store_assignments_select_policy" ON "public"."product_store_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "product_store_assignments_write_policy" ON "public"."product_store_assignments" TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['GERENTE'::"public"."user_role", 'RODY'::"public"."user_role", 'ADMIN_LOCAL'::"public"."user_role"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['GERENTE'::"public"."user_role", 'RODY'::"public"."user_role", 'ADMIN_LOCAL'::"public"."user_role"])));



ALTER TABLE "public"."production_recipe_inputs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_recipe_inputs_policy" ON "public"."production_recipe_inputs" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."production_recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_recipes_policy" ON "public"."production_recipes" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."production_record_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_record_items_insert_policy" ON "public"."production_record_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['GERENTE'::"public"."user_role", 'ADMIN_LOCAL'::"public"."user_role"])) OR ("public"."get_worker_role"() = ANY (ARRAY['PREPARADOR'::"public"."worker_role", 'ADMINISTRADOR'::"public"."worker_role", 'COORDINADOR'::"public"."worker_role"]))));



ALTER TABLE "public"."production_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_records_insert_policy" ON "public"."production_records" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['GERENTE'::"public"."user_role", 'ADMIN_LOCAL'::"public"."user_role"])) OR ("public"."get_worker_role"() = ANY (ARRAY['PREPARADOR'::"public"."worker_role", 'ADMINISTRADOR'::"public"."worker_role", 'COORDINADOR'::"public"."worker_role"]))));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_policy" ON "public"."products" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchases_policy" ON "public"."purchases" USING ("public"."is_admin_or_assigned_local"("store_id")) WITH CHECK ("public"."is_admin_or_assigned_local"("store_id"));



ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_item_additions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sale_items_delete_policy" ON "public"."sale_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND "public"."is_admin_or_assigned_local"("s"."store_id")))));



CREATE POLICY "sale_items_insert_policy" ON "public"."sale_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND "public"."is_admin_or_assigned_local"("s"."store_id")))));



CREATE POLICY "sale_items_select_policy" ON "public"."sale_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND "public"."is_admin_or_assigned_local"("s"."store_id")))));



CREATE POLICY "sale_items_update_policy" ON "public"."sale_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND "public"."is_admin_or_assigned_local"("s"."store_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND "public"."is_admin_or_assigned_local"("s"."store_id")))));



ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_delete_policy" ON "public"."sales" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_assigned_local"("store_id"));



CREATE POLICY "sales_insert_policy" ON "public"."sales" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_assigned_local"("store_id"));



CREATE POLICY "sales_select_policy" ON "public"."sales" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_assigned_local"("store_id"));



CREATE POLICY "sales_update_policy" ON "public"."sales" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_assigned_local"("store_id")) WITH CHECK ("public"."is_admin_or_assigned_local"("store_id"));



ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedules_policy" ON "public"."schedules" TO "authenticated" USING ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id")))) WITH CHECK ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id"))));



ALTER TABLE "public"."shift_portions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_minimums" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_minimums_policy" ON "public"."stock_minimums" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



CREATE POLICY "stock_minimums_select_policy" ON "public"."stock_minimums" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "stock_minimums_write_policy" ON "public"."stock_minimums" TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['GERENTE'::"public"."user_role", 'RODY'::"public"."user_role", 'ADMIN_LOCAL'::"public"."user_role"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['GERENTE'::"public"."user_role", 'RODY'::"public"."user_role", 'ADMIN_LOCAL'::"public"."user_role"])));



ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stores_policy" ON "public"."stores" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."supplies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplies_policy" ON "public"."supplies" TO "authenticated" USING (("public"."get_user_role"() = 'GERENTE'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'GERENTE'::"public"."user_role"));



ALTER TABLE "public"."transfer_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transfer_items_policy" ON "public"."transfer_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."transfers" "t"
  WHERE (("t"."id" = "transfer_items"."transfer_id") AND "public"."can_access_transfer"("t"."from_store_id", "t"."to_store_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."transfers" "t"
  WHERE (("t"."id" = "transfer_items"."transfer_id") AND "public"."can_access_transfer"("t"."from_store_id", "t"."to_store_id")))));



ALTER TABLE "public"."transfers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transfers_policy" ON "public"."transfers" TO "authenticated" USING ("public"."can_access_transfer"("from_store_id", "to_store_id")) WITH CHECK ("public"."can_access_transfer"("from_store_id", "to_store_id"));



ALTER TABLE "public"."validations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_store_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_store_assignments_write_policy" ON "public"."worker_store_assignments" TO "authenticated" USING ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id")))) WITH CHECK ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND "public"."is_admin_or_assigned_local"("store_id"))));



ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workers_select_policy" ON "public"."workers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "workers_write_policy" ON "public"."workers" TO "authenticated" USING ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND (EXISTS ( SELECT 1
   FROM ("public"."worker_store_assignments" "wsa_caller"
     JOIN "public"."worker_store_assignments" "wsa_target" ON (("wsa_caller"."store_id" = "wsa_target"."store_id")))
  WHERE (("wsa_caller"."worker_id" = "public"."get_auth_worker_id"()) AND ("wsa_target"."worker_id" = "workers"."id"))))))) WITH CHECK ((("public"."get_user_role"() = 'GERENTE'::"public"."user_role") OR (("public"."get_user_role"() = 'ADMIN_LOCAL'::"public"."user_role") AND (EXISTS ( SELECT 1
   FROM ("public"."worker_store_assignments" "wsa_caller"
     JOIN "public"."worker_store_assignments" "wsa_target" ON (("wsa_caller"."store_id" = "wsa_target"."store_id")))
  WHERE (("wsa_caller"."worker_id" = "public"."get_auth_worker_id"()) AND ("wsa_target"."worker_id" = "workers"."id")))))));



CREATE POLICY "writeoffs_policy" ON "public"."inventory_writeoffs" TO "authenticated" USING ("public"."is_admin_or_assigned_local"("store_id")) WITH CHECK ("public"."is_admin_or_assigned_local"("store_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."add_purchase_to_raw_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_purchase_to_raw_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_purchase_to_raw_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."authenticate_worker"("worker_name" "text", "worker_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."authenticate_worker"("worker_name" "text", "worker_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."authenticate_worker"("worker_name" "text", "worker_pin" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_transfer"("from_store" "uuid", "to_store" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_transfer"("from_store" "uuid", "to_store" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_transfer"("from_store" "uuid", "to_store" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_rls_check"("target_store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."debug_rls_check"("target_store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_rls_check"("target_store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_inventory_for_sale"("p_sale_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_inventory_for_sale"("p_sale_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_inventory_for_sale"("p_sale_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_inventory_on_sale"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_inventory_on_sale"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_inventory_on_sale"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_store_inventory"("p_store_id" "uuid", "p_supply_id" "uuid", "p_grams" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_store_inventory"("p_store_id" "uuid", "p_supply_id" "uuid", "p_grams" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_store_inventory"("p_store_id" "uuid", "p_supply_id" "uuid", "p_grams" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_auth_worker_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_auth_worker_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_auth_worker_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_worker_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_worker_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_worker_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_accounting_period_locked"("p_store_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_accounting_period_locked"("p_store_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_accounting_period_locked"("p_store_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_assigned_local"("target_store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_assigned_local"("target_store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_assigned_local"("target_store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_inventory_operator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_inventory_operator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_inventory_operator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_transfer_operator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_transfer_operator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_transfer_operator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_cash_openings_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_cash_openings_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_cash_openings_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_expenses_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_expenses_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_expenses_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_purchases_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_purchases_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_purchases_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_sale_items_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_sale_items_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_sale_items_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_sales_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_sales_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_sales_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_transfers_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_transfers_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_transfers_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_writeoffs_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_writeoffs_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_writeoffs_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_non_admin_supply_commercial_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_supply_commercial_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_supply_commercial_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."raise_locked_period_error"() TO "anon";
GRANT ALL ON FUNCTION "public"."raise_locked_period_error"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."raise_locked_period_error"() TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_transfer_with_billing"("p_transfer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."receive_transfer_with_billing"("p_transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_transfer_with_billing"("p_transfer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean, "p_debtor_name" "text", "p_debtor_type" "public"."debtor_type", "p_debtor_worker_id" "uuid", "p_debtor_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean, "p_debtor_name" "text", "p_debtor_type" "public"."debtor_type", "p_debtor_worker_id" "uuid", "p_debtor_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_pending_sale_order"("p_sale_id" "uuid", "p_payment_method" "public"."payment_method", "p_total_portions" integer, "p_total_amount" integer, "p_packaging_total" integer, "p_cash_amount" integer, "p_bank_amount" integer, "p_observations" "text", "p_is_paid" boolean, "p_customer_note" "text", "p_packaging_supply_id" "uuid", "p_total_cost_cop" integer, "p_gross_margin_cop" integer, "p_items" "jsonb", "p_is_credit" boolean, "p_debtor_name" "text", "p_debtor_type" "public"."debtor_type", "p_debtor_worker_id" "uuid", "p_debtor_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_cash_audit_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_cash_audit_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_cash_audit_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_cash_closing_accounting_lock"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_cash_closing_accounting_lock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_cash_closing_accounting_lock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_expense_advance_to_credit"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_expense_advance_to_credit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_expense_advance_to_credit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_expense_delete_to_credit"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_expense_delete_to_credit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_expense_delete_to_credit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_expense_update_to_credit"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_expense_update_to_credit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_expense_update_to_credit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_sale_credit_to_portfolio"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_sale_credit_to_portfolio"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_sale_credit_to_portfolio"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_sale_delete_to_credit"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_sale_delete_to_credit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_sale_delete_to_credit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_sale_payment_to_credit"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_sale_payment_to_credit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_sale_payment_to_credit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_worker_credentials_to_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_worker_credentials_to_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_worker_credentials_to_auth"() TO "service_role";



GRANT ALL ON TABLE "public"."transfers" TO "anon";
GRANT ALL ON TABLE "public"."transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."transfers" TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_accounting_date"("p_transfer" "public"."transfers") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_accounting_date"("p_transfer" "public"."transfers") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_accounting_date"("p_transfer" "public"."transfers") TO "service_role";


















GRANT ALL ON TABLE "public"."accounting_period_locks" TO "anon";
GRANT ALL ON TABLE "public"."accounting_period_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_period_locks" TO "service_role";



GRANT ALL ON TABLE "public"."addition_catalog" TO "anon";
GRANT ALL ON TABLE "public"."addition_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."addition_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."cash_audit_entries" TO "anon";
GRANT ALL ON TABLE "public"."cash_audit_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_audit_entries" TO "service_role";



GRANT ALL ON TABLE "public"."cash_closings" TO "anon";
GRANT ALL ON TABLE "public"."cash_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_closings" TO "service_role";



GRANT ALL ON TABLE "public"."cash_openings" TO "anon";
GRANT ALL ON TABLE "public"."cash_openings" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_openings" TO "service_role";



GRANT ALL ON TABLE "public"."closing_checklist_entries" TO "anon";
GRANT ALL ON TABLE "public"."closing_checklist_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."closing_checklist_entries" TO "service_role";



GRANT ALL ON TABLE "public"."closing_checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."closing_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."closing_checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."credit_entries" TO "anon";
GRANT ALL ON TABLE "public"."credit_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_entries" TO "service_role";



GRANT ALL ON TABLE "public"."credit_payments" TO "anon";
GRANT ALL ON TABLE "public"."credit_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_payments" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."daily_alerts" TO "anon";
GRANT ALL ON TABLE "public"."daily_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."demand_estimates" TO "anon";
GRANT ALL ON TABLE "public"."demand_estimates" TO "authenticated";
GRANT ALL ON TABLE "public"."demand_estimates" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."incomes" TO "anon";
GRANT ALL ON TABLE "public"."incomes" TO "authenticated";
GRANT ALL ON TABLE "public"."incomes" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_writeoffs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_writeoffs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_writeoffs" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_entries" TO "anon";
GRANT ALL ON TABLE "public"."payroll_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_entries" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_periods" TO "anon";
GRANT ALL ON TABLE "public"."payroll_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_periods" TO "service_role";



GRANT ALL ON TABLE "public"."physical_count_items" TO "anon";
GRANT ALL ON TABLE "public"."physical_count_items" TO "authenticated";
GRANT ALL ON TABLE "public"."physical_count_items" TO "service_role";



GRANT ALL ON TABLE "public"."physical_counts" TO "anon";
GRANT ALL ON TABLE "public"."physical_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."physical_counts" TO "service_role";



GRANT ALL ON TABLE "public"."product_formats" TO "anon";
GRANT ALL ON TABLE "public"."product_formats" TO "authenticated";
GRANT ALL ON TABLE "public"."product_formats" TO "service_role";



GRANT ALL ON TABLE "public"."product_prices" TO "anon";
GRANT ALL ON TABLE "public"."product_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."product_prices" TO "service_role";



GRANT ALL ON TABLE "public"."product_store_assignments" TO "anon";
GRANT ALL ON TABLE "public"."product_store_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."product_store_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."production_recipe_inputs" TO "anon";
GRANT ALL ON TABLE "public"."production_recipe_inputs" TO "authenticated";
GRANT ALL ON TABLE "public"."production_recipe_inputs" TO "service_role";



GRANT ALL ON TABLE "public"."production_recipes" TO "anon";
GRANT ALL ON TABLE "public"."production_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."production_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."production_record_items" TO "anon";
GRANT ALL ON TABLE "public"."production_record_items" TO "authenticated";
GRANT ALL ON TABLE "public"."production_record_items" TO "service_role";



GRANT ALL ON TABLE "public"."production_records" TO "anon";
GRANT ALL ON TABLE "public"."production_records" TO "authenticated";
GRANT ALL ON TABLE "public"."production_records" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."sale_item_additions" TO "anon";
GRANT ALL ON TABLE "public"."sale_item_additions" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_item_additions" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";



GRANT ALL ON TABLE "public"."shift_portions" TO "anon";
GRANT ALL ON TABLE "public"."shift_portions" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_portions" TO "service_role";



GRANT ALL ON TABLE "public"."stock_minimums" TO "anon";
GRANT ALL ON TABLE "public"."stock_minimums" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_minimums" TO "service_role";



GRANT ALL ON TABLE "public"."stores" TO "anon";
GRANT ALL ON TABLE "public"."stores" TO "authenticated";
GRANT ALL ON TABLE "public"."stores" TO "service_role";



GRANT ALL ON TABLE "public"."supplies" TO "anon";
GRANT ALL ON TABLE "public"."supplies" TO "authenticated";
GRANT ALL ON TABLE "public"."supplies" TO "service_role";



GRANT ALL ON TABLE "public"."transfer_items" TO "anon";
GRANT ALL ON TABLE "public"."transfer_items" TO "authenticated";
GRANT ALL ON TABLE "public"."transfer_items" TO "service_role";



GRANT ALL ON TABLE "public"."validations" TO "anon";
GRANT ALL ON TABLE "public"."validations" TO "authenticated";
GRANT ALL ON TABLE "public"."validations" TO "service_role";



GRANT ALL ON TABLE "public"."worker_store_assignments" TO "anon";
GRANT ALL ON TABLE "public"."worker_store_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_store_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































