# Catalogos, productos, formatos, insumos y recetas

## Alcance

Cubre:

- `app/(tabs)/inventario/productos.tsx`
- `app/(tabs)/inventario/insumos.tsx`
- `app/(tabs)/inventario/recetas.tsx`
- `app/(tabs)/inventario/recetas-produccion.tsx`
- Repositorios de productos, formatos, asignaciones, insumos, recetas y recetas
  de produccion.

## Productos

### Campos funcionales

- `name`: nombre visible.
- `category`: `PIZZA`, `BEBIDA`, `OTRO`.
- `isActive`: controla disponibilidad global.
- `hasRecipe`: indica si el producto consume inventario `STORE`.

### Pantalla

- Segmenta por categoria:
  - Pizzas.
  - Bebidas.
  - Otros.
- Muestra producto inactivo con opacidad reducida.
- Permite activar/desactivar producto globalmente.
- Al expandir producto, carga:
  - formatos.
  - disponibilidad por sede.
  - receta si `hasRecipe`.

### Crear producto

Requiere nombre.

Al crear:

- Persiste producto.
- Lo asigna a todos los locales activos por defecto.
- Si `hasRecipe = true`, crea receta vacia.
- Refresca datos maestros.

## Formatos de producto

Un formato define:

- nombre.
- porciones por unidad.
- precio.
- activo/inactivo.
- orden.

Reglas:

- Todo producto vendible debe tener al menos un formato activo.
- Formato sin precio puede existir si precio es `0`, pero debe ser una decision
  consciente de negocio.
- Porciones debe ser numero entero positivo.
- Precio debe ser numero no negativo.

Operaciones:

- Crear formato.
- Editar nombre, porciones y precio.
- Activar/desactivar formato.
- Eliminar formato.

Al eliminar:

- Si esta asociado a ventas existentes, el repositorio puede fallar y la UI
  muestra que no se puede eliminar.

## Disponibilidad por sede

Cada producto tiene asignaciones por sede.

- El switch por local activa/desactiva disponibilidad.
- La pantalla de ventas solo lista productos activos globalmente y asignados al
  local.
- Crear producto asigna por defecto a todos los locales.

## Recetas de venta

### Modelo

Una receta de venta esta asociada a un producto y contiene ingredientes:

- `supplyId`
- `gramsPerPortion`

Se usa para:

- Descontar inventario por venta.
- Calcular consumo teorico.
- Calcular demanda requerida.
- Calcular margenes del dashboard.
- Filtrar insumos en conteo fisico de tienda.

### Pantalla `recetas`

- Lista productos activos con `hasRecipe`.
- Solo muestra productos que tienen receta registrada.
- Muestra insumos por porcion.
- Permite editar ingredientes.
- El selector de insumos se limita a insumos presentes en inventario `STORE` del
  local seleccionado; si falla, usa todos los insumos.

Validaciones:

- No permite insumo duplicado en una receta.
- Todos los gramajes deben ser positivos.

### Receta dentro de `productos`

La pantalla de productos tambien permite editar receta por producto expandido:

- Muestra badge `Receta` cuando hay ingredientes.
- Muestra badge `Sin insumos` si la receta esta vacia o falta.
- Permite agregar/quitar insumos.
- Guarda `recipe_ingredients`.

## Insumos

### Campos

- `name`
- `unit`: `GRAMOS`, `MILILITROS`, `UNIDAD`
- `gramsPerBag`

### Pantalla

- Lista insumos ordenados alfabeticamente.
- Permite busqueda por nombre.
- Permite crear y editar.
- Requiere nombre.
- Requiere gramos por bolsa numerico y positivo.
- Refresca datos maestros despues de guardar.

## Recetas de produccion

### Modelo

Una receta de produccion define conversion de `RAW` a `PROCESSED`:

- `name`
- `supplyId`: insumo producido.
- `outputGrams`
- `outputBags`
- `isActive`
- `inputs`: insumos consumidos por lote con `gramsRequired`.

### Pantalla

- Lista recetas activas e inactivas.
- Permite crear receta.
- Permite editar nombre, salida y entradas.
- Permite activar/desactivar.
- Muestra:
  - insumo producido.
  - bolsas por lote.
  - gramos por bolsa.
  - insumos consumidos por lote.

Validaciones:

- Nombre obligatorio.
- Insumo producido obligatorio al crear.
- `outputGrams > 0`.
- `outputBags > 0`.
- Cada input debe tener insumo y gramos requeridos positivos.

### Uso operativo

Solo recetas activas aparecen en `produccion`.

Al registrar produccion:

- Inputs descuentan `RAW`.
- Output suma `PROCESSED`.
- Se crea historial de produccion.

## Adiciones

El catalogo de adiciones vive por formato:

- `addition_catalog` vincula insumo, formato, nombre, precio y gramos.
- `sale_item_additions` guarda snapshot historico por item vendido.

Reglas:

- Las adiciones aumentan subtotal.
- Las adiciones descuentan inventario `STORE` por RPC al vender.
- El catalogo diferencia formatos normales y Diamante segun migracion.

## Escenarios de prueba

- Crear producto pizza con `hasRecipe` crea receta vacia y asignaciones.
- Producto sin formato activo no puede venderse.
- Desactivar producto lo oculta de ventas aunque tenga formatos.
- Desactivar asignacion de sede lo oculta solo en esa sede.
- Editar precio de formato afecta nuevas ventas, no ventas historicas.
- Editar receta cambia consumo teorico futuro.
- Crear receta de produccion activa la hace disponible en pantalla produccion.
- Desactivar receta de produccion la oculta de registro de produccion.
