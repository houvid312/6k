# Contabilidad

## Alcance

Cubre:

- `app/(tabs)/contabilidad/index.tsx`
- `app/(tabs)/contabilidad/gastos.tsx`
- `app/(tabs)/contabilidad/bancos.tsx`
- `app/(tabs)/contabilidad/cierres.tsx`
- `app/(tabs)/contabilidad/balances.tsx`
- `src/services/DashboardService.ts`
- Repositorios de ventas, gastos, compras y cierres.

## Acceso

El tab de contabilidad solo es visible para `ADMIN`.

## Resumen contable principal

Pantalla `contabilidad/index`:

- Usa local seleccionado.
- Periodos:
  - hoy.
  - ayer.
  - semana.
  - mes.
- Calcula ingresos desde ventas.
- Calcula egresos desde gastos.
- Calcula utilidad como `ingresos - egresos`.
- Muestra ultimas 10 ventas y ultimos 10 gastos del periodo.

Acciones:

- Eliminar venta con confirmacion.
- Eliminar gasto con confirmacion.
- Editar descripcion y monto de gasto.

## Arqueo diario

Solo se muestra para periodo `hoy`.

Valores:

- Apertura: total de `cash_openings`.
- Ventas efectivo: `dailySummary.totalCashAmount`.
- Egresos efectivo: suma de gastos del dia.
- Saldo teorico: `openingBase + todayCashSales - todayCashExpenses`.
- Conteo fisico: `closing.actualTotal`, si existe cierre.

Brecha actual:

- El arqueo toma todos los gastos del dia como egresos efectivo, aunque el gasto
  tenga metodo de pago distinto.

## Gastos

Pantalla `gastos`:

- Registra gasto por local seleccionado.
- Requiere categoria.
- Requiere monto positivo.
- Descripcion por defecto: categoria.
- Metodo de pago: efectivo, transferencia o mixto.
- Fecha actual usa `new Date().toISOString()`.

Brecha actual:

- Para fechas operativas el proyecto exige `todayColombia()`, pero esta pantalla
  usa `new Date().toISOString()` al crear gasto. Si se corrige, actualizar spec.

Lista:

- Muestra gastos existentes del local.
- Ordena invirtiendo el resultado de `expenseRepo.getAll(selectedStoreId)`.

## Bancos

Pantalla `bancos`:

- Lee todas las ventas del local.
- Filtra ventas con metodo `TRANSFERENCIA` o `MIXTO`.
- Suma `bankAmount`.
- Muestra ultimos movimientos bancarios.

Brecha actual:

- Usa `withBank.slice(-10).reverse()` sobre la lista devuelta por repositorio.
  Si el repositorio ya entrega descendente, esto puede mostrar movimientos mas
  antiguos. Cualquier ajuste debe actualizar este spec.

## Cierres mensuales

Pantalla `cierres`:

- Permite navegar meses.
- No permite avanzar a meses futuros o actual futuro segun fecha local.
- Calcula primer y ultimo dia del mes.
- KPIs:
  - ingresos.
  - egresos.
  - utilidad neta.
  - porciones vendidas.
  - dias con ventas.
  - promedio diario de ventas.
- Agrupa top 5 categorias de gasto.
- Lista cierres de caja diarios del mes con:
  - fecha.
  - estado.
  - esperado.
  - real.
  - discrepancia.

## Balances

Pantalla `balances`:

- Periodos:
  - semana: ultimos 7 dias.
  - mes: desde primer dia del mes actual.
  - trimestre: desde primer dia de hace dos meses.
- Scope:
  - este local.
  - todos los locales activos.
- Calcula:
  - ingresos por ventas.
  - gastos por categoria.
  - utilidad neta.
- Muestra rango de fechas.

## DashboardService usado por contabilidad/analitica

`getDailySummary`:

- Ventas del dia desde `saleRepo.getDailySummary`.
- Gastos del dia desde `expenseRepo.getByDateRange`.
- Retorna ingresos, egresos y neto.

`getFoodCostPercentage`:

- Compras del rango / ventas del rango * 100.
- Si ingresos son 0, retorna 0.

## Escenarios de prueba

- Cambiar periodo recalcula ingresos, egresos y utilidad.
- Eliminar venta la remueve de resumen y transacciones.
- Editar gasto actualiza monto y descripcion.
- Registrar gasto con monto 0 falla.
- Banco suma solo `bankAmount` de ventas transferencia/mixto.
- Cierre mensual muestra cierres diarios y categorias principales.
- Balance todos los locales suma datos de locales activos.
