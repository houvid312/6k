# Plan de Mejoras Integrales — 6K Pizza

> **Fecha**: 2026-04-11
> **Estado**: En progreso
> **Modulos**: Ventas, Inventario, Contabilidad, RRHH, Dashboard
> **Ultima actualizacion**: 2026-04-12

---

## Estado de Implementacion (18/25 completas, 4 parciales, 3 pendientes)

### Completados
- [x] V2 — Mover quick nav al fondo
- [x] V3 — Carrito antes de productos
- [x] V4 — Metodo de pago siempre visible
- [x] V6 — Fix FAB (refactorizado a flujo Revisar → Confirmar)
- [x] V1 — Apertura de caja (tabla, entidad, repo, pantalla, banner)
- [x] V5 — Calculadora de cambio (en carrito y en pendientes)
- [x] V7 — Compra en turno (categoria, boton, modal)
- [x] V9 — Checklist de aseo (movido a cierre fisico en vez de cierre de caja)
- [x] I1 — Default centro produccion para ADMIN
- [x] I2 — Agrupar botones por etapa (Entrada, Proceso, Salida, General)
- [x] I3 — Ruta compras no-insumos (boton Compras en contabilidad)
- [x] I4 — Optimizar formulario compras (frecuentes + nuevo insumo inline)
- [x] H1 — Desactivar empleados (boton + update repo)
- [x] H2 — Horario editable (ScheduleGrid tappable + modal + upsert)
- [x] H3 — Auto-cargar horas tras cierre (en approveClosing)
- [x] H6 — Historico laboral (ultimos 30 dias por empleado en reporte)
- [x] C1 — Arqueo diario + filtros Hoy/Ayer/Semana/Mes en contabilidad
- [x] C2 — Balance franquicias (pantalla balances con P&L multi-store)

### Parciales (estructura creada, falta logica completa)
- [ ] V8 — Baja expandida a productos: UI toggle Insumo/Producto hecho, **falta** logica de reverse-calcular insumos por receta al aprobar baja de producto en WriteoffService
- [ ] H4 — Clock in/out: migracion con columnas check_in/check_out hecha, **falta** ShiftService con clockIn()/clockOut()/verifyShift(), UI de clock in/out en ventas para COLABORADOR, y pantalla de verificacion en RRHH para ADMIN
- [ ] H5 — Periodos de pago: selector Semanal/Quincenal/Mensual en nomina y tabla payroll_periods creada, **falta** CRUD de periodos, flujo de estados (ABIERTO → CERRADO → PAGADO), y asociar payroll_entries con period_id
- [ ] D1 — Filtros dashboard: filtro de periodo (Hoy/7d/30d) hecho, **falta** filtro por producto, por empleado, "Todos los locales", e indicador de punto de equilibrio por local

### Pendientes (no iniciados)
- [ ] C3 — Centros de costo parametrizables: tabla cost_centers, agregar cost_center_id a expenses y purchases, vistas P&L por centro de costo
- [ ] D2 — Graficas nuevas: LineChart temporal, BarChart vertical, PieChart/Dona (requiere libreria react-native-chart-kit o SVG custom)

### Migraciones ejecutadas
- 021_cash_openings.sql
- 022_closing_checklist.sql
- 023_rrhh_improvements.sql
- 024_expense_colaborador_policy.sql
- 025_sale_items_size_nullable.sql
- 026_cash_closings_update_policy.sql
- 015_cash_closing_workflow.sql (ejecutada manualmente — faltaba)

### Ajustes adicionales realizados (no en plan original)
- Toast custom en parte superior (reemplazo de Snackbar)
- Botones "← Ventas" en cierre-caja e historial con router.replace
- Pendientes muestran pago + despacho, cambio de metodo de pago, despagar, calculadora de cambio
- Historial con filtro "Ayer" y timezone Colombia
- Cierre de caja precarga gastos del dia y base de apertura
- Contabilidad con filtros Hoy/Ayer/Semana/Mes
- Historial de cierres de caja en contabilidad/cierres
- ScreenContainer paddingBottom aumentado a 120

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Fase 1 — Reorganizacion UI de Ventas](#fase-1--reorganizacion-ui-de-ventas)
3. [Fase 2 — Apertura de Caja y Calculadora de Cambio](#fase-2--apertura-de-caja-y-calculadora-de-cambio)
4. [Fase 3 — Compras en Turno, Baja Expandida, Checklist de Aseo](#fase-3--compras-en-turno-baja-expandida-checklist-de-aseo)
5. [Fase 4 — Mejoras de Inventario](#fase-4--mejoras-de-inventario)
6. [Fase 5 — Talento Humano (RRHH)](#fase-5--talento-humano-rrhh)
7. [Fase 6 — Contabilidad](#fase-6--contabilidad)
8. [Fase 7 — Dashboard](#fase-7--dashboard)
9. [Cronograma y Dependencias](#cronograma-y-dependencias)
10. [Archivos Criticos](#archivos-criticos)

---

## Resumen Ejecutivo

Se planifican **25 mejoras** distribuidas en **7 fases** priorizadas por impacto operativo y esfuerzo tecnico. La Fase 1 (reorganizacion visual de Ventas) es la mas inmediata y de menor riesgo. Las fases posteriores agregan funcionalidades nuevas con migraciones de base de datos y nuevas capas de dominio.

**Stack actual**: React Native + Expo SDK 54 | Supabase (PostgreSQL) | Zustand | React Native Paper (dark theme)

**Arquitectura**: Clean Architecture → Entity → Repo Interface → Supabase Repo → Service → DI Container → Zustand Store → Screen

---

## Fase 1 — Reorganizacion UI de Ventas

> **Impacto**: Alto (UX) | **Esfuerzo**: Bajo | **Dependencias**: Ninguna
> **Archivos**: Solo `app/(tabs)/ventas/index.tsx`

### V2 — Mover botones secundarios al fondo de la pagina

**Problema**: Los botones de Historial, Cierre, Conteo, Baja y Consumo ocupan espacio premium arriba de la pantalla y no se usan con frecuencia durante la venta activa.

**Solucion**:
- Mover el bloque de Quick Nav (Historial, Cierre, Conteo, Baja, Consumo) desde la parte superior hacia **debajo** del bloque de Cart + Payment
- Tambien mover el boton "Porciones disponibles" al fondo junto con los quick nav

**Resultado visual**:
```
ANTES:                          DESPUES:
┌─────────────────────┐         ┌─────────────────────┐
│ Header + Store      │         │ Header + Store      │
│ [Hist][Cierre][Baja]│         │ Pendientes de pago  │
│ Pendientes de pago  │         │ Carrito + Pago      │
│ Ir a confirmar      │         │ Ir a confirmar      │
│ Porciones           │         │ Grilla de Productos │
│ Grilla de Productos │         │ Porciones           │
│ Carrito + Pago      │         │ [Hist][Cierre][Baja]│
└─────────────────────┘         └─────────────────────┘
```

---

### V3 — Reposicionar carrito antes de productos

**Problema**: El carrito actual aparece despues de la grilla de productos, obligando al cajero a hacer scroll para ver el resumen y confirmar.

**Solucion**:
- Mover Cart + Payment Card para que aparezca **despues** del banner de pendientes y **antes** de la grilla de productos
- Nuevo orden de render:
  1. Header + StoreSelector
  2. Pending Sales Banner
  3. **Cart + Payment Card** ← movido arriba
  4. "Ir a confirmar" button
  5. ProductGrid
  6. Porciones button ← movido abajo
  7. Quick nav buttons ← movidos abajo

---

### V4 — Metodo de pago disponible en cualquier momento

**Problema**: El selector de metodo de pago solo aparece cuando hay items en el carrito. En la practica, el cliente puede pagar antes de que se termine de armar el pedido.

**Solucion**:
- Extraer PaymentMethodPicker, toggle isPaid, y observaciones **fuera** del condicional `cart.length > 0`
- Mantener los inputs de monto MIXTO (efectivo/transferencia) dentro del condicional
- El cajero puede preseleccionar metodo de pago en cualquier momento

---

### V6 — Corregir boton FAB "Registrar"

**Problema**: El boton FAB tiene un flujo de dos pasos (scroll → confirmar) pero no confirma ni actualiza correctamente. Ademas, `isPaid` tiene default `false`, creando ventas pendientes por defecto.

**Solucion**:
- Cambiar `isPaid` default de `false` a `true`
- Corregir el `useEffect` que resetea `readyToConfirm`: solo resetear cuando el cart pasa de no-vacio a vacio (no en cada cambio de items)
- Agregar feedback visual: cuando `readyToConfirm = true`, resaltar el Card de carrito con borde verde

---

## Fase 2 — Apertura de Caja y Calculadora de Cambio

> **Impacto**: Alto (Operaciones) | **Esfuerzo**: Medio | **Dependencias**: Fase 1

### V1 — Apertura de Caja (Cash Register Opening)

**Problema**: No existe forma de registrar la base de efectivo al inicio del turno. El cierre de caja no tiene referencia de cuanto habia al abrir.

**Solucion**:

#### Base de datos
Nueva tabla `cash_openings`:
```sql
CREATE TABLE cash_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date TEXT NOT NULL,
  denominations JSONB NOT NULL DEFAULT '{}',
  total INTEGER NOT NULL DEFAULT 0,
  opened_by UUID REFERENCES workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);
```

#### Capas de codigo
| Capa | Archivo | Cambio |
|------|---------|--------|
| Entity | `src/domain/entities/CashOpening.ts` | Nueva entidad con id, storeId, date, denominations, total, openedBy |
| Repo Interface | `src/domain/interfaces/repositories/ICashOpeningRepository.ts` | getByDate(), create() |
| Repo Impl | `src/data/repositories/SupabaseCashOpeningRepository.ts` | Implementacion Supabase |
| Service | `src/services/CashClosingService.ts` | Nuevos metodos: createOpening(), hasOpeningForToday() |
| DI | `src/di/container.ts` | Registrar repo y wiring |
| Store | `src/stores/useCashClosingStore.ts` | Estado de apertura |

#### Pantalla
Nueva pantalla `app/(tabs)/ventas/apertura-caja.tsx`:
- Reutiliza componente `DenominationCounter` (ya existe para cierre)
- Denominaciones: 100k, 50k, 20k, 10k, 5k, 2k + monedas (campo unico general)
- Boton "Abrir Caja"
- **Gate logic**: Al montar `ventas/index.tsx`, verificar `hasOpeningForToday()`. Si no existe → redirect automatico a `apertura-caja`

#### Conexion con cierre
La formula de discrepancia cambia:
```
discrepancy = actualTotal - openingBase - (expectedSales - expenses)
```

---

### V5 — Calculadora de Cambio

**Problema**: El cajero debe calcular mentalmente el cambio que debe devolver al cliente.

**Solucion**:
- Nuevo campo `CurrencyInput` con label "Monto Recibido" visible cuando metodo de pago = EFECTIVO o MIXTO
- Texto calculado debajo: `Cambio: $X` donde X = montoRecibido - totalVenta
- Para MIXTO: X = montoRecibido - porcionEfectivo
- Solo calculo client-side, sin cambios en base de datos

---

## Fase 3 — Compras en Turno, Baja Expandida, Checklist de Aseo

> **Impacto**: Alto (Completitud) | **Esfuerzo**: Medio | **Dependencias**: Fase 1

### V7 — Registro de Compras en Turno

**Problema**: Durante el turno se hacen compras de insumos con dinero de la caja. Esto no se registra y descuadra el cierre.

**Solucion**:
- Reutilizar tabla `expenses` existente con nueva categoria `'Compra Turno'`
- Agregar `'Compra Turno'` a `EXPENSE_CATEGORIES` en `src/utils/constants.ts`
- Nuevo boton "Compra Turno" en los quick-nav (seccion inferior, por V2)
- Modal con: descripcion, monto (`CurrencyInput`), boton submit
- Crea expense con `category: 'Compra Turno'`, `paymentMethod: EFECTIVO`
- El cierre de caja ya resta expenses del esperado: `discrepancy = actualTotal - (expectedTotal - expenses)`

---

### V8 — Expandir Baja a Porciones Preparadas

**Problema**: La baja actual solo permite descontar insumos/materias primas. No se pueden dar de baja porciones preparadas que no se vendieron.

**Solucion**:

#### Base de datos
```sql
ALTER TABLE inventory_writeoffs
  ADD COLUMN product_id UUID REFERENCES products(id),
  ALTER COLUMN supply_id DROP NOT NULL;
ALTER TABLE inventory_writeoffs
  ADD CONSTRAINT writeoff_target_check
  CHECK (supply_id IS NOT NULL OR product_id IS NOT NULL);
```

#### Logica
- Extender entidad `InventoryWriteoff` con campo opcional `productId`
- `WriteoffService.createRequest()` acepta `productId` o `supplyId`
- Al aprobar baja de producto: usar receta para reverse-calcular insumos a descontar (porciones × gramos por porcion por ingrediente)

#### UI
En el modal de Baja dentro de ventas:
- Toggle "Insumo" / "Producto"
- Modo Producto: selector de producto + cantidad en porciones
- Mismas razones de baja aplican (Dano, Vencimiento, Derrame, Contaminacion, Otro)

---

### V9 — Checklist de Aseo en Cierre de Caja

**Problema**: No hay forma de registrar que implementos de aseo y otros elementos no-receta se estan agotando.

**Solucion**:

#### Base de datos
```sql
CREATE TABLE closing_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE closing_checklist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_closing_id UUID NOT NULL REFERENCES cash_closings(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES closing_checklist_items(id),
  status TEXT NOT NULL DEFAULT 'OK', -- OK, BAJO, AGOTADO
  notes TEXT DEFAULT '',
  UNIQUE(cash_closing_id, checklist_item_id)
);

-- Datos iniciales
INSERT INTO closing_checklist_items (name, sort_order) VALUES
  ('Jabon', 1), ('Papel higienico', 2), ('Desinfectante', 3),
  ('Bolsas de basura', 4), ('Servilletas', 5), ('Trapos de limpieza', 6);
```

#### Capas de codigo
| Capa | Archivo | Cambio |
|------|---------|--------|
| Entity | `src/domain/entities/ChecklistItem.ts`, `ChecklistEntry.ts` | Nuevas entidades |
| Repo | `IChecklistRepository` + `SupabaseChecklistRepository` | CRUD |
| Service | `CashClosingService` | Cargar items, guardar entries con cierre |
| DI | `src/di/container.ts` | Registrar |

#### UI
Nueva seccion "Implementos de Aseo" en `app/(tabs)/ventas/cierre-caja.tsx`:
- Lista de items con selector de estado (OK / Bajo / Agotado) usando `SegmentedButtons`
- Campo de notas opcional por item
- Se guarda junto con el cierre de caja

---

## Fase 4 — Mejoras de Inventario

> **Impacto**: Medio (UX) | **Esfuerzo**: Bajo-Medio | **Dependencias**: Ninguna

### I1 — Centro de Produccion como Vista Default (ADMIN)

**Problema**: El admin ve por defecto un local de venta en vez del centro de produccion.

**Solucion**:
- En `src/stores/useAppStore.ts` linea 50: para ADMIN, cambiar `defaultStore` a `stores.find(s => s.isProductionCenter)` en vez de `!s.isProductionCenter`
- El `userRole` ya esta disponible en el store

---

### I2 — Agrupar Botones por Etapa del Proceso

**Problema**: La lista de botones de navegacion en inventario es larga y sin agrupacion logica.

**Solucion**:
Reorganizar chips en `app/(tabs)/inventario/index.tsx` en 4 grupos con subtitulos:

| Grupo | Label | Botones |
|-------|-------|---------|
| **Entrada** | "Input" | Compras, Insumos |
| **Proceso** | "Process" | Produccion, Rec. Produccion |
| **Salida** | "Output" | Alertas, Demanda, Sugerencias, Traslados |
| **General** | "General" | Recetas, Bajas, Productos, Cierre Fisico |

---

### I3 — Ruta para Compras No-Insumos

**Problema**: No esta claro donde registrar compras de servicios, nomina, etc.

**Solucion recomendada**: Accesible desde ambos modulos con categoria preseleccionada
- Desde Inventario → compras con categoria "Materias Primas/Insumos"
- Desde Contabilidad → gastos con categoria "Servicios" o "Nomina" (ya existe en `gastos.tsx`)
- Agregar boton en `contabilidad/index.tsx` que lleve a la pantalla de gastos

---

### I4 — Optimizar Formulario de Compras

**Problema**: El formulario de compras es lento para insumos frecuentes y no permite crear insumos nuevos sin salir.

**Solucion** en `app/(tabs)/inventario/compras.tsx`:
- Seccion "Frecuentes" arriba: mostrar ultimos 5-10 insumos comprados (query por purchases recientes, tap para prellenar)
- Formulario inline expandible "Nuevo Insumo": nombre, unidad de medida, gramos por bolsa
- Crear insumo via `supplyRepo.create()` sin salir de la pantalla

---

## Fase 5 — Talento Humano (RRHH)

> **Impacto**: Medio | **Esfuerzo**: Alto | **Dependencias**: Ninguna

### H1 — Eliminar/Desactivar Empleados

**Problema**: Solo se pueden crear empleados, no eliminar ni desactivar.

**Solucion**:
- Workers ya tienen campo `is_active` en DB
- Agregar `IconButton` (trash) en cada card en `app/(tabs)/rrhh/index.tsx`
- Confirmacion Alert → `workerRepo.update(id, { isActive: false })`
- Agregar metodo `update()` a `IWorkerRepository` y `SupabaseWorkerRepository`

---

### H2 — Horario Semanal Editable

**Problema**: El horario se muestra pero no se puede editar. En la practica cambia constantemente.

**Solucion**:
- Hacer cada celda del `ScheduleGrid` tappable → modal con TimePickers para inicio/fin y tarifa por hora
- Agregar metodos `upsert()` y `delete()` a `IScheduleRepository`
- Nuevo `ScheduleService` con `setWorkerSchedule(workerId, storeId, dayOfWeek, startTime, endTime)`
- Registrar en DI container

---

### H3 — Cargar Horas Automaticamente tras Cierre

**Problema**: Despues del cierre de caja, las horas trabajadas no se cargan automaticamente al saldo por pagar.

**Solucion**:
- Despues de `approveClosing()` en `CashClosingService`, trigger automatico:
  1. Obtener schedules del store para el dia de la semana del cierre
  2. Para cada worker programado, crear/upsert `Attendance` con `actualHours = scheduledHours`
- Agregar metodo `upsert()` a `IAttendanceRepository`
- Estos registros alimentan `PayrollService.calculatePayroll()`

---

### H4 — Ajustes de Horas en Tiempo Real (Clock In/Out)

**Problema**: El cajero u hornero no puede registrar su jornada real desde ventas.

**Solucion**:

#### Base de datos
```sql
ALTER TABLE attendance
  ADD COLUMN check_in TIMESTAMPTZ,
  ADD COLUMN check_out TIMESTAMPTZ,
  ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN verified_by UUID REFERENCES workers(id);
```

#### Logica
- Nuevo `ShiftService` con metodos `clockIn()`, `clockOut()`, `verifyShift()`
- `clockOut` calcula `actualHours` automaticamente

#### UI
- **Ventas**: Boton "Registrar Turno" para COLABORADOR (clock in/out)
- **RRHH Asistencia**: ADMIN ve turnos sin verificar → puede aprobar o ajustar horas

---

### H5 — Periodos de Pago e Historico

**Problema**: La nomina solo muestra la semana actual. No hay periodos configurables ni historico.

**Solucion**:

#### Base de datos
```sql
CREATE TABLE payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL DEFAULT 'SEMANAL', -- SEMANAL, QUINCENAL, MENSUAL
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ABIERTO', -- ABIERTO, CERRADO, PAGADO
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payroll_entries
  ADD COLUMN period_id UUID REFERENCES payroll_periods(id),
  ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN paid_at TIMESTAMPTZ;
```

#### UI
- Selector de tipo de periodo en `app/(tabs)/rrhh/nomina.tsx`
- Historico de periodos anteriores con estado (Abierto/Cerrado/Pagado)
- Detalle por empleado dentro de cada periodo

---

### H6 — Redefinir "Reporte" como Historico Laboral

**Problema**: El boton "Reporte" solo muestra un Alert diario sin persistencia.

**Solucion**:
- Reemplazar con pantalla que genere historicos laborales y colillas de pago por empleado
- Filtro por rango de fechas
- Datos de `payroll_entries` y `attendance`
- Vista formateada tipo "colilla de pago" con: periodo, horas, bruto, deducciones, neto

---

## Fase 6 — Contabilidad

> **Impacto**: Medio (Analytics) | **Esfuerzo**: Alto | **Dependencias**: Fase 2 (apertura de caja)

### C1 — Vista General Ingresos/Egresos + Arqueo Diario

**Problema**: No se puede hacer un arqueo de caja principal para verificar que el saldo teorico cuadre con el dinero fisico.

**Solucion**:
- Extender `app/(tabs)/contabilidad/index.tsx` con:
  - Selector de rango de fechas (hoy, semana, mes, personalizado)
  - Desglose de ingresos: ventas efectivo + ventas banco
  - Desglose de egresos por categoria
  - Seccion de arqueo diario:
    ```
    Saldo Teorico = Apertura + Ventas Efectivo - Egresos Efectivo
    vs. Conteo Fisico (del cierre de caja)
    ```
- Nuevo metodo `getDailyAudit(storeId, date)` en `DashboardService`

---

### C2 — Estructura de Balance para Franquicias

**Problema**: Se necesita generar balances por periodo y por local, pensando en modelo de franquicia.

**Solucion**:
- Nueva pantalla `app/(tabs)/contabilidad/balances.tsx`
- Selector de periodo (semana, mes, trimestre, personalizado)
- Toggle "Todos los locales" vs. por local individual
- P&L: ingresos, costo de venta, margen bruto, gastos operativos, utilidad neta
- Nuevos metodos en `DashboardService` para agregacion multi-store

---

### C3 — Centros de Costo Parametrizables

**Problema**: No se pueden separar ni unificar costos por local/centro de produccion segun el analisis requerido.

**Solucion** (implementar despues de C1 y C2 estables):
- Nueva tabla `cost_centers` con reglas de agrupacion
- Agregar `cost_center_id` a `expenses` y `purchases`
- Permitir ver P&L de un local solo, o combinado con centro de produccion
- Excluir costos para locales franquiciados que solo compran insumos

---

## Fase 7 — Dashboard

> **Impacto**: Medio (Analytics) | **Esfuerzo**: Medio | **Dependencias**: Fases 2-3

### D1 — Promedios de Venta con Filtros Avanzados

**Problema**: El dashboard no permite filtrar por producto, empleado, ni comparar punto de equilibrio por local.

**Solucion**:
- Agregar chips de filtro en `app/(tabs)/dashboard/index.tsx`:
  - Por local (ya existe StoreSelector, agregar "Todos")
  - Por tipo de producto (Pizza, Bebida, Otro)
  - Por empleado (quien vendio)
  - Por periodo (hoy, 7 dias, 30 dias, personalizado)
- Indicador de punto de equilibrio por local
- Extender metodos de `DashboardService` para aceptar parametros de filtro

---

### D2 — Multiples Tipos de Graficas

**Problema**: Solo hay barras horizontales custom y un gauge simple. No hay graficas de linea ni torta.

**Solucion**:
- Evaluar libreria: `react-native-chart-kit` (ligera, compatible web) o componentes SVG custom
- Nuevos componentes en `src/components/dashboard/`:

| Componente | Tipo | Uso |
|-----------|------|-----|
| `LineChart.tsx` | Linea temporal | Tendencia de ventas por dias/semanas |
| `BarChart.tsx` | Barras verticales | Comparacion entre productos o locales |
| `PieChart.tsx` | Torta/Dona | Distribucion de porciones, categorias de gasto |

---

## Cronograma y Dependencias

```
Fase 1 ──→ Fase 2 ──→ Fase 6 (Contabilidad necesita apertura)
      └──→ Fase 3 ──→ Fase 7 (Dashboard necesita datos completos)

Fase 4 (Inventario)  ── independiente, en paralelo
Fase 5 (RRHH)        ── independiente, en paralelo
```

| Fase | Features | Impacto | Esfuerzo | Depende de |
|------|----------|---------|----------|------------|
| **1** | V2, V3, V4, V6 | **Alto** (UX) | Bajo | — |
| **2** | V1, V5 | **Alto** (Operaciones) | Medio | Fase 1 |
| **3** | V7, V8, V9 | **Alto** (Completitud) | Medio | Fase 1 |
| **4** | I1, I2, I3, I4 | Medio (UX) | Bajo-Medio | — |
| **5** | H1, H2, H3, H4, H5, H6 | Medio (RRHH) | Alto | — |
| **6** | C1, C2, C3 | Medio (Analytics) | Alto | Fase 2 |
| **7** | D1, D2 | Medio (Analytics) | Medio | Fases 2-3 |

---

## Archivos Criticos

| Archivo | Fases que lo tocan |
|---------|-------------------|
| `app/(tabs)/ventas/index.tsx` | 1, 2, 3 |
| `src/services/CashClosingService.ts` | 2, 3, 5 |
| `src/di/container.ts` | 2, 3, 4, 5, 6 |
| `src/domain/entities/` | 2, 3, 5 |
| `src/stores/useAppStore.ts` | 4 |
| `src/utils/constants.ts` | 3 |
| `app/(tabs)/ventas/cierre-caja.tsx` | 2, 3 |
| `app/(tabs)/inventario/index.tsx` | 4 |
| `app/(tabs)/rrhh/horarios.tsx` | 5 |
| `app/(tabs)/rrhh/nomina.tsx` | 5 |
| `app/(tabs)/contabilidad/index.tsx` | 6 |
| `app/(tabs)/dashboard/index.tsx` | 7 |
| `src/services/DashboardService.ts` | 6, 7 |

---

## Verificacion por Fase

| Fase | Como verificar |
|------|---------------|
| 1 | `npx tsc --noEmit` + verificar visualmente layout en web |
| 2 | Crear apertura → verificar redirect gate → verificar que cierre usa base → probar calculadora de cambio |
| 3 | Registrar compra turno → verificar en cierre → baja de producto → verificar descuento inventario → checklist en cierre |
| 4 | ADMIN ve centro produccion por default → botones agrupados → compra desde contabilidad → crear insumo inline |
| 5 | Desactivar empleado → editar horario → cierre carga horas → clock in/out → periodos de pago → reporte historico |
| 6 | Arqueo diario cuadra → balance multi-store → filtrar por centro de costo |
| 7 | Filtros de dashboard → graficas de linea/barra/torta renderizan correctamente |
| **Todas** | `npm run build:web` para validar build de produccion |
