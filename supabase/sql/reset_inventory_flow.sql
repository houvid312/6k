-- ============================================================
-- 6K Pizza - Reset operativo del flujo de inventario
-- ============================================================
-- Uso recomendado:
-- 1. Pegar este archivo en el SQL Editor de Supabase.
-- 2. Ejecutarlo una vez con run_reset := false para revisar conteos.
-- 3. Cambiar run_reset := true dentro del bloque DO y ejecutar de nuevo.
--
-- Este reset deja la app como "dia cero" operativo:
-- - Borra movimientos, saldos y documentos transaccionales.
-- - Conserva datos maestros, Auth, trabajadores, productos, insumos,
--   recetas de venta, recetas de produccion y parametrizacion comercial.
--
-- No toca:
-- auth.users, stores, workers, products, supplies, recipes,
-- recipe_ingredients, production_recipes, production_recipe_inputs,
-- product_prices, product_formats, product_store_assignments,
-- addition_catalog, stock_minimums, demand_estimates,
-- closing_checklist_items, schedules, attendance, payroll_*,
-- credit_entries.
-- ============================================================

set lock_timeout = '10s';
set statement_timeout = '60s';

-- ============================================================
-- 1) Conteo previo de tablas que SI se van a limpiar
-- ============================================================

select 'target_reset' as scope, 'inventory' as table_name, count(*) as rows from public.inventory
union all select 'target_reset', 'purchases', count(*) from public.purchases
union all select 'target_reset', 'production_records', count(*) from public.production_records
union all select 'target_reset', 'production_record_items', count(*) from public.production_record_items
union all select 'target_reset', 'transfers', count(*) from public.transfers
union all select 'target_reset', 'transfer_items', count(*) from public.transfer_items
union all select 'target_reset', 'sales', count(*) from public.sales
union all select 'target_reset', 'sale_items', count(*) from public.sale_items
union all select 'target_reset', 'sale_item_additions', count(*) from public.sale_item_additions
union all select 'target_reset', 'shift_portions', count(*) from public.shift_portions
union all select 'target_reset', 'physical_counts', count(*) from public.physical_counts
union all select 'target_reset', 'physical_count_items', count(*) from public.physical_count_items
union all select 'target_reset', 'validations', count(*) from public.validations
union all select 'target_reset', 'daily_alerts', count(*) from public.daily_alerts
union all select 'target_reset', 'inventory_writeoffs', count(*) from public.inventory_writeoffs
union all select 'target_reset', 'cash_openings', count(*) from public.cash_openings
union all select 'target_reset', 'cash_closings', count(*) from public.cash_closings
union all select 'target_reset', 'closing_checklist_entries', count(*) from public.closing_checklist_entries
union all select 'target_reset', 'expenses', count(*) from public.expenses
order by table_name;

-- ============================================================
-- 2) Conteo de tablas que se conservan
-- ============================================================

select 'preserved' as scope, 'stores' as table_name, count(*) as rows from public.stores
union all select 'preserved', 'workers', count(*) from public.workers
union all select 'preserved', 'products', count(*) from public.products
union all select 'preserved', 'supplies', count(*) from public.supplies
union all select 'preserved', 'recipes', count(*) from public.recipes
union all select 'preserved', 'recipe_ingredients', count(*) from public.recipe_ingredients
union all select 'preserved', 'production_recipes', count(*) from public.production_recipes
union all select 'preserved', 'production_recipe_inputs', count(*) from public.production_recipe_inputs
union all select 'preserved', 'product_formats', count(*) from public.product_formats
union all select 'preserved', 'product_store_assignments', count(*) from public.product_store_assignments
union all select 'preserved', 'addition_catalog', count(*) from public.addition_catalog
union all select 'preserved', 'stock_minimums', count(*) from public.stock_minimums
union all select 'preserved', 'demand_estimates', count(*) from public.demand_estimates
union all select 'preserved', 'closing_checklist_items', count(*) from public.closing_checklist_items
order by table_name;

-- ============================================================
-- 3) Reset. Cambiar run_reset a true para ejecutar el borrado.
-- ============================================================

do $$
declare
  run_reset boolean := false;
begin
  if not run_reset then
    raise notice 'DRY RUN: no se borro nada. Cambia run_reset := true para ejecutar el reset.';
    return;
  end if;

  truncate table
    public.sale_item_additions,
    public.sale_items,
    public.sales,
    public.shift_portions,
    public.transfer_items,
    public.transfers,
    public.production_record_items,
    public.production_records,
    public.physical_count_items,
    public.physical_counts,
    public.validations,
    public.daily_alerts,
    public.inventory_writeoffs,
    public.purchases,
    public.inventory,
    public.cash_openings,
    public.closing_checklist_entries,
    public.cash_closings,
    public.expenses
  restart identity;

  raise notice 'Reset operativo de inventario ejecutado correctamente.';
end $$;

-- ============================================================
-- 4) Conteo posterior. Con run_reset := true debe quedar en cero.
-- ============================================================

select 'post_check' as scope, 'inventory' as table_name, count(*) as rows from public.inventory
union all select 'post_check', 'purchases', count(*) from public.purchases
union all select 'post_check', 'production_records', count(*) from public.production_records
union all select 'post_check', 'production_record_items', count(*) from public.production_record_items
union all select 'post_check', 'transfers', count(*) from public.transfers
union all select 'post_check', 'transfer_items', count(*) from public.transfer_items
union all select 'post_check', 'sales', count(*) from public.sales
union all select 'post_check', 'sale_items', count(*) from public.sale_items
union all select 'post_check', 'sale_item_additions', count(*) from public.sale_item_additions
union all select 'post_check', 'shift_portions', count(*) from public.shift_portions
union all select 'post_check', 'physical_counts', count(*) from public.physical_counts
union all select 'post_check', 'physical_count_items', count(*) from public.physical_count_items
union all select 'post_check', 'validations', count(*) from public.validations
union all select 'post_check', 'daily_alerts', count(*) from public.daily_alerts
union all select 'post_check', 'inventory_writeoffs', count(*) from public.inventory_writeoffs
union all select 'post_check', 'cash_openings', count(*) from public.cash_openings
union all select 'post_check', 'cash_closings', count(*) from public.cash_closings
union all select 'post_check', 'closing_checklist_entries', count(*) from public.closing_checklist_entries
union all select 'post_check', 'expenses', count(*) from public.expenses
order by table_name;

-- ============================================================
-- 5) Primeras acciones esperadas despues del reset
-- ============================================================
-- 1. Registrar compras en Centro de Produccion: crea purchases y suma RAW.
-- 2. Registrar produccion: descuenta RAW, suma PROCESSED y crea historial.
-- 3. Crear/recibir traslados: descuenta PROCESSED, suma STORE.
-- 4. Registrar ventas: crea sales/sale_items/sale_item_additions y descuenta
--    receta + adiciones + empaque desde STORE.
-- 5. Registrar conteo fisico: crea physical_counts/items y ajusta STORE.
-- 6. Cerrar caja/regenerar alertas: crea cash_closings y daily_alerts.
