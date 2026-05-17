# Handoff - flujo completo de inventario

## Estado actual

La base fue reseteada en Supabase y el flujo operativo completo se volvio a
crear desde la UI local. No se sembraron registros operativos finales por SQL;
SQL solo se uso para reset y auditoria.

Proyecto:

- Supabase project ref: `xtgllllvmiomdhojqbru`.
- App local validada: `http://localhost:8081`.
- Fecha operativa: `2026-05-16` en `America/Bogota`.

## Flujo UI ejecutado

1. Compra `Maicitos` en `Centro de Produccion`: `1000g`, `$5.000`,
   proveedor `UI_FLOW`.
2. Produccion `Maicitos bolsa`: `1` lote, `1000g` producidos.
3. Conteo fisico inicial de `Local 2`.
4. Sugerencia, creacion, envio y recepcion de traslado:
   `3` bolsas de `Maicitos bolsa` y `10` unidades de empaque.
5. Apertura de caja con base `$0`.
6. Venta `Maicitos Individual + Extra Queso + Empaque`, efectivo `$8.000`,
   observacion `UI_FLOW venta UI Maicitos Extra Queso`.
7. Venta marcada como despachada.
8. Conteo fisico final de `Local 2`.
9. Validaciones regeneradas: `6 OK`, `0 perdidas`, `0 sobrantes`.
10. Cierre de caja creado, confirmado y aprobado con discrepancia `$0`.

## Auditoria final

Conteos confirmados:

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

Saldos finales principales:

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

## Cambios de codigo

- `src/services/ValidationService.ts`: el consumo teorico ya contempla
  adiciones y empaque, ademas de receta base.
- `src/utils/dates.ts`: helpers para convertir fecha Colombia a rango UTC.
- `src/data/repositories/SupabaseSaleRepository.ts`: consultas por fecha de
  ventas usan rango UTC de la fecha Colombia.
- `app/(tabs)/ventas/index.tsx`: conteo de porciones vendidas usa rango UTC.
- `src/services/DashboardService.ts`: agrupa tendencias por fecha Colombia.

## Bug importante corregido

Una venta hecha en la noche Colombia queda en Supabase con fecha UTC del dia
siguiente. Antes, historial y cierre de caja consultaban con limites naive
(`YYYY-MM-DDT00:00:00` a `YYYY-MM-DDT23:59:59`) y excluian ventas de la tarde
/ noche. El fix convierte `2026-05-16` Colombia a:

- inicio UTC: `2026-05-16T05:00:00.000Z`;
- fin UTC: `2026-05-17T04:59:59.999Z`.

Esto hizo que la venta apareciera en historial y que el cierre esperara
`$8.000`.

## Archivos clave

- `supabase/sql/reset_inventory_flow.sql`
- `supabase/sql/e2e_inventory_flow_after_reset.sql`
- `supabase/sql/inventory_recipe_deduction_audit.sql`
- `docs/runbooks/inventory-flow-reset-runbook.md`
- `docs/reports/inventory-flow-technical-report.md`
- `docs/reports/inventory-flow-next-iteration.md`

## Capturas relevantes

- `docs/reports/screenshots/ui-flow-04-purchase-submitted.png`
- `docs/reports/screenshots/ui-flow-07-production-submitted.png`
- `docs/reports/screenshots/ui-flow-18-transfer-received-loaded.png`
- `docs/reports/screenshots/ui-flow-27-sale-submitted.png`
- `docs/reports/screenshots/ui-flow-35-sales-history-fixed.png`
- `docs/reports/screenshots/ui-flow-41-validations-regenerated.png`
- `docs/reports/screenshots/ui-flow-46-cash-closing-approved.png`

## Como repetir desde cero

1. Ejecutar `supabase/sql/reset_inventory_flow.sql` con `run_reset := false`.
2. Revisar conteos.
3. Ejecutar el mismo archivo con `run_reset := true`.
4. Crear el flujo desde UI siguiendo este handoff, o usar
   `supabase/sql/e2e_inventory_flow_after_reset.sql` solo como fixture tecnico.
5. Auditar con `supabase/sql/inventory_recipe_deduction_audit.sql` y con los
   conteos del reporte tecnico.

## Pendientes recomendados

- Convertir este flujo UI en test automatizado con Playwright para no depender
  de ejecucion manual.
- Aplicar el helper de rango UTC Colombia a compras, produccion, traslados y
  gastos si se van a reportar por `created_at` en pantallas nocturnas.
- Revisar UX de cierre de caja: despues de crear el cierre, el formulario se
  limpia y el resumen inferior muestra `-$8.000`, aunque el banner correcto
  indica discrepancia `$0`.
- Decidir si el reset debe limpiar tambien `demand_estimates` y
  `stock_minimums`; se conservaron porque son parametros de operacion.
