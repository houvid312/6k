-- Migration 078: Corregir valor del enum transfer_status a 'RECEIVED' en receive_transfer_with_billing
BEGIN;

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

  IF v_transfer.status = 'RECEIVED' THEN
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

  -- 4. Actualizar estado del traslado con el valor correcto del enum ('RECEIVED')
  UPDATE transfers
  SET
    status = 'RECEIVED',
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
