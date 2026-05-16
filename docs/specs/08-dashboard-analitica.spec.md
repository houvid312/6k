# Dashboard y analitica

## Alcance

Cubre:

- `app/(tabs)/dashboard/index.tsx`
- `src/services/DashboardService.ts`
- Componentes de dashboard:
  - `SalesChart`
  - `PortionBreakdown`
  - `FoodCostGauge`

## Acceso

El tab dashboard solo es visible para `ADMIN`.

## Periodos

La pantalla permite:

- Hoy.
- 7 dias.
- 30 dias.

El periodo afecta:

- Food cost.
- Top productos.
- Tendencia de ventas.
- Segmentos de porciones.

KPIs de ventas hoy:

- Aunque el periodo sea 7d o 30d, el KPI `Ventas Hoy` usa resumen diario de la
  fecha actual.

## KPIs

### Ventas Hoy

- Usa `dashboardService.getDailySummary(selectedStoreId, today)`.
- Muestra `summary.totalRevenue`.

### Ticket promedio

- `summary.totalRevenue / summary.totalSales`.
- Si no hay ventas, 0.

### Porciones

- Actualmente se calcula como suma de `totalQuantity` de top productos del
  periodo.

Brecha actual:

- El nombre "Porciones" puede ser impreciso porque suma cantidad de items de top
  productos, no necesariamente `totalPortions` de todas las ventas.

## Food cost

`DashboardService.getFoodCostPercentage`:

- Carga compras del rango.
- Suma `priceCOP`.
- Carga ventas del local en el rango.
- Suma `totalAmount`.
- Retorna `(compras / ventas) * 100`, redondeado a 2 decimales.
- Si ventas son 0, retorna 0.

## Top productos

`DashboardService.getTopProducts`:

- Lee ventas del rango.
- Agrupa por `productId`.
- Suma:
  - `quantity`.
  - `subtotal`.
- Ordena por revenue descendente.
- Limita a 5 por defecto.

La UI resuelve nombre con productos cacheados.

## Tendencia diaria

`DashboardService.getSalesTrend`:

- Lee ventas del rango.
- Agrupa por `timestamp.substring(0, 10)`.
- Suma revenue y count por dia.
- Ordena ascendente por fecha.

La UI muestra labels `MM-DD`.

## Demanda por dia de semana

La pantalla calcula ultimos 30 dias:

- Carga ventas de los ultimos 30 dias.
- Agrupa por dia de semana.
- Suma `sale.totalPortions`.
- Cuenta dias con ventas por dia de semana.
- Valor = promedio de porciones por dia con ventas.
- Dia mas fuerte es el maximo valor.

## Margenes por producto

`DashboardService.getProductMargins`:

1. Lee ventas del rango.
2. Agrupa por producto:
   - revenue.
   - portions.
3. Carga nombres de producto.
4. Carga recetas.
5. Calcula costo promedio por gramo desde compras del rango:
   - `totalCost / totalGrams`.
6. Si no hay costo de compra para un insumo, usa fallback `5 COP/g`.
7. Costo por porcion = suma de `gramsPerPortion * costPerGram`.
8. Costo ingredientes = costo por porcion * porciones vendidas.
9. Margen = revenue - ingredientCost.
10. Margen % = margin / revenue * 100.

La UI colorea margen:

- Mayor a 40%: verde.
- 20% a 40%: naranja.
- Menor a 20%: rojo.

## Punto de equilibrio

La pantalla calcula sobre ultimos 30 dias:

- Costos fijos = gastos categoria `Arriendo` o `Servicios`, con variantes en
  minuscula.
- Margen promedio por porcion = total margin / total portions.
- Precio promedio por porcion = total revenue / total portions.
- Break-even portions = `ceil(fixedCosts / avgMarginPerPortion)`.
- Break-even revenue = `breakEvenPortions * avgPricePerPortion`.

Se muestra solo si:

- `fixedCosts > 0`.
- `avgMarginPerPortion > 0`.

## Brechas de labels

- Algunos titulos de graficas dicen "Semana" aunque el periodo seleccionado sea
  hoy o 30 dias. Si se ajustan los labels dinamicos, actualizar este spec.

## Escenarios de prueba

- Sin ventas: ticket, food cost, tendencias y margenes no deben romper pantalla.
- Cambiar periodo recalcula top productos y tendencia.
- Compra alta con ventas bajas aumenta food cost.
- Producto sin receta usa costo 0 para ingredientes de receta ausente.
- Insumo sin compras usa costo fallback de 5 COP/g.
- Costos fijos inexistentes ocultan punto de equilibrio.
