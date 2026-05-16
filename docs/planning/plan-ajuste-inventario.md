# Plan: Ajuste Modulo de Inventario - 6K Pizza

## Contexto

El modulo de inventario actual tiene la estructura de 3 niveles (RAW, PROCESSED, STORE) pero le faltan piezas clave para funcionar como el negocio lo necesita:

1. **Las compras no alimentan el inventario RAW** automaticamente (falta `store_id` en purchases)
2. **No existe pantalla ni registro de produccion** (raw → procesado) con trazabilidad de quien lo hizo
3. **El arqueo fisico no registra quien lo hizo** (falta `worker_id`)
4. **Las validaciones estan en modo placeholder** (pasan `{}` como inventario, no generan alertas reales)
5. **No hay calculo automatico de envios** basado en demanda estimada por dia
6. **El cierre de caja no dispara validacion de inventario**

### Decisiones del usuario:
- Recetas de produccion: **plantillas parametrizables** reutilizables
- Permisos: **basicos por ahora** (PREPARADOR → produccion, CAJERO → arqueo). Roles multiples switcheables en plan separado
- Demanda estimada: **pantalla admin** en la app
- Alertas: **solo en pantalla de validaciones** (sin badges ni push por ahora)
- ROODIE = repartidor de insumos entre locales (rol a agregar al enum, no en este plan)

---

## Fase 1: Migracion de Base de Datos

**Archivo:** `supabase/migrations/009_inventory_enhancements.sql`

### 1.1 Modificar tabla `purchases` — agregar `store_id`
```sql
ALTER TABLE purchases ADD COLUMN store_id UUID REFERENCES stores(id);
UPDATE purchases SET store_id = (SELECT id FROM stores WHERE is_production_center = true LIMIT 1);
ALTER TABLE purchases ALTER COLUMN store_id SET NOT NULL;
```

### 1.2 Trigger: compra → inventario RAW automatico
```sql
CREATE OR REPLACE FUNCTION add_purchase_to_raw_inventory()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory (supply_id, store_id, level, quantity_grams)
  VALUES (NEW.supply_id, NEW.store_id, 'RAW', NEW.quantity_grams)
  ON CONFLICT (supply_id, store_id, level)
  DO UPDATE SET quantity_grams = inventory.quantity_grams + NEW.quantity_grams,
               last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_add_purchase_to_inventory
  AFTER INSERT ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION add_purchase_to_raw_inventory();
```

### 1.3 Modificar `physical_counts` — agregar `worker_id`
```sql
ALTER TABLE physical_counts ADD COLUMN worker_id UUID REFERENCES workers(id);
```

### 1.4 Modificar `validations` — agregar tracking
```sql
ALTER TABLE validations ADD COLUMN worker_id UUID REFERENCES workers(id);
ALTER TABLE validations ADD COLUMN physical_count_id UUID REFERENCES physical_counts(id);
```

### 1.5 Nueva tabla: `production_recipes` (plantillas de produccion)
```sql
CREATE TABLE production_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id),  -- insumo producido (ej: jamon procesado)
  name TEXT NOT NULL,                                 -- ej: "Jamon en bolsas de 134g"
  output_grams NUMERIC NOT NULL,                      -- gramos totales producidos por lote
  output_bags INTEGER NOT NULL DEFAULT 1,             -- bolsas resultantes por lote
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_recipe_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_recipe_id UUID NOT NULL REFERENCES production_recipes(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id),   -- insumo crudo consumido
  grams_required NUMERIC NOT NULL DEFAULT 0,          -- gramos de crudo por lote
  UNIQUE(production_recipe_id, supply_id)
);
```

### 1.6 Nueva tabla: `production_records` (registros de produccion)
```sql
CREATE TABLE production_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  worker_id UUID NOT NULL REFERENCES workers(id),
  production_recipe_id UUID NOT NULL REFERENCES production_recipes(id),
  batches INTEGER NOT NULL DEFAULT 1,                 -- cuantos lotes se hicieron
  total_grams_produced NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_record_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_record_id UUID NOT NULL REFERENCES production_records(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES supplies(id),
  grams_consumed NUMERIC NOT NULL DEFAULT 0
);
```

### 1.7 Nueva tabla: `demand_estimates`
```sql
CREATE TABLE demand_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  product_id UUID NOT NULL REFERENCES products(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  estimated_portions INTEGER NOT NULL DEFAULT 0,
  UNIQUE(store_id, product_id, day_of_week)
);
```

### 1.8 Nueva tabla: `daily_alerts`
```sql
CREATE TABLE daily_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date DATE NOT NULL,
  physical_count_id UUID REFERENCES physical_counts(id),
  closing_worker_id UUID REFERENCES workers(id),
  count_worker_id UUID REFERENCES workers(id),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  theoretical_grams NUMERIC NOT NULL DEFAULT 0,
  real_grams NUMERIC NOT NULL DEFAULT 0,
  difference_grams NUMERIC NOT NULL DEFAULT 0,
  difference_percent NUMERIC NOT NULL DEFAULT 0,
  alert_type alert_type NOT NULL DEFAULT 'OK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.9 Seed data: demanda estimada Local 2

Insertar los datos de la tabla del documento .md:

| DIA | Hawaianas | Jamon y tocineta | Peperoni | Pollo con champinones | Napolitana | Mexicana | Jamon y queso |
|-----|-----------|------------------|----------|-----------------------|------------|----------|---------------|
| LUNES | 25 | 19 | 9 | 10 | 6 | 7 | 4 |
| MARTES | 25 | 19 | 9 | 10 | 6 | 7 | 4 |
| MIERCOLES | 25 | 19 | 9 | 10 | 6 | 7 | 4 |
| JUEVES | 31 | 24 | 12 | 12 | 8 | 9 | 6 |
| VIERNES | 40 | 31 | 15 | 16 | 10 | 11 | 7 |
| SABADO | 49 | 38 | 19 | 19 | 12 | 14 | 9 |
| DOMINGO | 40 | 31 | 15 | 16 | 10 | 11 | 7 |

### 1.10 RLS policies + indices para todas las tablas nuevas
- Patron existente: authenticated read, admin write
- **Excepcion**: `physical_counts` y `production_records` permiten INSERT a COLABORADOR (para que PREPARADOR y CAJERO puedan usarlos)
- Indices en: (store_id, created_at) para production_records, (store_id, day_of_week) para demand_estimates, (store_id, date) para daily_alerts

---

## Fase 2: Capa de Dominio (Entidades + Interfaces)

### Archivos nuevos:
- `src/domain/entities/ProductionRecipe.ts` — interfaces ProductionRecipe, ProductionRecipeInput
- `src/domain/entities/ProductionRecord.ts` — interfaces ProductionRecord, ProductionRecordItem
- `src/domain/entities/DemandEstimate.ts`
- `src/domain/entities/DailyAlert.ts`

### Archivos modificados:
- `src/domain/entities/Purchase.ts` — agregar `storeId: string`
- `src/domain/entities/PhysicalCount.ts` — agregar `workerId?: string`

### Interfaces de repositorio nuevas:
- `src/domain/interfaces/repositories/IProductionRecipeRepository.ts`
- `src/domain/interfaces/repositories/IProductionRecordRepository.ts`
- `src/domain/interfaces/repositories/IDemandEstimateRepository.ts`
- `src/domain/interfaces/repositories/IDailyAlertRepository.ts`

### Barrel exports:
- `src/domain/entities/index.ts`
- `src/domain/interfaces/repositories/index.ts`

---

## Fase 3: Capa de Datos (Repositorios Supabase)

### Archivos nuevos:
- `src/data/repositories/SupabaseProductionRecipeRepository.ts` — CRUD production_recipes + inputs
- `src/data/repositories/SupabaseProductionRecordRepository.ts` — create + getByStore + getByDateRange
- `src/data/repositories/SupabaseDemandEstimateRepository.ts` — CRUD + getByStoreAndDay
- `src/data/repositories/SupabaseDailyAlertRepository.ts` — create + getByStoreAndDate + getByDateRange

### Archivos modificados:
- `src/data/repositories/SupabasePurchaseRepository.ts` — mapear `store_id` en toRow/toEntity
- `src/data/repositories/SupabasePhysicalCountRepository.ts` — mapear `worker_id` en create

### Barrel export:
- `src/data/repositories/index.ts`

---

## Fase 4: Capa de Servicios

### 4.1 Nuevo: `ProductionService` (`src/services/ProductionService.ts`)
- **Deps**: IProductionRecipeRepository, IProductionRecordRepository, IInventoryRepository, ISupplyRepository
- `getRecipes()` — lista plantillas de produccion activas
- `registerProduction(storeId, workerId, recipeId, batches)`:
  1. Calcula grams = recipe.outputGrams * batches
  2. Para cada input de la receta: deducir inputGrams * batches de RAW
  3. Agregar grams al nivel PROCESSED
  4. Crear production_record con items
- `getProductionHistory(storeId, startDate, endDate)`

### 4.2 Nuevo: `DemandEstimationService` (`src/services/DemandEstimationService.ts`)
- **Deps**: IDemandEstimateRepository, IRecipeRepository, IInventoryRepository, ISupplyRepository
- `getEstimatedDemand(storeId, dayOfWeek)` — porciones por producto
- `calculateRequiredSupplies(storeId, dayOfWeek)` — cruza demanda x recetas → gramos por insumo
- `generateSuggestedTransfer(fromStoreId, toStoreId, dayOfWeek)` — calcula `minTargets` map que ya acepta `TransferService.generateTransferOrder()`

### 4.3 Nuevo: `AlertService` (`src/services/AlertService.ts`)
- **Deps**: IDailyAlertRepository, ValidationService, IPhysicalCountRepository
- `triggerPostClosingValidation(storeId, date, workerId?)`:
  1. Obtiene ultimo physical_count del store
  2. Calcula consumo teorico via `ValidationService.calculateTheoreticalConsumption()`
  3. Compara con inventario real del conteo fisico
  4. Persiste en `daily_alerts`
  5. Retorna alertas generadas
- `getDailyAlerts(storeId, date)`
- `getAlertHistory(storeId, startDate, endDate)`

### 4.4 Modificado: `CashClosingService`
- Agregar `AlertService` como dependencia
- Despues de `createClosing()` exitoso, llamar `alertService.triggerPostClosingValidation()`

### 4.5 Modificado: `PhysicalCountService`
- `submitCount(storeId, workerId, items)` — agregar parametro workerId

### Barrel export: `src/services/index.ts`

---

## Fase 5: DI Container

**Archivo:** `src/di/container.ts`

- Instanciar repos nuevos: productionRecipeRepo, productionRecordRepo, demandEstimateRepo, dailyAlertRepo
- Instanciar servicios nuevos: productionService, demandEstimationService, alertService
- Modificar construccion de cashClosingService para inyectar alertService
- Exportar todo en el container

---

## Fase 6: Pantallas UI

### 6.1 Modificar: Compras (`app/(tabs)/inventario/compras.tsx`)
- Agregar `store_id` al crear compra (default: centro de produccion)
- **CRITICO**: debe desplegarse junto con la migracion, o el NOT NULL constraint rompe inserts

### 6.2 Modificar: Cierre Fisico (`app/(tabs)/inventario/cierre-fisico.tsx`)
- Agregar selector de trabajador al inicio del formulario
- Pasar `workerId` a `physicalCountService.submitCount()`
- Reusar patron de `workerRepo.getAll()` + dropdown

### 6.3 Nueva: Produccion (`app/(tabs)/inventario/produccion.tsx`)
- Selector de trabajador (auto-seleccionar si hay sesion activa)
- Lista de recetas de produccion disponibles
- Para cada receta: campo para ingresar numero de lotes
- Boton "Registrar Produccion" → `productionService.registerProduction()`
- Muestra resumen: gramos producidos, gramos consumidos de RAW
- Snackbar de confirmacion

### 6.4 Nueva: Recetas de Produccion (`app/(tabs)/inventario/recetas-produccion.tsx`)
- CRUD de plantillas: nombre, insumo producido, gramos output, bolsas output
- Para cada receta: lista de inputs (insumo crudo + gramos requeridos por lote)
- Solo visible para ADMIN
- Patron similar a `recetas.tsx` existente

### 6.5 Reescribir: Validaciones (`app/(tabs)/inventario/validaciones.tsx`)
- Reemplazar datos placeholder (`{}`) con datos reales de `alertService.getDailyAlerts()`
- Agregar selector de fecha/rango
- Mostrar: insumo, teorico, real, diferencia, %, tipo alerta, worker que hizo el conteo
- Historial de alertas diarias

### 6.6 Nueva: Sugerencia de Envio (`app/(tabs)/inventario/sugerencia-envio.tsx`)
- Selector de local destino
- Selector de dia de la semana (default: manana)
- Boton "Calcular" → `demandEstimationService.generateSuggestedTransfer()`
- Tabla: insumo | inventario actual | demanda estimada | bolsas a enviar
- Boton "Crear Orden de Traslado" → `transferService.generateTransferOrder()`

### 6.7 Nueva: Demanda Estimada (`app/(tabs)/inventario/demanda.tsx`)
- Solo ADMIN
- Selector de local
- Tabla editable: filas = dias de semana, columnas = pizzas
- Celdas = porciones estimadas
- Boton guardar por dia o global

### 6.8 Modificar: Index Inventario (`app/(tabs)/inventario/index.tsx`)
- Agregar botones de navegacion: "Produccion", "Sugerencia", "Demanda", "Recetas Prod."
- En la fila `navRow` existente

### 6.9 Modificar: Layout Inventario (`app/(tabs)/inventario/_layout.tsx`)
- Registrar Stack.Screen para las 4 nuevas pantallas

### 6.10 Modificar: Traslados (`app/(tabs)/inventario/traslados.tsx`)
- Agregar boton "Sugerencia Automatica" que navega a `sugerencia-envio`

---

## Archivos Criticos (rutas completas)

| Componente | Ruta |
|---|---|
| Schema actual | `6k-pizza/supabase/migrations/001_initial_schema.sql` |
| DI Container | `6k-pizza/src/di/container.ts` |
| InventoryService | `6k-pizza/src/services/InventoryService.ts` |
| TransferService | `6k-pizza/src/services/TransferService.ts` |
| ValidationService | `6k-pizza/src/services/ValidationService.ts` |
| PhysicalCountService | `6k-pizza/src/services/PhysicalCountService.ts` |
| CashClosingService | `6k-pizza/src/services/CashClosingService.ts` |
| Pantalla Inventario | `6k-pizza/app/(tabs)/inventario/index.tsx` |
| Pantalla Compras | `6k-pizza/app/(tabs)/inventario/compras.tsx` |
| Pantalla Cierre Fisico | `6k-pizza/app/(tabs)/inventario/cierre-fisico.tsx` |
| Pantalla Validaciones | `6k-pizza/app/(tabs)/inventario/validaciones.tsx` |
| Pantalla Traslados | `6k-pizza/app/(tabs)/inventario/traslados.tsx` |
| Entidades index | `6k-pizza/src/domain/entities/index.ts` |
| Repos index | `6k-pizza/src/data/repositories/index.ts` |
| Services index | `6k-pizza/src/services/index.ts` |

## Funciones Existentes a Reutilizar

- `TransferService.generateTransferOrder(from, to, minTargets)` — el nuevo DemandEstimationService solo calcula los `minTargets`, la logica de crear la orden ya existe
- `ValidationService.calculateTheoreticalConsumption(storeId, start, end)` — AlertService la usa directamente
- `InventoryService.processRawToProcessed(storeId, supplyId, grams)` — referencia para ProductionService (aunque ProductionService maneja multiples inputs)
- `inventoryRepo.addGrams()`, `inventoryRepo.deductGrams()`, `inventoryRepo.setQuantity()` — operaciones atomicas de inventario
- Trigger DB `deduct_inventory_on_sale()` — ya descuenta del nivel STORE al vender, no hay que tocarlo
- Componentes UI: `BagCounter`, `StoreSelector`, `ScreenContainer`, `LoadingIndicator`, `EmptyState`, `useSnackbar`

---

## Orden de Implementacion

1. Migracion DB (Fase 1) — todo lo demas depende de esto
2. Entidades + interfaces (Fase 2) — TypeScript puro
3. Repositorios (Fase 3) — dependen de entidades
4. Servicios (Fase 4) — dependen de repos
5. DI Container (Fase 5) — conecta todo
6. **Compras** (6.1) — CRITICO, debe ir con la migracion
7. **Cierre Fisico** (6.2) — cambio menor, buen smoke test
8. **Recetas Produccion** (6.4) — necesario antes de Produccion
9. **Produccion** (6.3) — depende de recetas
10. **Validaciones** (6.5) — reescritura, depende de AlertService
11. **Demanda Estimada** (6.7) — necesario antes de Sugerencia
12. **Sugerencia de Envio** (6.6) — depende de demanda
13. **Traslados** (6.10) — agregar boton
14. **Index Inventario** (6.8) — agregar navegacion

---

## Verificacion

1. **Compras → RAW**: Registrar una compra, verificar que el inventario RAW del centro de produccion incrementa automaticamente (trigger DB)
2. **Produccion**: Crear receta de produccion (ej: Jamon → 1000g crudo → 8 bolsas 125g). Registrar produccion de 2 lotes. Verificar: RAW baja 2000g, PROCESSED sube 2000g
3. **Cierre Fisico**: Hacer conteo con un worker seleccionado. Verificar que `physical_counts` guarda el `worker_id`
4. **Cierre Caja → Alertas**: Registrar ventas, hacer cierre fisico, hacer cierre de caja. Verificar que `daily_alerts` se genera con las discrepancias correctas
5. **Validaciones**: Entrar a la pantalla y verificar que muestra alertas reales (no vacias)
6. **Sugerencia de Envio**: Configurar demanda para un local. Calcular sugerencia. Verificar que los bags sugeridos son coherentes con la demanda menos el inventario actual
7. **Demanda Estimada**: Editar valores, guardar, recargar — verificar persistencia

---

## Mapeo de gramos por bolsa (referencia del documento)

| INSUMO | GRAMOS_POR_BOLSA |
|--------|-----------------|
| MASA | 600 |
| QUESO | 312 |
| SALSA NAPOLITANA | 3000 |
| JAMON | 134 |
| TOCINETA | 125 |
| PINA | 106 |
| PEPPERONI | 125 |
| POLLO | 50 |
| CHAMPINONES | 125 |
| TOMATE | 1000 |
| ALBAHACA | 200 |
| CARNE | 200 |
| GUACAMOLE | 600 |
| SALSA ALBAHACA | 600 |
| SALSA JALAPENO | 600 |
| LIMON | 1000 |
| CILANTRO | 200 |
| CEBOLLA | 1000 |

---

## Notas para plan futuro (fuera de alcance)

- **Roles multiples switcheables**: migrar `workers.role` a tabla many-to-many `worker_roles`, con rol activo en sesion. Afecta permisos, modulos visibles, y RLS.
- **Rol ROODIE**: agregar al enum `worker_role` cuando se implemente el sistema de roles multiples. Es el encargado de trasladar inventario del centro de produccion a los locales.
- **Badges/push notifications**: agregar indicadores en otros tabs cuando haya alertas
- **Historial de produccion detallado**: dashboard con graficas de produccion por periodo
