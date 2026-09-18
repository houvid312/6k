-- Migration 090: Creación atómica de órdenes de traslado para prevenir fallos parciales y duplicados
BEGIN;

CREATE OR REPLACE FUNCTION create_transfer_order_atomic(
  p_from_store_id UUID,
  p_to_store_id UUID,
  p_order_date TEXT,
  p_shipping_date TEXT,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id UUID;
  v_item JSONB;
  v_order_date DATE;
  v_shipping_date DATE;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay insumos para la orden de traslado';
  END IF;

  v_order_date := CASE 
    WHEN p_order_date IS NULL OR p_order_date = '' THEN (now() AT TIME ZONE 'America/Bogota')::DATE
    ELSE p_order_date::DATE
  END;

  v_shipping_date := CASE 
    WHEN p_shipping_date IS NULL OR p_shipping_date = '' THEN NULL
    ELSE p_shipping_date::DATE
  END;

  INSERT INTO transfers (
    from_store_id,
    to_store_id,
    order_date,
    shipping_date,
    status
  ) VALUES (
    p_from_store_id,
    p_to_store_id,
    v_order_date,
    v_shipping_date,
    'PENDING'
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO transfer_items (
      transfer_id,
      supply_id,
      target_grams,
      current_inventory_grams,
      bags_to_send
    ) VALUES (
      v_transfer_id,
      (v_item->>'supplyId')::UUID,
      COALESCE((v_item->>'targetGrams')::NUMERIC, 0),
      COALESCE((v_item->>'currentInventoryGrams')::NUMERIC, 0),
      COALESCE((v_item->>'bagsToSend')::NUMERIC, 0)
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_transfer_order_atomic(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated, service_role, anon;

COMMIT;
