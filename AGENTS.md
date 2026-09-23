# AGENTS.md

Este archivo guía a Codex (Codex.ai/code) cuando trabaje en este repositorio.

## Resumen del Proyecto

6K Pizza es una aplicación full-stack de gestión para una pizzería. Cubre ventas,
inventario multinivel, producción, recursos humanos, cartera, contabilidad y
analítica. Se despliega como aplicación web usando Expo.

## Comandos

```sh
npx expo start --web     # Servidor de desarrollo web
npx expo start           # Desarrollo para todas las plataformas
npx tsc --noEmit         # Type-check sin emitir archivos
npm run build:web        # Build web de producción (salida: dist/)
```

## Stack Técnico

- **Framework:** React Native + Expo SDK 54, Expo Router v6 (rutas por archivos)
- **UI:** React Native Paper v5 (tema oscuro, primary `#E63946`)
- **Backend:** Supabase (PostgreSQL + Auth + REST API)
- **Estado global:** Zustand (`useAppStore`)
- **Lenguaje:** TypeScript 5.9, alias de paths `@/*` -> `src/*`
- **Utilidades:** date-fns, uuid
- **Deploy:** Vercel (SPA mode)

## Arquitectura (Clean Architecture)

```text
src/
├── domain/
│   ├── entities/          # Interfaces de dominio (PascalCase)
│   ├── enums/             # InventoryLevel, PaymentMethod, PizzaSize, UserRole, etc.
│   └── interfaces/
│       └── repositories/  # Contratos de repositorios (IXxxRepository)
├── data/
│   └── repositories/      # Implementaciones Supabase (SupabaseXxxRepository)
├── services/              # Logica de negocio; reciben repos por DI en constructor
├── di/
│   ├── container.ts       # Instanciacion singleton de repos y servicios
│   └── providers.tsx      # React context + hook useDI()
├── components/
│   ├── common/            # Reutilizables (StoreSelector, SearchableSelect, etc.)
│   └── inventario/        # Componentes especificos de inventario
├── stores/                # Stores Zustand
├── hooks/                 # Hooks custom (useSnackbar, etc.)
└── utils/                 # Helpers (fechas, moneda)

app/
├── (tabs)/
│   ├── ventas/            # Ventas, cierre de caja, historial
│   ├── inventario/        # Inventario multinivel, compras, produccion, recetas,
│   │                      # conteos fisicos, validaciones, demanda, envios, insumos
│   ├── cartera/           # Creditos y seguimiento
│   ├── contabilidad/      # Contabilidad (en desarrollo)
│   ├── rrhh/              # Asistencia, trabajadores
│   └── dashboard/         # Analitica
└── login.tsx

supabase/
└── migrations/            # 001-016 (schema, seeds, auth, importacion, RLS, etc.)
```

## Convenciones de Código

### Nombres

- Entidades: `PascalCase` (por ejemplo, `ProductionRecipe`)
- Propiedades de entidades: `camelCase` (por ejemplo, `storeId`)
- Columnas de base de datos: `snake_case` (por ejemplo, `store_id`)
- Los repositorios mapean `snake_case` (DB) <-> `camelCase` (TS) dentro de
  funciones `toEntity()`.

### Patrones

- Las pantallas acceden a servicios con `const { xxxService } = useDI()`.
- Feedback al usuario: `useSnackbar()` -> `showSuccess()` / `showError()`.
- Las nuevas entidades, repositorios y servicios deben exportarse desde su
  `index.ts`.
- Los nuevos repositorios y servicios deben registrarse en `src/di/container.ts`.

### Inventario

- Hay 3 niveles: `RAW` (materias primas), `PROCESSED` (producto procesado),
  `STORE` (tienda).
- `deductGrams` crea un registro con balance negativo si no existe inventario.
- `addGrams` hace upsert; crea el registro si no existe.

### Fechas y moneda

- Timezone: `America/Bogota`. Para la fecha actual siempre usar
  `todayColombia()` desde `src/utils/dates.ts`; nunca usar
  `toISODate(new Date())`.
- Moneda: COP. Usar `formatCOP()` desde `src/utils/currency.ts`.

### UI

- Tema oscuro. Fondos: `#111111`, `#1E1E1E`. Texto: `#F5F0EB`.
- Color primario/accion: `#E63946`.
- Color de exito: `#4CAF50`.
- Cards: `borderRadius: 12`.

## Reglas Críticas

- **NUNCA** crear usuarios de Supabase Auth con `INSERT` directo por SQL. Usar
  Supabase Dashboard o Admin API.
- Para agregar un nuevo módulo seguir este flujo: entidad -> interfaz de repo ->
  implementación Supabase -> servicio -> registro en `container.ts` -> pantalla
  en `app/(tabs)/`.

## Principios Contables (Partida Doble)

Para evitar descuadres, faltantes/sobrantes ficticios y proteger el "Debe Haber" (Patrimonio Teórico), respeta siempre estas reglas de oro:

1. **Permutas de Activos:** Los préstamos (`Adelanto`) y los pagos de deudas (`Abono Cartera` / `Traslado`) son intercambios entre Efectivo, Bancos y Cartera. **NO son ingresos ni egresos patrimoniales.**
2. **Caja Diaria (ventas/cierre-caja.tsx):** A nivel físico, la cajera **SÍ** debe registrar los Adelantos como egresos (`closing.expenses`) para que el Efectivo esperado de su turno (Expected Cash) baje y su caja física le cuadre.
3. **Caja General / P&L (contabilidad/index.tsx):** A nivel patrimonial, el sistema **DEBE** revertir ese efecto para no desangrar el Patrimonio Teórico.
   - En la variable `grossOutflowToday`, se deben excluir/restar los adelantos (`cashAdvancesByDate`) que venían sumados dentro de `closing.expenses`.
   - En la variable `grossInflowToday`, se deben excluir los ingresos marcados como `Abono Cartera` y `Traslado` (usando `revenueCashIncomesByDate` en lugar de `cashIncomesByDate`).
4. **Matemática del Efectivo:** El sistema calcula el efectivo final de la sede como: `Efectivo = (Debe Haber) - Bancos - Cartera`. Si permites que una permuta modifique el `Debe Haber`, alterarás el resultado del Efectivo y generarás un descuadre automático.

## Diferencias Críticas: Tiendas Locales vs Centro de Producción (CP)

Al calcular métricas financieras (Flujo de Caja, P&L, Cierres Mensuales), el código debe separar estrictamente la lógica de las tiendas físicas y el Centro de Producción (`isProductionCenter === true`):

1. **Naturaleza de los Ingresos:**
   - **Tiendas:** Generan ingresos a través de `sales` (Ventas al público).
   - **CP:** NO tiene ventas al público. Sus ingresos (Ventas Netas) provienen de los **Traslados Internos** hacia las tiendas (`transfers` con `status = 'RECEIVED'`). En P&L, estos traslados se inyectan como `bankSales`. **Cuidado con el doble conteo:** Nunca sumar manualmente las órdenes de traslado en el frontend si ya se consumió el RPC de P&L.
2. **Egresos y Compras de Materia Prima:**
   - **CP:** Adquiere su materia prima a través del módulo de compras (`PurchaseService`). En el Flujo de Caja (Cierres Mensuales), es obligatorio sumar `totalPurchases` al Total de Salidas.
   - **Tiendas:** Reciben inventario del CP (`totalIncomingTransfers`). Para pagarlo, registran un Gasto manual de categoría "Traslado". En el Flujo de Caja, se suma `totalPurchases` (para compras menores directas) pero **NUNCA se debe sumar `totalIncomingTransfers` como salida** si ya se está contando el Gasto manual de "Traslado" en `supplyExp`, de lo contrario se duplican las salidas.
3. **Manejo de la categoría "Traslado" en Egresos:**
   - **Tiendas:** El Gasto de categoría "Traslado" (pago al CP) se incluye en `supplyExp` (insumos) y se filtra de `opsExps` para evitar doble conteo.
   - **CP:** Como no recibe traslados de inventario de nadie, si el CP registra un Gasto de categoría "Traslado" (ej. retiro de utilidades o envío a otra cuenta), este Gasto **DEBE incluirse** en `opsExps` (Gastos Operativos) y no ser filtrado.
4. **Descuadres y Cartera vs Flujo Neto:**
   - **Tiendas:** Tienen alto volumen de transacciones en efectivo. El `Debe Haber` diferirá del `Flujo Neto de Caja` debido a los Descuadres diarios de los cajeros y a la Cartera (Adelantos prestados y Abonos cobrados, los cuales son permutas y no flujos operativos).
   - **CP:** Al no tener atención al público, los descuadres tienden a cero. El Flujo Neto operativo se alinea casi matemáticamente con su Debe Haber.

## Supabase

- Migraciones en `supabase/migrations/` (001-016).
- Los enums de DB se guardan como strings (`'RAW'`, `'PROCESSED'`, `'STORE'`,
  etc.).
- RLS (Row Level Security) está activo; las policies están definidas en las
  migraciones.
