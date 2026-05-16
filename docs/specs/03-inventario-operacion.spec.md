# Inventario operativo

## Alcance

Cubre:

- `app/(tabs)/inventario/index.tsx`
- `app/(tabs)/inventario/compras.tsx`
- `app/(tabs)/inventario/produccion.tsx`
- `app/(tabs)/inventario/traslados.tsx`
- `app/(tabs)/inventario/sugerencia-envio.tsx`
- `app/(tabs)/inventario/demanda.tsx`
- `app/(tabs)/inventario/cierre-fisico.tsx`
- `app/(tabs)/inventario/validaciones.tsx`
- `app/(tabs)/inventario/bajas.tsx`
- `src/services/InventoryService.ts`
- `src/services/ProductionService.ts`
- `src/services/TransferService.ts`
- `src/services/DemandEstimationService.ts`
- `src/services/PhysicalCountService.ts`
- `src/services/ValidationService.ts`
- `src/services/AlertService.ts`
- `src/services/WriteoffService.ts`

## Niveles de inventario

- `RAW`: materia prima, normalmente en centro de produccion.
- `PROCESSED`: producto procesado/listo para enviar, normalmente en centro de
  produccion.
- `STORE`: inventario operativo de tienda.

`InventoryService.getInventorySummary`:

- Lee inventario por local y nivel.
- Cruza insumos para obtener nombre y gramos por bolsa.
- Calcula:
  - bolsas completas: `floor(quantityGrams / gramsPerBag)`.
  - gramos sueltos: `quantityGrams % gramsPerBag`.
- Si no encuentra insumo, usa `Desconocido`.

`SupabaseInventoryRepository`:

- `deductGrams` crea inventario negativo si no existe registro.
- `addGrams` actualiza si existe o inserta si no existe.
- `setQuantity` actualiza si existe o inserta si no existe.

## Pantalla de inventario

### Local y nivel

- Si el usuario es admin y el local es centro de produccion, puede alternar
  `RAW` y `PROCESSED`.
- Si el local no es centro de produccion, muestra `STORE`.
- Colaboradores ven opciones reducidas.

### Navegacion operativa

Para admin en centro de produccion:

- Entrada: compras, insumos.
- Proceso: produccion, recetas de produccion.
- Salida: alertas, demanda, sugerencia, traslados.
- General: recetas, bajas, productos, cierre fisico, consumo.

Para admin en tienda:

- Operacion: traslados, cierre fisico, alertas, demanda.
- General: bajas, productos, consumo.

Para colaborador:

- Consumo.
- Traslados.

### Minimos

- Carga `stock_minimums` por local y nivel.
- Admin puede guardar minimo por insumo.
- Las tarjetas reciben `minimumGrams`.

## Compras

### Reglas

- Solo disponible desde el centro de produccion.
- Si el local seleccionado no es centro de produccion, muestra bloqueo.
- Registra compras contra `productionCenterId`.
- Requiere:
  - insumo.
  - cantidad en gramos positiva.
  - precio COP positivo.
- Proveedor por defecto: `Proveedor`.
- Metodo de pago: efectivo, transferencia o mixto.

### Insumos frecuentes

- Lee ultimas 30 compras del centro de produccion.
- Muestra hasta 8 insumos unicos recientes.

### Crear insumo inline

- Permite crear insumo desde la pantalla de compras.
- Requiere nombre.
- Guarda unidad y gramos por bolsa.
- Refresca datos maestros.
- Selecciona automaticamente el nuevo insumo.

### Side effects

- La compra se persiste en `purchases`.
- El repositorio de compras debe sumar la cantidad al inventario `RAW` del
  centro de produccion.

## Produccion

### Recetas activas

- La pantalla carga recetas de produccion activas.
- El usuario selecciona trabajador activo.
- Ingresa numero de lotes por receta.
- Debe haber al menos una receta con lotes `> 0`.

### Registro

`ProductionService.registerProduction`:

1. Busca receta de produccion.
2. Por cada input, descuenta `gramsRequired * batches` del inventario `RAW`.
3. Suma `outputGrams * batches` al inventario `PROCESSED` del insumo producido.
4. Crea `production_records` con items consumidos.

Si la receta no existe, lanza error.

## Demanda estimada

Pantalla `demanda`:

- Edita porciones estimadas por producto y dia de semana.
- Solo lista productos activos con `hasRecipe`.
- Dias se muestran Lunes a Domingo.
- Guarda upsert por `storeId + productId + dayOfWeek`.
- Valores no numericos se guardan como 0.

`DemandEstimationService.calculateRequiredSupplies`:

- Carga productos activos globalmente.
- Carga productos asignados al local.
- Ignora demanda de productos inactivos o no asignados.
- Cruza recetas por producto.
- Suma gramos requeridos por insumo.

## Sugerencia de envio

### Calculo

- Por defecto selecciona el dia de manana en timezone Colombia.
- Calcula requerimientos para el local seleccionado:
  - demanda estimada por dia.
  - recetas.
  - inventario actual `STORE`.
  - gramos por bolsa.
- Para empaques definidos en `PACKAGING_SUPPLY_IDS`, asegura minimo de 10
  unidades aunque no aparezcan por demanda.
- `neededGrams = max(0, requiredGrams - currentGrams)`.
- `bagsToSend = ceil(neededGrams / gramsPerBag)`.
- Solo retorna insumos con bolsas a enviar `> 0`.

### Creacion de traslado

- Busca centro de produccion en locales.
- El usuario puede editar bolsas por insumo.
- Se exige al menos una bolsa `> 0`.
- Crea traslado desde centro de produccion hacia local seleccionado.
- `targetGrams = currentInventoryGrams + bagsToSend * gramsPerBag`.
- Estado inicial: `PENDING`.
- Fecha de orden: `todayColombia()`.
- Al crear, redirige a traslados.

## Traslados

### Estados

- `PENDING`
- `IN_TRANSIT`
- `RECEIVED`
- `CANCELLED`

### Listado

- Muestra traslados entrantes o salientes del local seleccionado.
- Ordena por fecha de orden descendente.
- Usa mapa de insumos para nombre y gramos por bolsa.

### Acciones

- `PENDING -> IN_TRANSIT`: marcar enviado.
- `PENDING/IN_TRANSIT -> RECEIVED`: recibir.
- Cancelar traslado.

### Ejecucion

`TransferService.executeTransfer`:

1. Busca traslado por id.
2. Solo permite estados `PENDING` o `IN_TRANSIT`.
3. Para cada item calcula gramos:
   - `bagsToSend * gramsPerBag`, si conoce insumo.
   - fallback: `targetGrams - currentInventoryGrams`.
4. Descuenta gramos del local origen en nivel `PROCESSED`.
5. Suma gramos al destino en nivel `STORE`.
6. Cambia estado a `RECEIVED`.

`SupabaseTransferRepository.updateStatus(RECEIVED)`:

- Guarda `received_at` con timestamp actual.
- Guarda `shipping_date` con `todayColombia()`.

## Conteo fisico

### Insumos mostrados

- En centro de produccion: muestra todos los insumos.
- En tienda: muestra insumos usados por recetas mas empaques.
- Si falla carga de recetas, usa todos los insumos como fallback.

### Captura

- Selecciona trabajador activo que hace el conteo.
- Por cada insumo captura bolsas y gramos sueltos.
- `totalGrams = bags * gramsPerBag + looseGrams`.
- Incluye buscador por nombre.
- Incluye checklist activo de implementos de aseo con estados:
  - `OK`
  - `BAJO`
  - `AGOTADO`
- Si un item de checklist no esta OK, permite nota.

### Persistencia

`PhysicalCountService.submitCount`:

1. Crea `physical_counts` con items.
2. Por cada item, actualiza inventario `STORE` al total contado.

Brecha actual:

- La pantalla captura checklist de aseo, pero `handleSubmit` no persiste los
  estados ni notas del checklist.

## Validaciones y alertas

### Generacion

`AlertService.triggerPostClosingValidation(storeId, date)`:

1. Borra alertas previas de ese local y fecha.
2. Obtiene los dos ultimos conteos fisicos.
3. Si no hay conteo fisico, retorna lista vacia.
4. Usa el conteo mas reciente como inventario final real.
5. Usa el conteo anterior como inventario inicial; si no existe, inicial es 0.
6. Suma entradas por traslados recibidos al destino en la fecha.
7. Calcula consumo teorico con ventas x recetas + bajas aprobadas.
8. Reune insumos que aparezcan en final, inicial, entradas o teorico.
9. Calcula:
   - `invFinalTeorico = invInicial + entradas - consumoTeorico`
   - `differenceGrams = invFinalReal - invFinalTeorico`
   - denominador = consumo teorico si existe; si no, inicial + entradas
   - `differencePercent`
10. Clasifica:
   - `< -5%`: `LOSS`
   - `> 5%`: `SURPLUS`
   - resto: `OK`
11. Persiste `daily_alerts`.

### Consulta

Pantalla `validaciones`:

- Filtros:
  - hoy.
  - dia especifico con calendario.
  - ultimos 7 dias.
  - ultimos 30 dias.
- Muestra KPIs de perdidas, sobrantes y OK.
- Muestra teorico, real y desvio por insumo.
- Permite regenerar alertas para hoy o para el dia seleccionado.

## Bajas

### Solicitud

`WriteoffService.createRequest`:

- Crea `inventory_writeoffs` en estado `PENDING`.
- Requiere local, insumo, nivel, gramos, razon, notas y solicitante.
- No descuenta inventario al crear.

### Revision

Pantalla `bajas`:

- Admin inicia en tab pendientes.
- No admin inicia en historial.
- Admin ve pendientes globales e historial global.
- No admin ve pendientes/historial del local seleccionado.

Acciones admin:

- Aprobar:
  - Cambia estado a `APPROVED`.
  - Descuenta inventario del nivel registrado.
- Rechazar:
  - Cambia estado a `REJECTED`.
  - No descuenta inventario.

Las bajas aprobadas entran al consumo teorico de validaciones.

## Escenarios de prueba

- Cambiar entre centro de produccion y tienda ajusta nivel y acciones visibles.
- Compra en centro de produccion crea compra y suma RAW.
- Produccion descuenta RAW, suma PROCESSED y crea historial.
- Demanda ignora productos sin asignacion al local.
- Sugerencia calcula bolsas y permite editarlas antes de crear traslado.
- Recibir traslado descuenta PROCESSED origen y suma STORE destino.
- Conteo fisico actualiza inventario STORE.
- Cierre de caja genera alertas despues de conteo fisico.
- Aprobar baja descuenta inventario y luego afecta validaciones.
