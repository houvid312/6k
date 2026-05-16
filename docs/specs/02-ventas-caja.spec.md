# Ventas, carrito, pagos y caja

## Alcance

Cubre:

- `app/(tabs)/ventas/index.tsx`
- `app/(tabs)/ventas/apertura-caja.tsx`
- `app/(tabs)/ventas/cierre-caja.tsx`
- `app/(tabs)/ventas/historial.tsx`
- `app/(tabs)/ventas/consumo-ventas.tsx`
- `src/services/SaleService.ts`
- `src/services/CashClosingService.ts`
- `src/stores/useSaleStore.ts`
- `src/stores/useCashClosingStore.ts`
- `src/data/repositories/SupabaseSaleRepository.ts`

## Venta principal

### Productos disponibles

- La pantalla usa el local seleccionado excluyendo centro de produccion.
- Carga productos activos asignados al local mediante
  `productStoreAssignmentRepo.getProductIdsByStore`.
- Si falla la consulta de asignaciones, usa los productos activos cacheados.
- Carga formatos activos por producto.
- Si un producto no tiene formatos activos, no puede venderse y se muestra error.

### Seleccion de producto

- Producto con un formato activo: abre modal de cantidad simple.
- Producto con multiples formatos: abre modal selector de formato.
- Los formatos definen:
  - `formatId`
  - `formatName`
  - `portionsPerUnit`
  - `price`
- Las adiciones disponibles se cargan por `formatId`.
- Las adiciones agregan precio y consumo de gramos al item.

### Carrito

`useSaleStore.addToCart`:

- Calcula `portions = portionsPerUnit * quantity`.
- Calcula `subtotal = unitPrice * quantity + additionsTotal`.
- Agrupa items solo cuando:
  - el formato tiene mas de una porcion por unidad; y
  - no hay adiciones.
- Items de una sola porcion o con adiciones quedan como lineas separadas.
- Permite nota por item.
- Permite empaque de carrito (`cartPackagingSupplyId`).

Operaciones:

- Eliminar item.
- Actualizar cantidad.
- Cantidad `<= 0` elimina la linea.
- Limpiar carrito.
- Cambiar notas.
- Cambiar empaque.

### Pago

Metodos:

- `EFECTIVO`
- `TRANSFERENCIA`
- `MIXTO`

Reglas:

- En efectivo, `cashAmount = totalAmount` y `bankAmount = 0`.
- En transferencia, `cashAmount = 0` y `bankAmount = totalAmount`.
- En mixto, el usuario ingresa efectivo y transferencia.
- En mixto, `cashAmount + bankAmount` debe cubrir el total.
- El usuario puede marcar la venta como `Pagado` o `Pendiente de pago`.
- Observaciones generales se guardan en la venta.
- Notas por item se concatenan como `customerNote`.

### Confirmacion

El FAB opera en dos pasos:

1. Primer click con carrito lleno cambia a modo revision y sube el scroll.
2. Segundo click confirma y registra la venta.

Si el carrito esta vacio, se muestra error.

## Persistencia de venta

`SaleService.createSale`:

- Construye `SaleItem[]`.
- Calcula `totalPortions`.
- Calcula `totalAmount`.
- Crea la venta con `isDispatched = false`.

`SupabaseSaleRepository.create`:

- Busca `worker_id` desde la sesion Auth actual.
- Inserta en `sales`.
- Inserta `sale_items`.
- Inserta `sale_item_additions` si existen.
- Ejecuta RPC `deduct_inventory_for_sale(p_sale_id)`.
- Si la RPC de descuento falla, registra el error en consola pero no cancela la
  venta.
- Retorna la venta hidratada con items y adiciones.

## Descuento de inventario por venta

La deduccion de inventario se hace en Supabase por RPC:

- Busca la receta del producto vendido.
- Descuenta ingredientes de `inventory` nivel `STORE`.
- Descuenta adiciones vendidas.
- Descuenta un empaque si `packaging_supply_id` existe.
- Si no existe inventario `STORE` para un insumo, la funcion helper crea saldo
  negativo.

## Porciones de turno

La pantalla maneja `shift_portions`:

- Carga porciones disponibles por producto y dia.
- Permite registrar porciones que llegan para productos con receta.
- Al guardar, suma lo ingresado al disponible actual.
- Al vender, descuenta porciones disponibles por producto si existen.
- Calcula porciones vendidas del dia desde `sale_items` y `sales`.
- La fecha se basa en `todayColombia()`.

## Ventas pendientes

Una venta aparece como pendiente si:

- `is_paid = false`; o
- `is_dispatched = false`.

Desde la pantalla principal y el historial se puede:

- Marcar como pagada.
- Marcar como no pagada.
- Cambiar metodo entre efectivo y transferencia para pendientes.
- Marcar como despachada.

Una venta sale de pendientes cuando esta pagada y despachada.

## Calculadora de cambio

Para venta actual:

- Se muestra cuando el metodo es efectivo o mixto.
- En efectivo compara monto recibido contra total.
- En mixto compara monto recibido contra la parte en efectivo.
- Muestra cambio o faltante.

Para ventas pendientes:

- Se muestra si la venta esta no pagada y el metodo es efectivo o mixto.
- Compara recibido contra total de la venta.

## Compra en turno

Desde ventas se puede registrar un gasto rapido:

- Categoria: `Compra Turno`.
- Fecha: `todayColombia()`.
- Local: local seleccionado.
- Metodo: `EFECTIVO`.
- Requiere descripcion y monto positivo.
- Impacta gastos usados en cierre y contabilidad.

## Bajas desde ventas

La pantalla abre un modal de baja:

- Modo `supply`: selecciona insumo, nivel, gramos, razon y notas.
- Usuarios no admin quedan limitados al nivel `STORE`.
- Admin puede escoger `RAW`, `PROCESSED` o `STORE`.
- La baja queda en estado `PENDING`.
- La aprobacion y descuento real se hacen en inventario/bajas.

Brecha actual:

- El modal muestra modo `product`, pero `handleBajaSubmit` solo valida y envia
  `bajaSupplyId` y `bajaGrams`. En el estado actual, una baja por producto no se
  persiste correctamente desde esta pantalla.

## Apertura de caja

Pantalla `apertura-caja`:

- Usa contador de denominaciones:
  - billetes de 100k, 50k, 20k, 10k, 5k, 2k
  - monedas como valor total unitario
- Calcula total con `CashClosingService.calculateDenominationTotal`.
- Crea `cash_openings` por `storeId + todayColombia()`.
- Guarda `openedBy` si hay usuario.
- Existe restriccion unica por `store_id + date`.
- En duplicado, muestra que ya existe apertura.
- Al crear, vuelve a ventas.

La pantalla principal de ventas:

- Consulta si existe apertura para hoy.
- Si no existe, muestra banner `Caja sin abrir`.
- El banner permite ir a apertura.
- El banner no bloquea registro de ventas por si solo.

## Cierre de caja

Pantalla `cierre-caja`:

- Usa local seleccionado y fecha `todayColombia()`.
- Carga ventas esperadas del dia.
- Inicializa transferencias bancarias con `summary.totalBankAmount`.
- Carga gastos del dia.
- Carga base de apertura si existe.
- Carga cierre existente si existe.

Formulas en pantalla:

- `actualTotal = efectivo contado + bankTotal`.
- `cashTotal = actualTotal - bankTotal`.
- `discrepancy = actualTotal - cashBase - (expectedTotal - expenses)`.
- El resumen muestra total real descontando base.

Formula en servicio al crear/actualizar cierre:

- `cashTotal = denominaciones`.
- `actualTotal = cashTotal + bankTotal`.
- `expectedTotal = ventas del dia`.
- `discrepancy = actualTotal - (expectedTotal - expenses)`.

Brecha actual:

- La pantalla incluye `cashBase` en la discrepancia visible, pero
  `CashClosingService.createClosing/updateClosing` no recibe ni resta la base.
  Si se cambia esta regla, se debe actualizar este spec y los tests.

## Workflow de cierre

Estados:

- `DRAFT`
- `CONFIRMED`
- `APPROVED`

Transiciones:

- Crear cierre: `DRAFT`.
- Colaborador/admin confirma: `DRAFT -> CONFIRMED`.
- Admin devuelve: `CONFIRMED -> DRAFT`.
- Admin aprueba: `CONFIRMED -> APPROVED`.
- Admin puede reabrir aprobado: `APPROVED -> DRAFT`.

Reglas:

- Un cierre `APPROVED` queda no editable desde el servicio.
- Crear o actualizar cierre regenera alertas de inventario.
- Aprobar cierre intenta cargar asistencia automaticamente desde horarios.
- Si falla la carga de asistencia, no falla la aprobacion del cierre.

Brecha actual:

- La pantalla llama `confirmClosing` y `approveClosing` con workerId vacio, por
  lo que los campos `confirmed_by_worker_id` y `approved_by_worker_id` pueden no
  quedar trazados.

## Historial de ventas

Filtros:

- Hoy.
- Ayer.
- Semana.
- Mes.

Muestra:

- Fecha/hora.
- Metodo de pago.
- Items, formato, cantidad y subtotal.
- Notas u observaciones.
- Worker si existe.
- Total y porciones.
- Estado pagado/despachado.

Acciones:

- Marcar como pagada.
- Marcar como despachada.

## Consumo por ventas

Pantalla `consumo-ventas`:

- Permite navegar fecha anterior/siguiente.
- Consulta ventas del dia y recetas.
- Calcula consumo por insumo como `gramsPerPortion * portions`.
- Agrupa desglose por producto.
- Muestra ventas, porciones e insumos consumidos.

Brechas actuales:

- Este calculo usa recetas base; no incluye adiciones ni empaque.
- El texto dice "insumos descontados", pero la pantalla calcula teorico, no lee
  el movimiento real de inventario.

## Escenarios de prueba

- Registrar venta en efectivo con formato multiple descuenta inventario por RPC.
- Registrar venta mixta con suma menor al total debe fallar.
- Registrar venta pendiente aparece en pendientes.
- Marcar pendiente como pagada y despachada la oculta de pendientes.
- Registrar adiciones aumenta subtotal y crea `sale_item_additions`.
- Registrar empaque envia `packagingSupplyId`.
- Abrir caja dos veces para el mismo local/dia muestra error.
- Crear cierre genera `DRAFT` y alertas.
- Aprobar cierre bloquea edicion.
- Historial filtra correctamente por hoy, ayer, semana y mes.
