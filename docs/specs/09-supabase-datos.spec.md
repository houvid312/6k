# Persistencia Supabase y contratos de datos

## Alcance

Cubre:

- `supabase/migrations/001_initial_schema.sql` a `027_inventory_flow_fixes.sql`
- `src/data/repositories/*`
- `src/domain/entities/*`
- `src/domain/enums/*`
- `src/di/container.ts`

## Convenciones

- Entidades TS: `PascalCase`.
- Propiedades TS: `camelCase`.
- Tablas/columnas DB: `snake_case`.
- Enums DB: strings.
- Repositorios convierten DB <-> dominio en funciones mapper.

## Enums principales

- `payment_method`: `EFECTIVO`, `TRANSFERENCIA`, `MIXTO`.
- `inventory_level`: `RAW`, `PROCESSED`, `STORE`.
- `transfer_status`: `PENDING`, `IN_TRANSIT`, `RECEIVED`, `CANCELLED`.
- `user_role`: `ADMIN`, `COLABORADOR`.
- `worker_role`: incluye `PREPARADOR`, `ADMINISTRADOR`, `CAJERO`,
  `HORNERO`, `ESTIRADOR`, `COORDINADOR`.
- `closing_status`: `DRAFT`, `CONFIRMED`, `APPROVED`.
- `writeoff_status`: `PENDING`, `APPROVED`, `REJECTED`.
- `writeoff_reason`: `DAMAGED`, `EXPIRED`, `SPILLED`, `CONTAMINATED`, `OTHER`.
- `alert_type`: `LOSS`, `SURPLUS`, `OK`.

## Tablas funcionales

Core:

- `stores`
- `workers`
- `products`
- `supplies`

Ventas:

- `sales`
- `sale_items`
- `sale_item_additions`
- `product_formats`
- `product_store_assignments`
- `addition_catalog`
- `shift_portions`

Inventario:

- `inventory`
- `purchases`
- `transfers`
- `transfer_items`
- `physical_counts`
- `physical_count_items`
- `validations`
- `daily_alerts`
- `stock_minimums`
- `inventory_writeoffs`
- `production_recipes`
- `production_recipe_inputs`
- `production_records`
- `production_record_items`
- `demand_estimates`

Caja y contabilidad:

- `cash_openings`
- `cash_closings`
- `expenses`

Cartera/RRHH:

- `credit_entries`
- `schedules`
- `attendance`
- `payroll_entries`
- `payroll_periods`

Checklist:

- `checklist_items`

## Auth y workers

Regla critica:

- Nunca crear usuarios de Supabase Auth con `INSERT` directo por SQL.
- Los usuarios Auth se crean por Supabase Dashboard o Admin API.
- La app vincula sesion Auth con `workers.auth_user_id`.
- Login operativo por username busca worker activo.

## RLS y permisos

RLS esta activo en tablas principales segun migraciones.

Helpers relevantes:

- `get_user_role()`.
- `get_worker_role()`.
- `is_inventory_operator()`.
- `is_transfer_operator()`.

Permisos operativos destacados:

- Operadores de inventario pueden gestionar `inventory`.
- Operadores de traslado pueden gestionar `transfers` y `transfer_items`.
- Produccion permite insert de records a admin o roles operativos definidos.
- Conteo fisico permite insert a admin, cajero, administrador o coordinador.
- Bajas pueden ser leidas/creadas por autenticados; solo admin actualiza estado.

## RPC de descuento por venta

`deduct_inventory_for_sale(p_sale_id)`:

- Se ejecuta despues de insertar venta, items y adiciones.
- Descuenta ingredientes de receta por `item.portions`.
- Descuenta adiciones por `grams * quantity`.
- Descuenta empaque si existe `packaging_supply_id`.
- Usa helper que crea saldo negativo si no existe inventario `STORE`.

Contrato importante:

- La venta no depende transaccionalmente de que el descuento RPC termine bien en
  el cliente actual. Si RPC falla, se registra error en consola y la venta queda
  creada.

## Repositorios

### Sale

- Hidrata ventas con items y adiciones.
- `getByDateRange` acepta fechas `YYYY-MM-DD` y agrega limites horarios si no
  vienen con `T`.
- `getUnpaid` retorna ventas no pagadas o no despachadas.
- `markAsPaid`, `markAsUnpaid`, `markAsDispatched` validan que la actualizacion
  retorne filas.
- `delete` elimina venta y deja cascade en `sale_items`.

### Inventory

- Mapea `InventoryLevel` numerico TS a strings DB.
- `deductGrams` permite saldos negativos.
- `addGrams` y `setQuantity` hacen upsert manual.

### Transfer

- Hidrata items.
- `getByStore` busca origen o destino.
- `getReceivedByDestination` filtra por `received_at`.
- `updateStatus(RECEIVED)` agrega `received_at` y `shipping_date`.

### Cash closing/opening

- `cash_closings` tiene unico por `store_id + date`.
- `cash_openings` tiene unico por `store_id + date`.
- Denominaciones se guardan como columnas en cierre y JSON en apertura.

### Attendance

- `upsert` usa conflicto `worker_id,store_id,date`.
- Debe existir constraint/indice unico compatible en DB para que el upsert sea
  confiable.

## Inyeccion de dependencias

`src/di/container.ts` registra singletons de:

- repositorios Supabase.
- servicios de dominio.

Al agregar funcionalidad nueva:

1. Crear entidad.
2. Crear interfaz de repositorio.
3. Crear implementacion Supabase.
4. Crear servicio si hay reglas de negocio.
5. Registrar repo/servicio en `container.ts`.
6. Exportar desde `index.ts` correspondiente.
7. Actualizar specs.

## Migraciones recientes relevantes

- `018_product_formats`: formatos dinamicos, asignaciones por sede,
  `products.has_recipe`.
- `019_adiciones`: catalogo de adiciones, snapshots en venta, Pizza Diamante.
- `021_cash_openings`: apertura de caja.
- `022_closing_checklist`: checklist de cierre.
- `023_rrhh_improvements`: clock in/out, periodos de nomina.
- `025_sale_items_size_nullable`: compatibilidad con formatos sin size legacy.
- `026_cash_closings_update_policy`: permisos de actualizacion de cierres.
- `027_inventory_flow_fixes`: `received_at`, RPC completa de descuento, RLS de
  inventario/traslados/produccion/conteos/alertas.

## Escenarios de prueba de datos

- Crear venta con adiciones inserta sales, sale_items y sale_item_additions.
- RPC de venta descuenta recipe + adiciones + empaque.
- `getUnpaid` incluye ventas despachadas pero no pagadas, y pagadas no
  despachadas.
- `deductGrams` sobre inventario inexistente crea fila negativa.
- Recibir traslado guarda `received_at`.
- Crear apertura duplicada falla por unico.
- Crear cierre duplicado falla por unico si no se actualiza existente.
- Upsert de asistencia no duplica por worker/local/date.
