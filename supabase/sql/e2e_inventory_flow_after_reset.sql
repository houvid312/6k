-- ============================================================
-- 6K Pizza - Flujo E2E de inventario despues del reset
-- ============================================================
-- Precondicion: ejecutar primero supabase/sql/reset_inventory_flow.sql
-- con run_reset := true.
--
-- Este script crea una corrida completa y auditable:
-- 1. Conteo fisico inicial de tienda.
-- 2. Compra de materia prima en Centro de Produccion.
-- 3. Produccion: RAW -> PROCESSED.
-- 4. Traslado recibido: PROCESSED -> STORE.
-- 5. Venta con receta + adicion + empaque.
-- 6. Conteo fisico final.
-- 7. Apertura/cierre de caja.
-- 8. Alertas diarias OK calculadas con receta + adicion + empaque.
-- ============================================================

set lock_timeout = '10s';
set statement_timeout = '60s';

create temp table if not exists __e2e_inventory_flow_report (
  step_order int,
  step text,
  entity_id uuid,
  detail text
) on commit drop;

truncate __e2e_inventory_flow_report;

do $$
declare
  v_today date := ((now() at time zone 'America/Bogota')::date);
  v_now timestamptz := now();

  v_cp uuid := '00000000-0000-0000-0000-000000000001';
  v_store uuid := '00000000-0000-0000-0000-000000000002';
  v_worker uuid;

  v_product uuid;
  v_format uuid;
  v_format_name text;
  v_format_portions int;
  v_format_price int;
  v_recipe uuid;

  v_production_recipe uuid;
  v_processed_supply uuid;
  v_processed_supply_name text;
  v_processed_grams_per_bag numeric;
  v_batches int := 1;
  v_total_produced numeric;
  v_transfer_bags int := 3;
  v_transfer_grams numeric;

  v_addition_catalog uuid;
  v_addition_supply uuid;
  v_addition_name text;
  v_addition_grams int;
  v_addition_price int;
  v_packaging_supply uuid := '00000000-0000-0000-0002-000000000103';

  v_purchase_count int;
  v_open_count uuid := gen_random_uuid();
  v_production_record uuid := gen_random_uuid();
  v_transfer uuid := gen_random_uuid();
  v_sale uuid := gen_random_uuid();
  v_sale_item uuid := gen_random_uuid();
  v_final_count uuid := gen_random_uuid();
  v_cash_opening uuid := gen_random_uuid();
  v_cash_closing uuid := gen_random_uuid();

  v_total_amount int;
begin
  select id into v_worker
  from public.workers
  where username = 'david' and is_active = true
  limit 1;

  if v_worker is null then
    select id into v_worker
    from public.workers
    where user_role = 'ADMIN' and is_active = true
    order by created_at desc
    limit 1;
  end if;

  select id into v_product
  from public.products
  where name = 'Maicitos' and is_active = true
  limit 1;

  select id, name, portions, price
  into v_format, v_format_name, v_format_portions, v_format_price
  from public.product_formats
  where product_id = v_product
    and name = 'Individual'
    and is_active = true
  order by sort_order
  limit 1;

  select id into v_recipe
  from public.recipes
  where product_id = v_product;

  select pr.id, pr.supply_id, s.name, s.grams_per_bag, pr.output_grams
  into v_production_recipe, v_processed_supply, v_processed_supply_name,
       v_processed_grams_per_bag, v_total_produced
  from public.production_recipes pr
  join public.supplies s on s.id = pr.supply_id
  where pr.is_active = true
    and pr.name ilike '%maicitos%'
  order by pr.name
  limit 1;

  select ac.id, ac.supply_id, ac.name, ac.grams, ac.price
  into v_addition_catalog, v_addition_supply, v_addition_name, v_addition_grams,
       v_addition_price
  from public.addition_catalog ac
  where ac.format_id = v_format
    and ac.name = 'Extra Queso'
    and ac.is_active = true
  limit 1;

  if v_worker is null or v_product is null or v_format is null or v_recipe is null
     or v_production_recipe is null or v_addition_catalog is null then
    raise exception 'Faltan maestros para ejecutar el flujo E2E';
  end if;

  v_transfer_grams := v_transfer_bags * v_processed_grams_per_bag;
  v_total_amount := v_format_price + v_addition_price;

  -- 1) Conteo inicial de tienda con stock base para la venta.
  insert into public.physical_counts (id, store_id, worker_id, created_at)
  values (v_open_count, v_store, v_worker, v_now - interval '2 hours');

  with stock_seed_raw as (
    select ri.supply_id, 10000::numeric as total_grams
    from public.recipe_ingredients ri
    where ri.recipe_id = v_recipe
    union all
    select v_addition_supply, 10000::numeric
    union all
    select v_packaging_supply, 10::numeric
    union all
    select v_processed_supply, 0::numeric
  ),
  stock_seed as (
    select supply_id, max(total_grams) as total_grams
    from stock_seed_raw
    group by supply_id
  )
  insert into public.physical_count_items (
    physical_count_id,
    supply_id,
    bags,
    loose_grams,
    total_grams
  )
  select
    v_open_count,
    ss.supply_id,
    case when coalesce(s.grams_per_bag, 0) > 0 then floor(ss.total_grams / s.grams_per_bag)::int else 0 end,
    case when coalesce(s.grams_per_bag, 0) > 0 then mod(ss.total_grams, s.grams_per_bag) else ss.total_grams end,
    ss.total_grams
  from stock_seed ss
  join public.supplies s on s.id = ss.supply_id;

  insert into public.inventory (store_id, supply_id, level, quantity_grams, last_updated)
  select v_store, supply_id, 'STORE', total_grams, v_now - interval '2 hours'
  from public.physical_count_items
  where physical_count_id = v_open_count
  on conflict (supply_id, store_id, level)
  do update set quantity_grams = excluded.quantity_grams,
                last_updated = excluded.last_updated;

  insert into __e2e_inventory_flow_report
  values (1, 'conteo_inicial_store', v_open_count, 'Stock inicial de tienda para receta, adicion, empaque y procesado.');

  -- 2) Compras: el trigger suma RAW en Centro de Produccion.
  insert into public.purchases (
    id,
    store_id,
    supply_id,
    quantity_grams,
    price_cop,
    supplier,
    payment_method,
    created_at
  )
  select
    gen_random_uuid(),
    v_cp,
    pri.supply_id,
    greatest(pri.grams_required * v_batches, 1000),
    5000,
    'E2E_INV_RESET_' || v_today::text,
    'EFECTIVO',
    v_now - interval '90 minutes'
  from public.production_recipe_inputs pri
  where pri.production_recipe_id = v_production_recipe;

  get diagnostics v_purchase_count = row_count;

  insert into __e2e_inventory_flow_report
  values (2, 'compras_raw_cp', null, v_purchase_count || ' compras registradas; trigger add_purchase_to_raw_inventory alimenta RAW.');

  -- 3) Produccion: descontar RAW inputs, sumar PROCESSED output y guardar trazabilidad.
  insert into public.production_records (
    id,
    store_id,
    worker_id,
    production_recipe_id,
    batches,
    total_grams_produced,
    notes,
    created_at
  )
  values (
    v_production_record,
    v_cp,
    v_worker,
    v_production_recipe,
    v_batches,
    v_total_produced * v_batches,
    'E2E despues de reset',
    v_now - interval '70 minutes'
  );

  insert into public.production_record_items (
    production_record_id,
    supply_id,
    grams_consumed
  )
  select
    v_production_record,
    supply_id,
    grams_required * v_batches
  from public.production_recipe_inputs
  where production_recipe_id = v_production_recipe;

  insert into public.inventory (store_id, supply_id, level, quantity_grams, last_updated)
  select
    v_cp,
    supply_id,
    'RAW',
    -(grams_required * v_batches),
    v_now - interval '70 minutes'
  from public.production_recipe_inputs
  where production_recipe_id = v_production_recipe
  on conflict (supply_id, store_id, level)
  do update set quantity_grams = public.inventory.quantity_grams - excluded.quantity_grams * -1,
                last_updated = excluded.last_updated;

  insert into public.inventory (store_id, supply_id, level, quantity_grams, last_updated)
  values (
    v_cp,
    v_processed_supply,
    'PROCESSED',
    v_total_produced * v_batches,
    v_now - interval '70 minutes'
  )
  on conflict (supply_id, store_id, level)
  do update set quantity_grams = public.inventory.quantity_grams + excluded.quantity_grams,
                last_updated = excluded.last_updated;

  insert into __e2e_inventory_flow_report
  values (3, 'produccion_cp', v_production_record, 'RAW descontado y PROCESSED producido.');

  -- 4) Traslado recibido: PROCESSED CP -> STORE Local 2.
  insert into public.transfers (
    id,
    from_store_id,
    to_store_id,
    status,
    order_date,
    shipping_date,
    received_at,
    created_at
  )
  values (
    v_transfer,
    v_cp,
    v_store,
    'RECEIVED',
    v_today,
    v_today,
    v_now - interval '45 minutes',
    v_now - interval '50 minutes'
  );

  insert into public.transfer_items (
    transfer_id,
    supply_id,
    target_grams,
    current_inventory_grams,
    bags_to_send
  )
  values (v_transfer, v_processed_supply, v_transfer_grams, 0, v_transfer_bags);

  insert into public.inventory (store_id, supply_id, level, quantity_grams, last_updated)
  values (v_cp, v_processed_supply, 'PROCESSED', -v_transfer_grams, v_now - interval '45 minutes')
  on conflict (supply_id, store_id, level)
  do update set quantity_grams = public.inventory.quantity_grams - v_transfer_grams,
                last_updated = excluded.last_updated;

  insert into public.inventory (store_id, supply_id, level, quantity_grams, last_updated)
  values (v_store, v_processed_supply, 'STORE', v_transfer_grams, v_now - interval '45 minutes')
  on conflict (supply_id, store_id, level)
  do update set quantity_grams = public.inventory.quantity_grams + v_transfer_grams,
                last_updated = excluded.last_updated;

  insert into __e2e_inventory_flow_report
  values (4, 'traslado_recibido', v_transfer, v_transfer_bags || ' bolsas de ' || v_processed_supply_name || ' recibidas en tienda.');

  -- 5) Venta: receta + adicion + empaque. La RPC hace los descuentos STORE.
  insert into public.sales (
    id,
    store_id,
    worker_id,
    payment_method,
    total_portions,
    total_amount,
    cash_amount,
    bank_amount,
    observations,
    created_at,
    is_paid,
    customer_note,
    is_dispatched,
    packaging_supply_id
  )
  values (
    v_sale,
    v_store,
    v_worker,
    'EFECTIVO',
    v_format_portions,
    v_total_amount,
    v_total_amount,
    0,
    'E2E reset inventario',
    v_now - interval '30 minutes',
    true,
    'Flujo completo despues de reset',
    true,
    v_packaging_supply
  );

  insert into public.sale_items (
    id,
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
  values (
    v_sale_item,
    v_sale,
    v_product,
    null,
    v_format,
    v_format_name,
    1,
    v_format_portions,
    v_format_price,
    v_total_amount,
    v_addition_price
  );

  insert into public.sale_item_additions (
    sale_item_id,
    addition_catalog_id,
    supply_id,
    name,
    price,
    grams,
    quantity,
    created_at
  )
  values (
    v_sale_item,
    v_addition_catalog,
    v_addition_supply,
    v_addition_name,
    v_addition_price,
    v_addition_grams,
    1,
    v_now - interval '30 minutes'
  );

  perform public.deduct_inventory_for_sale(v_sale);

  insert into __e2e_inventory_flow_report
  values (5, 'venta_con_receta_adicion_empaque', v_sale, 'Venta Maicitos Individual + Extra Queso + empaque; RPC desconto inventario STORE.');

  -- 6) Conteo final: cuenta lo que realmente quedo en STORE.
  insert into public.physical_counts (id, store_id, worker_id, created_at)
  values (v_final_count, v_store, v_worker, v_now - interval '10 minutes');

  insert into public.physical_count_items (
    physical_count_id,
    supply_id,
    bags,
    loose_grams,
    total_grams
  )
  select
    v_final_count,
    i.supply_id,
    case when coalesce(s.grams_per_bag, 0) > 0 then floor(i.quantity_grams / s.grams_per_bag)::int else 0 end,
    case when coalesce(s.grams_per_bag, 0) > 0 then mod(i.quantity_grams, s.grams_per_bag) else i.quantity_grams end,
    i.quantity_grams
  from public.inventory i
  join public.supplies s on s.id = i.supply_id
  where i.store_id = v_store
    and i.level = 'STORE';

  insert into __e2e_inventory_flow_report
  values (6, 'conteo_final_store', v_final_count, 'Conteo final coincide con inventario luego de venta.');

  -- 7) Apertura y cierre de caja.
  insert into public.cash_openings (
    id,
    store_id,
    date,
    denominations,
    total,
    opened_by,
    created_at
  )
  values (
    v_cash_opening,
    v_store,
    v_today::text,
    jsonb_build_object('bills50k', 1, 'coins', 3600),
    53600,
    v_worker,
    v_now - interval '3 hours'
  );

  insert into public.cash_closings (
    id,
    store_id,
    date,
    bills_100k,
    bills_50k,
    bills_20k,
    bills_10k,
    bills_5k,
    bills_2k,
    coins,
    bank_total,
    expected_total,
    actual_total,
    discrepancy,
    expenses,
    created_at,
    status,
    confirmed_by_worker_id,
    approved_by_worker_id
  )
  values (
    v_cash_closing,
    v_store,
    v_today,
    0,
    0,
    0,
    0,
    0,
    0,
    v_total_amount,
    0,
    v_total_amount,
    v_total_amount,
    0,
    0,
    v_now,
    'APPROVED',
    v_worker,
    v_worker
  );

  insert into __e2e_inventory_flow_report
  values (7, 'cierre_caja', v_cash_closing, 'Cierre aprobado con venta E2E incluida.');

  -- 8) Alertas diarias alineadas con receta + adicion + empaque.
  with initial_inventory as (
    select supply_id, total_grams
    from public.physical_count_items
    where physical_count_id = v_open_count
  ),
  final_inventory as (
    select supply_id, total_grams
    from public.physical_count_items
    where physical_count_id = v_final_count
  ),
  transfer_entries as (
    select v_processed_supply as supply_id, v_transfer_grams as grams
  ),
  theoretical_consumption as (
    select ri.supply_id, sum(ri.grams_per_portion * v_format_portions)::numeric as grams
    from public.recipe_ingredients ri
    where ri.recipe_id = v_recipe
    group by ri.supply_id
    union all
    select v_addition_supply, v_addition_grams::numeric
    union all
    select v_packaging_supply, 1::numeric
  ),
  theoretical_by_supply as (
    select supply_id, sum(grams) as grams
    from theoretical_consumption
    group by supply_id
  ),
  supply_ids as (
    select supply_id from initial_inventory
    union
    select supply_id from final_inventory
    union
    select supply_id from transfer_entries
    union
    select supply_id from theoretical_by_supply
  ),
  calc as (
    select
      si.supply_id,
      coalesce(ii.total_grams, 0) as initial_grams,
      coalesce(te.grams, 0) as entry_grams,
      coalesce(tc.grams, 0) as consumed_grams,
      coalesce(fi.total_grams, 0) as final_real_grams
    from supply_ids si
    left join initial_inventory ii on ii.supply_id = si.supply_id
    left join transfer_entries te on te.supply_id = si.supply_id
    left join theoretical_by_supply tc on tc.supply_id = si.supply_id
    left join final_inventory fi on fi.supply_id = si.supply_id
  )
  insert into public.daily_alerts (
    store_id,
    date,
    physical_count_id,
    closing_worker_id,
    count_worker_id,
    supply_id,
    theoretical_grams,
    real_grams,
    difference_grams,
    difference_percent,
    alert_type,
    created_at
  )
  select
    v_store,
    v_today,
    v_final_count,
    v_worker,
    v_worker,
    supply_id,
    round(initial_grams + entry_grams - consumed_grams, 2),
    round(final_real_grams, 2),
    round(final_real_grams - (initial_grams + entry_grams - consumed_grams), 2),
    case
      when coalesce(nullif(consumed_grams, 0), nullif(initial_grams + entry_grams, 0)) is null then 0
      else round(
        (
          (final_real_grams - (initial_grams + entry_grams - consumed_grams))
          / coalesce(nullif(consumed_grams, 0), nullif(initial_grams + entry_grams, 0))
        ) * 100,
        2
      )
    end,
    case
      when final_real_grams - (initial_grams + entry_grams - consumed_grams) < 0 then 'LOSS'::alert_type
      when final_real_grams - (initial_grams + entry_grams - consumed_grams) > 0 then 'SURPLUS'::alert_type
      else 'OK'::alert_type
    end,
    v_now
  from calc;

  insert into __e2e_inventory_flow_report
  values (8, 'alertas_diarias', null, 'Alertas generadas incluyendo receta, adicion y empaque.');
end $$;

select *
from __e2e_inventory_flow_report
order by step_order;

select
  st.name as store,
  i.level,
  s.name as supply,
  i.quantity_grams
from public.inventory i
join public.stores st on st.id = i.store_id
join public.supplies s on s.id = i.supply_id
where st.id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
)
order by st.name, i.level, s.name;

select
  da.alert_type,
  s.name as supply,
  da.theoretical_grams,
  da.real_grams,
  da.difference_grams,
  da.difference_percent
from public.daily_alerts da
join public.supplies s on s.id = da.supply_id
where da.date = ((now() at time zone 'America/Bogota')::date)
order by da.alert_type, s.name;
