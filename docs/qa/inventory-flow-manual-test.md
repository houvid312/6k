# Inventory Flow Manual Test

Este documento deja un recorrido manual para validar inventario completo en la app 6K Pizza, usando Local 2 como tienda y Centro de Produccion como origen de produccion.

## Objetivo

Validar el flujo operativo:

1. Compra: aumenta inventario `RAW` en Centro de Produccion.
2. Produccion: descuenta `RAW` y aumenta `PROCESSED`.
3. Traslado: recibe desde Centro de Produccion y aumenta `STORE` en Local 2.
4. Venta: descuenta receta base, adiciones y empaque desde `STORE`.
5. Cierre fisico: registra conteo y ajusta inventario al valor contado.
6. Cierre de caja: crea alertas diarias de inventario.

## Fixture usado en esta corrida

- Centro de Produccion: `00000000-0000-0000-0000-000000000001`
- Local 2: `00000000-0000-0000-0000-000000000002`
- Materia prima: `Maicitos`
- Producto procesado: `Maicitos bolsa`
- Producto vendido: `Maicitos`, formato `Individual`
- Adicion: `Extra Queso`
- Empaque: `Empaque Diamante/Individual`

Se preparo el inventario de prueba dejando:

- Centro `RAW Maicitos`: `0g`, luego compra `1000g`.
- Centro `PROCESSED Maicitos bolsa`: `0g`, luego produccion `1000g`.
- Local 2 `STORE Maicitos bolsa`: `0g`, luego traslado `300g`.
- Local 2 con saldos base altos para receta: Masa, Salsa Napolitana, Queso Bolsa, Queso y Empaque.

## Queries de diagnostico

Usar estas queries antes y despues de cada accion:

```sql
select s.name as store, i.level, sup.name as supply, i.quantity_grams
from inventory i
join stores s on s.id = i.store_id
join supplies sup on sup.id = i.supply_id
where s.name in ('Centro de Produccion', 'Local 2')
order by s.name, i.level, sup.name;
```

```sql
select *
from purchases
order by created_at desc
limit 5;
```

```sql
select pr.id, pr.created_at, pr.batches, pr.total_grams_produced, w.name as worker
from production_records pr
left join workers w on w.id = pr.worker_id
order by pr.created_at desc
limit 5;
```

```sql
select t.id, t.status, t.order_date, t.shipping_date, t.received_at,
       t.from_store_id, t.to_store_id, count(ti.*) as item_count
from transfers t
left join transfer_items ti on ti.transfer_id = t.id
group by t.id
order by t.created_at desc
limit 5;
```

```sql
select sa.id, sa.created_at, sa.total_amount, sa.total_portions,
       sa.packaging_supply_id, sa.is_paid, sa.is_dispatched,
       si.product_id, p.name as product, si.format_name, si.quantity, si.portions,
       sia.name as addition, sia.grams as addition_grams, sia.quantity as addition_qty
from sales sa
left join sale_items si on si.sale_id = sa.id
left join products p on p.id = si.product_id
left join sale_item_additions sia on sia.sale_item_id = si.id
where sa.store_id = '00000000-0000-0000-0000-000000000002'
order by sa.created_at desc
limit 10;
```

```sql
select pc.id, pc.created_at, sup.name, pci.bags, pci.loose_grams, pci.total_grams
from physical_counts pc
join physical_count_items pci on pci.physical_count_id = pc.id
join supplies sup on sup.id = pci.supply_id
where pc.store_id = '00000000-0000-0000-0000-000000000002'
order by pc.created_at desc, sup.name;
```

```sql
select da.alert_type, sup.name, da.theoretical_grams, da.real_grams,
       da.difference_grams, da.difference_percent
from daily_alerts da
join supplies sup on sup.id = da.supply_id
where da.store_id = '00000000-0000-0000-0000-000000000002'
  and da.date = '2026-05-16'
order by da.alert_type, sup.name;
```

## Recorrido manual

### 1. Compra

Ruta: `/inventario/compras`

1. Seleccionar `Maicitos`.
2. Registrar `1000g`, precio `5000`, proveedor de prueba.
3. Verificar que aparece el mensaje de exito.

Tablas afectadas:

- `purchases`: crea la compra.
- `inventory`: Centro de Produccion, nivel `RAW`, `Maicitos` aumenta `+1000g`.

Resultado observado:

- Compra creada con proveedor `E2E_INV_20260516`.
- `RAW Maicitos` quedo en `1000g`.

### 2. Produccion

Ruta: `/inventario/produccion`

1. Seleccionar un trabajador activo.
2. En receta `Maicitos bolsa`, registrar `1` lote.
3. Verificar mensaje `Produccion registrada`.

Tablas afectadas:

- `production_records`
- `production_record_items`
- `inventory`: `RAW Maicitos -1000g`, `PROCESSED Maicitos bolsa +1000g`.

Resultado observado:

- Produccion `7456f237-09ae-49ec-aed7-4a930c8aa9cb`.
- Centro `RAW Maicitos`: `0g`.
- Centro `PROCESSED Maicitos bolsa`: `1000g`.

### 3. Sugerencia y traslado

Ruta: `/inventario/sugerencia-envio`

1. Seleccionar `Local 2`.
2. Calcular sugerencia.
3. Crear traslado.
4. Ir a `/inventario/traslados`.
5. Marcar `Enviar`.
6. Marcar `Recibir`.

Tablas afectadas:

- `transfers`: `PENDING -> IN_TRANSIT -> RECEIVED`.
- `transfer_items`: detalle de insumos.
- `inventory`: descuenta `PROCESSED` en Centro y suma `STORE` en Local 2.

Resultado observado:

- Traslado `4028dc2f-5466-4fb3-a7a6-351b448de805`.
- Item `Maicitos bolsa`: `3` bolsas, `300g`.
- Centro `PROCESSED Maicitos bolsa`: `700g`.
- Local 2 `STORE Maicitos bolsa`: `300g`.

Hallazgo corregido: la sugerencia ya no vuelve a recalcular contra mínimos al crear la orden. Ahora toma las bolsas editadas por el usuario y filtra los insumos con `0` bolsas antes de insertar `transfer_items`.

Validación posterior: con `Masa = 0`, `Maicitos bolsa = 1` y `Empaque = 0`, se creó el traslado `226431` con `1 insumo - 1 bolsas`. Luego se canceló desde la UI para no dejar una orden pendiente.

Hallazgo corregido: el modal de confirmación de traslados ahora libera el loading, cierra el diálogo y refresca la lista al terminar la acción. La validación de cancelación confirmó que el diálogo no queda bloqueado.

Hallazgo corregido: las fechas `DATE` de traslados se formatean sin convertirlas a UTC, evitando que `2026-05-16` se vea como `15/05/2026` en Colombia.

### 4. Venta con receta, adicion y empaque

Ruta: `/ventas`

1. Asegurar Local 2.
2. Click en `Maicitos`.
3. Seleccionar formato `Individual`.
4. Buscar y agregar adicion `Extra Queso`.
5. Agregar al carrito.
6. Seleccionar empaque `Emp.`.
7. Click `Revisar`.
8. Click `Confirmar`.
9. Click `Despachar` en la venta pendiente.

Tablas afectadas:

- `sales`
- `sale_items`
- `sale_item_additions`
- `inventory`

Descuentos esperados por una venta `Maicitos Individual + Extra Queso + Empaque`:

- `Maicitos bolsa`: `-30g`
- `Masa`: `-75.2g`
- `Salsa Napolitana`: `-50g`
- `Queso Bolsa`: `-39.1g`
- `Queso`: `-39g`
- `Empaque Diamante/Individual`: `-1 unidad`

Resultado observado despues de corregir empaque:

- Venta `283e9ce0-3d80-40ff-bb55-dbe17877338c`
- `packaging_supply_id = 00000000-0000-0000-0002-000000000103`
- `is_paid = true`
- `is_dispatched = true`
- `Empaque Diamante/Individual`: `10 -> 9`
- `Maicitos bolsa`: `240 -> 210`
- `Masa`: `9849.6 -> 9774.4`
- `Salsa Napolitana`: `9900 -> 9850`
- `Queso Bolsa`: `9921.8 -> 9882.7`

Bug corregido: `handleSubmitSale` no dependia de `cartPackagingSupplyId`, entonces confirmaba con el valor viejo y guardaba `packaging_supply_id = null`.

### 5. Cierre fisico

Ruta: `/inventario/cierre-fisico`

1. Llegar desde `/ventas` usando el boton `Conteo`, para conservar Local 2 seleccionado.
2. Buscar cada insumo con saldo positivo.
3. Ingresar bolsas y gramos/unidades segun inventario actual.
4. Registrar cierre fisico.

Tablas afectadas:

- `physical_counts`
- `physical_count_items`
- `inventory`

Resultado observado:

- Conteo `048d2714-e981-4e44-b086-7dcae7b629b4`.
- `23` items con saldo positivo.
- Inventario `STORE` quedo igual al conteo.

Nota: no conviene registrar solo los 6 insumos del caso, porque el formulario envia todos los insumos visibles. Si los demas quedan en cero, tambien actualiza inventario a cero.

### 6. Cierre de caja y alertas

Ruta: `/ventas/cierre-caja`

1. Verificar `Ventas Esperadas`.
2. Registrar cierre.
3. Confirmar cierre.
4. Consultar `daily_alerts`.

Tablas afectadas:

- `cash_closings`
- `daily_alerts`

Resultado observado:

- Cierre `fffe7ba5-9ea9-4a94-bc49-e45e6cdbbe3c`.
- Esperado: `$53.600`.
- Real contado: `$0`.
- Discrepancia: `-$53.600`.
- Estado final: `CONFIRMED`.
- Alertas generadas: `23`.
- Resumen: `11 LOSS`, `6 SURPLUS`, `6 OK`.

## Hallazgos a seguir revisando

- Recepcion de traslado: la operacion en DB termina, pero el modal puede quedarse cargando.
- Sugerencia de envio: confirmar si los cambios manuales de bolsas se respetan antes de crear el traslado.
- Banner de caja: despues de algunas recargas puede volver a mostrar `Caja sin abrir`; revisar `cash_openings` vs estado local.
- Los warnings de consola observados fueron de React Native Web/Expo (`shadow*`, `pointerEvents`, `useNativeDriver`) y no bloquearon el flujo.
