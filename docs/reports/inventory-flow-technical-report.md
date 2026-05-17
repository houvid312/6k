# Reporte tecnico - flujo completo de inventario por UI

## Resultado

El reset operativo se ejecuto en Supabase y, despues de eso, el flujo funcional
se creo desde la UI local. La base de datos se uso solo para el reset y para la
auditoria final.

- Proyecto Supabase: `xtgllllvmiomdhojqbru` (`6k-pizza`).
- App local: `http://localhost:8081`.
- Fecha operativa Colombia: `2026-05-16`.
- Local: `Local 2`.
- Centro de produccion: `Centro de Produccion`.

## Archivos generados

- `supabase/sql/reset_inventory_flow.sql`: reset seguro del flujo operativo.
- `supabase/sql/e2e_inventory_flow_after_reset.sql`: escenario SQL de referencia,
  no usado como fuente de los datos de la validacion UI final.
- `supabase/sql/inventory_recipe_deduction_audit.sql`: auditoria de recetas,
  adiciones y empaques.
- `docs/runbooks/inventory-flow-reset-runbook.md`: runbook de operacion.
- `docs/reports/inventory-flow-technical-report.md`: este reporte tecnico.
- `docs/reports/inventory-flow-next-iteration.md`: handoff para continuar.

## Reset aplicado

El reset limpio las tablas operativas y preservo maestros, Auth y recetas.

Tablas limpiadas:

`inventory`, `purchases`, `production_records`, `production_record_items`,
`transfers`, `transfer_items`, `sales`, `sale_items`, `sale_item_additions`,
`shift_portions`, `physical_counts`, `physical_count_items`, `validations`,
`daily_alerts`, `inventory_writeoffs`, `cash_openings`, `cash_closings`,
`closing_checklist_entries`, `expenses`.

Tablas preservadas:

`stores`, `workers`, `products`, `supplies`, `recipes`,
`recipe_ingredients`, `production_recipes`, `production_recipe_inputs`,
`product_prices`, `product_formats`, `product_store_assignments`,
`addition_catalog`, `stock_minimums`, `demand_estimates`,
`closing_checklist_items`, Supabase Auth, RRHH y cartera.

## Flujo ejecutado desde UI

1. Compra en `Centro de Produccion`: `Maicitos`, `1000g`, `$5.000`,
   proveedor `UI_FLOW`.
2. Produccion en `Centro de Produccion`: receta `Maicitos bolsa`, `1` lote,
   produce `1000g` procesados y consume `1000g` RAW de `Maicitos`.
3. Conteo fisico inicial en `Local 2`: stock base para receta, adicion,
   empaque y procesado.
4. Sugerencia/orden/recepcion de traslado hacia `Local 2`: `3` bolsas de
   `Maicitos bolsa` y `10` unidades de `Empaque Diamante/Individual`.
5. Apertura de caja en `Local 2`: base `$0`.
6. Venta en UI: `Maicitos Individual`, adicion `Extra Queso`, empaque
   `Empaque Diamante/Individual`, efectivo `$8.000`, observacion `UI_FLOW`.
7. Despacho de la venta desde UI.
8. Conteo fisico final en `Local 2` con saldos post venta.
9. Regeneracion de validaciones desde UI: `6 OK`, `0 perdidas`, `0 sobrantes`.
10. Cierre de caja desde UI: esperado `$8.000`, real `$8.000`, discrepancia
    `$0`, confirmado y aprobado.

## Auditoria final en DB

Conteos operativos confirmados despues de la ejecucion UI:

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

Venta auditada:

```json
{
  "total_amount": 8000,
  "total_portions": 1,
  "payment_method": "EFECTIVO",
  "observations": "UI_FLOW venta UI Maicitos Extra Queso",
  "is_paid": true,
  "is_dispatched": true,
  "item": {
    "format_name": "Individual",
    "quantity": 1,
    "subtotal": 8000,
    "unit_price": 6000,
    "additions_total": 2000,
    "addition": "Extra Queso"
  }
}
```

Saldos finales auditados:

```json
{
  "Centro de Produccion / RAW / Maicitos": 0,
  "Centro de Produccion / PROCESSED / Maicitos bolsa": 700,
  "Local 2 / STORE / Empaque Diamante/Individual": 9,
  "Local 2 / STORE / Maicitos bolsa": 270,
  "Local 2 / STORE / Masa": 11924.8,
  "Local 2 / STORE / Queso": 12441,
  "Local 2 / STORE / Queso Bolsa": 9960.9,
  "Local 2 / STORE / Salsa Napolitana": 11950
}
```

Alertas generadas:

```json
[
  { "supply": "Masa", "type": "OK", "theoretical": 11924.8, "real": 11924.8, "diff": 0 },
  { "supply": "Queso", "type": "OK", "theoretical": 12441, "real": 12441, "diff": 0 },
  { "supply": "Salsa Napolitana", "type": "OK", "theoretical": 11950, "real": 11950, "diff": 0 },
  { "supply": "Queso Bolsa", "type": "OK", "theoretical": 9960.9, "real": 9960.9, "diff": 0 },
  { "supply": "Maicitos bolsa", "type": "OK", "theoretical": 270, "real": 270, "diff": 0 },
  { "supply": "Empaque Diamante/Individual", "type": "OK", "theoretical": 9, "real": 9, "diff": 0 }
]
```

Cierre de caja:

```json
{
  "date": "2026-05-16",
  "expected_total": 8000,
  "actual_total": 8000,
  "discrepancy": 0,
  "status": "APPROVED",
  "bills_2k": 4
}
```

## Reglas de descuento verificadas

La venta descuento desde inventario `STORE`:

- receta base de `Maicitos Individual`;
- adicion `Extra Queso` por `39g`;
- `1` unidad de `Empaque Diamante/Individual`.

La produccion desconto desde `RAW` y sumo en `PROCESSED`. El traslado recibido
desconto del `PROCESSED` del centro y sumo en `STORE` del local.

## Ajustes de codigo aplicados

- `src/services/ValidationService.ts`: el teorico de validaciones ahora incluye
  receta, adiciones y empaque, igual que la RPC `deduct_inventory_for_sale`.
- `src/utils/dates.ts`: se agrego conversion de fecha Colombia a rango UTC para
  consultas sobre `created_at`.
- `src/data/repositories/SupabaseSaleRepository.ts`: historial y resumen diario
  consultan ventas usando el rango UTC de la fecha operativa Colombia.
- `app/(tabs)/ventas/index.tsx`: porciones vendidas hoy usan el mismo rango UTC.
- `src/services/DashboardService.ts`: las tendencias agrupan ventas por fecha
  Colombia, no por la fecha UTC cruda.

## Bug encontrado y corregido

La venta creada a las `19:04` Colombia quedo en Supabase como
`2026-05-17T00:04:17Z`. Historial y cierre consultaban hasta
`2026-05-16T23:59:59` sin convertir a UTC, por lo que la venta no aparecia en
historial ni sumaba en ventas esperadas. Despues del fix, la pantalla de
historial muestra la venta en `16/05/2026, 19:04` y el cierre de caja espera
`$8.000`.

## Evidencia visual

Capturas UI principales:

- `docs/reports/screenshots/ui-flow-04-purchase-submitted.png`
- `docs/reports/screenshots/ui-flow-07-production-submitted.png`
- `docs/reports/screenshots/ui-flow-10-count-submitted.png`
- `docs/reports/screenshots/ui-flow-18-transfer-received-loaded.png`
- `docs/reports/screenshots/ui-flow-20-cash-opening-submitted.png`
- `docs/reports/screenshots/ui-flow-27-sale-submitted.png`
- `docs/reports/screenshots/ui-flow-35-sales-history-fixed.png`
- `docs/reports/screenshots/ui-flow-38-final-count-submitted.png`
- `docs/reports/screenshots/ui-flow-41-validations-regenerated.png`
- `docs/reports/screenshots/ui-flow-46-cash-closing-approved.png`

## Verificacion local

```sh
npx tsc --noEmit
```

Resultado: sin errores.
