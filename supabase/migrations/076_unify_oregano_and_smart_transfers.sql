-- Migration 076: Unificar Orégano, limpiar saldos residuales de especias en CP y actualizar traslados inteligentes
BEGIN;

-- 1. Fusionar saldos de 'Oregano' (PROCESSED) hacia 'Orégano Molido' (RAW)
-- Trasladar saldos de tiendas (STORE) hacia 'Orégano Molido'
DO $$
DECLARE
  v_old_oregano_id UUID := '2d462031-5768-4781-b2cd-bff7cafdc859';
  v_canonical_oregano_id UUID := 'cf7a5f14-c749-483c-8d12-009505d91ea0';
  r RECORD;
BEGIN
  -- Actualizar transfer_items
  UPDATE transfer_items SET supply_id = v_canonical_oregano_id WHERE supply_id = v_old_oregano_id;
  
  -- Actualizar purchases
  UPDATE purchases SET supply_id = v_canonical_oregano_id WHERE supply_id = v_old_oregano_id;

  -- Fusionar saldos en tiendas (STORE)
  FOR r IN 
    SELECT store_id, level, quantity_grams 
    FROM inventory 
    WHERE supply_id = v_old_oregano_id AND level = 'STORE' AND quantity_grams > 0
  LOOP
    INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
    VALUES (r.store_id, v_canonical_oregano_id, r.level, r.quantity_grams, now())
    ON CONFLICT (supply_id, store_id, level)
    DO UPDATE SET 
      quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
      last_updated = now();
  END LOOP;

  -- Limpiar inventario del duplicado
  DELETE FROM inventory WHERE supply_id = v_old_oregano_id;

  -- Desactivar el insumo duplicado
  UPDATE supplies SET is_active = false WHERE id = v_old_oregano_id;

  -- Asegurar que el canónico esté activo
  UPDATE supplies SET is_active = true WHERE id = v_canonical_oregano_id;
END $$;

-- 2. Limpiar saldos negativos residuales en PROCESSED para especias en CP (Pimienta Cayena, Pimienta negra, etc.)
DO $$
DECLARE
  v_cp_id UUID;
  r RECORD;
BEGIN
  SELECT id INTO v_cp_id FROM stores WHERE is_production_center = true LIMIT 1;
  IF v_cp_id IS NOT NULL THEN
    -- Para insumos RAW que quedaron con saldo negativo en PROCESSED en el CP debido a traslados antiguos:
    FOR r IN
      SELECT inv.supply_id, inv.quantity_grams
      FROM inventory inv
      JOIN supplies s ON s.id = inv.supply_id
      WHERE inv.store_id = v_cp_id AND inv.level = 'PROCESSED' AND inv.quantity_grams < 0 AND s.category = 'RAW'
    LOOP
      -- Descontar ese valor del nivel RAW y poner en 0 el nivel PROCESSED
      UPDATE inventory 
      SET quantity_grams = quantity_grams + r.quantity_grams, last_updated = now()
      WHERE store_id = v_cp_id AND supply_id = r.supply_id AND level = 'RAW';

      DELETE FROM inventory 
      WHERE store_id = v_cp_id AND supply_id = r.supply_id AND level = 'PROCESSED';
    END LOOP;
  END IF;
END $$;

-- 3. Actualizar la funcion receive_transfer_with_billing para descontar del nivel correcto en el origen (CP)
DROP FUNCTION IF EXISTS receive_transfer_with_billing(UUID);

CREATE OR REPLACE FUNCTION receive_transfer_with_billing(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_total_cost_cop NUMERIC := 0;
  v_grams_to_transfer NUMERIC;
  v_from_level TEXT;
  v_is_cp BOOLEAN;
  v_current_origin_grams NUMERIC;
  v_current_destination_grams NUMERIC;
  v_description TEXT;
  v_from_store_name TEXT;
  v_to_store_name TEXT;
  v_transfer_number TEXT;
  v_expense_id UUID;
BEGIN
  -- 1. Obtener y validar el traslado
  SELECT t.*, sf.name as from_store_name, st.name as to_store_name
  INTO v_transfer
  FROM transfers t
  JOIN stores sf ON sf.id = t.from_store_id
  JOIN stores st ON st.id = t.to_store_id
  WHERE t.id = p_transfer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Traslado no encontrado');
  END IF;

  IF v_transfer.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El traslado ya fue recibido');
  END IF;

  v_from_store_name := v_transfer.from_store_name;
  v_to_store_name := v_transfer.to_store_name;
  v_transfer_number := COALESCE(v_transfer.transfer_number, 'TR-' || substr(p_transfer_id::text, 1, 8));

  -- Determinar si el origen es Centro de Produccion
  SELECT is_production_center INTO v_is_cp FROM stores WHERE id = v_transfer.from_store_id;

  -- 2. Procesar cada item del traslado
  FOR v_item IN
    SELECT 
      ti.id as transfer_item_id,
      ti.supply_id,
      ti.quantity_bags,
      ti.loose_grams,
      ti.cost_per_bag_cop,
      ti.total_cost_cop,
      ti.received_bags,
      ti.received_loose_grams,
      s.name as supply_name,
      s.grams_per_bag,
      s.is_billable_to_store,
      s.category as supply_category
    FROM transfer_items ti
    JOIN supplies s ON s.id = ti.supply_id
    WHERE ti.transfer_id = p_transfer_id
  LOOP
    -- Calcular gramos a transferir
    v_grams_to_transfer := (COALESCE(v_item.received_bags, v_item.quantity_bags) * v_item.grams_per_bag)
                           + COALESCE(v_item.received_loose_grams, v_item.loose_grams, 0);

    -- Determinar el nivel en la sede de origen:
    IF COALESCE(v_is_cp, false) THEN
      IF v_item.supply_category = 'RAW' THEN
        v_from_level := 'RAW';
      ELSE
        v_from_level := 'PROCESSED';
      END IF;
    ELSE
      v_from_level := 'STORE';
    END IF;

    -- Obtener stock actual de origen
    SELECT quantity_grams INTO v_current_origin_grams
    FROM inventory
    WHERE store_id = v_transfer.from_store_id
      AND supply_id = v_item.supply_id
      AND level = v_from_level;

    v_current_origin_grams := COALESCE(v_current_origin_grams, 0);

    -- Obtener stock actual de destino
    SELECT quantity_grams INTO v_current_destination_grams
    FROM inventory
    WHERE store_id = v_transfer.to_store_id
      AND supply_id = v_item.supply_id
      AND level = 'STORE';

    v_current_destination_grams := COALESCE(v_current_destination_grams, 0);

    -- Descontar en origen
    INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
    VALUES (v_transfer.from_store_id, v_item.supply_id, v_from_level, -v_grams_to_transfer, now())
    ON CONFLICT (supply_id, store_id, level)
    DO UPDATE SET
      quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
      last_updated = now();

    -- Sumar en destino (siempre en STORE)
    INSERT INTO inventory (store_id, supply_id, level, quantity_grams, last_updated)
    VALUES (v_transfer.to_store_id, v_item.supply_id, 'STORE', v_grams_to_transfer, now())
    ON CONFLICT (supply_id, store_id, level)
    DO UPDATE SET
      quantity_grams = inventory.quantity_grams + EXCLUDED.quantity_grams,
      last_updated = now();

    -- Actualizar transfer_item con datos de inventario
    UPDATE transfer_items
    SET
      previous_origin_grams = v_current_origin_grams,
      new_origin_grams = v_current_origin_grams - v_grams_to_transfer,
      previous_destination_grams = v_current_destination_grams,
      new_destination_grams = v_current_destination_grams + v_grams_to_transfer,
      received_bags = COALESCE(v_item.received_bags, v_item.quantity_bags),
      received_loose_grams = COALESCE(v_item.received_loose_grams, v_item.loose_grams, 0)
    WHERE id = v_item.transfer_item_id;

    -- Si es cobrable, sumar al costo total
    IF v_item.is_billable_to_store THEN
      v_total_cost_cop := v_total_cost_cop + COALESCE(v_item.total_cost_cop, 0);
    END IF;
  END LOOP;

  -- 3. Crear Gasto automatico en destino si hubo costo
  IF v_total_cost_cop > 0 THEN
    v_description := 'Despacho de Produccion #' || v_transfer_number || ' desde ' || v_from_store_name;
    
    INSERT INTO expenses (
      store_id,
      description,
      amount_cop,
      category,
      payment_method,
      supplier_name,
      invoice_number,
      created_by,
      created_at
    )
    VALUES (
      v_transfer.to_store_id,
      v_description,
      v_total_cost_cop,
      'INSUMOS',
      'TRANSFERENCIA',
      v_from_store_name,
      v_transfer_number,
      v_transfer.received_by,
      now()
    )
    RETURNING id INTO v_expense_id;
  END IF;

  -- 4. Actualizar estado del traslado
  UPDATE transfers
  SET
    status = 'COMPLETED',
    total_cost_cop = v_total_cost_cop,
    expense_id = v_expense_id,
    updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', p_transfer_id,
    'total_cost_cop', v_total_cost_cop,
    'expense_id', v_expense_id
  );
END;
$$;

COMMIT;
