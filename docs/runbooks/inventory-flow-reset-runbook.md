# Reset operativo del flujo de inventario

## Objetivo

Dejar la app en un estado de inicio operativo, sin movimientos ni saldos, pero
manteniendo los datos maestros que permiten volver a operar inmediatamente:
locales, trabajadores, productos, insumos, recetas de venta, recetas de
produccion, formatos, asignaciones, adiciones, minimos y demanda estimada.

El archivo ejecutable esta en `supabase/sql/reset_inventory_flow.sql`.
Para reconstruir un caso base tecnico despues del reset, usar
`supabase/sql/e2e_inventory_flow_after_reset.sql`. Para validar funcionalidad
real, crear los registros desde la UI y usar SQL solo para auditar.

## Alcance del borrado

Se limpian las tablas transaccionales del flujo:

- Inventario actual: `inventory`.
- Compras: `purchases`.
- Produccion ejecutada: `production_records`, `production_record_items`.
- Traslados: `transfers`, `transfer_items`.
- Ventas y consumo: `sales`, `sale_items`, `sale_item_additions`,
  `shift_portions`.
- Conteos y validaciones: `physical_counts`, `physical_count_items`,
  `validations`, `daily_alerts`.
- Bajas: `inventory_writeoffs`.
- Caja operativa vinculada al flujo diario: `cash_openings`, `cash_closings`,
  `closing_checklist_entries`, `expenses`.

## Datos conservados

No se tocan `auth.users` ni tablas maestras/configuracion:

- `stores`, `workers`, `products`, `supplies`.
- `recipes`, `recipe_ingredients`.
- `production_recipes`, `production_recipe_inputs`.
- `product_prices`, `product_formats`, `product_store_assignments`.
- `addition_catalog`, `stock_minimums`, `demand_estimates`.
- `closing_checklist_items`.
- RRHH/cartera fuera del flujo de inventario: `schedules`, `attendance`,
  `payroll_entries`, `payroll_periods`, `credit_entries`.

## Ejecucion segura

1. Abrir el SQL editor de Supabase del proyecto.
2. Pegar `supabase/sql/reset_inventory_flow.sql`.
3. Ejecutar con `run_reset := false` y revisar los conteos.
4. Cambiar solo esta linea dentro del bloque `DO`:

```sql
run_reset boolean := true;
```

5. Ejecutar de nuevo.
6. Confirmar que el bloque `post_check` devuelve `0` para todas las tablas
   objetivo.

## Auditoria de recetas

Antes de ejecutar un flujo real despues del reset, correr:

```text
supabase/sql/inventory_recipe_deduction_audit.sql
```

Ese archivo muestra:

- Gramos que descuenta cada producto/formato segun `recipes`.
- Gramos que descuenta cada adicion segun `addition_catalog`.
- Empaques que descuentan una unidad por venta si se seleccionan en carrito.
- Recetas de produccion que consumen `RAW` y producen `PROCESSED`.

## Flujo esperado despues del reset

1. Compra en Centro de Produccion: inserta `purchases` y el trigger suma
   inventario `RAW`.
2. Produccion: descuenta `RAW`, suma `PROCESSED` y crea
   `production_records/items`.
3. Traslado: crea `transfers/items`; al recibir descuenta `PROCESSED` del
   origen y suma `STORE` al destino.
4. Venta: inserta `sales/items/additions` y llama
   `deduct_inventory_for_sale`, que descuenta receta, adiciones y empaque.
5. Conteo fisico: crea `physical_counts/items` y ajusta inventario `STORE` al
   conteo.
6. Cierre de caja o regeneracion: crea `daily_alerts` comparando conteos,
   traslados, ventas y bajas aprobadas.

## Flujo UI validado

Despues del reset real, se valido el flujo completo creando registros desde la
UI local:

1. Compra en `Centro de Produccion`.
2. Produccion `Maicitos bolsa`.
3. Conteo fisico inicial en `Local 2`.
4. Sugerencia, orden, envio y recepcion de traslado.
5. Apertura de caja.
6. Venta `Maicitos Individual + Extra Queso + Empaque`.
7. Despacho de venta.
8. Conteo fisico final.
9. Regeneracion de validaciones.
10. Cierre de caja confirmado y aprobado.

Resultado auditado en DB:

```json
{
  "purchases": 1,
  "productionRecords": 1,
  "transfers": 1,
  "sales": 1,
  "physicalCounts": 2,
  "dailyAlerts": 6,
  "cashOpenings": 1,
  "cashClosings": 1
}
```

El reporte completo esta en:

```text
docs/reports/inventory-flow-technical-report.md
```

## Flujo E2E SQL de referencia

Despues de ejecutar el reset real, se puede correr:

```text
supabase/sql/e2e_inventory_flow_after_reset.sql
```

Ese script crea una corrida auditable con maestros existentes. Es util como
fixture tecnico, pero no reemplaza la validacion de UI:

- Conteo inicial de Local 2 con stock para receta, adicion, empaque y procesado.
- Compra RAW en Centro de Produccion.
- Produccion RAW -> PROCESSED de `Maicitos bolsa`.
- Traslado recibido desde Centro de Produccion hacia Local 2.
- Venta `Maicitos Individual + Extra Queso + Empaque Diamante/Individual`.
- Descuento por RPC `deduct_inventory_for_sale`.
- Conteo final de Local 2.
- Apertura/cierre de caja.
- Alertas diarias con 6 resultados `OK`.

Resultado esperado del E2E:

```json
{
  "sales": 1,
  "purchases": 1,
  "production_records": 1,
  "transfers_received": 1,
  "physical_counts": 2,
  "cash_closings": 1,
  "daily_alerts_ok": 6,
  "daily_alerts_non_ok": 0
}
```

## Notas operativas

- El reset no crea usuarios de Supabase Auth. Esa regla sigue intacta.
- `demand_estimates` se conserva porque alimenta la sugerencia de envio.
- `stock_minimums` se conserva porque es parametrizacion, no movimiento.
- Si se quiere limpiar tambien planificacion, hacerlo en una segunda query
  explicita y revisar el impacto en sugerencias.
