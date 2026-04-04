# 6K Pizza - App de Gestión para Pizzería

## Descripción
App de gestión integral para la pizzería 6K Pizza. Cubre ventas, inventario multi-nivel, producción, RRHH, cartera, contabilidad y dashboard analítico. Desplegada como web app vía Expo.

## Stack Técnico
- **Framework**: React Native con Expo SDK 54 (Expo Router v6, file-based routing)
- **UI**: React Native Paper v5 (tema oscuro, color primario `#E63946`)
- **Backend**: Supabase (PostgreSQL + Auth + REST API)
- **Estado global**: Zustand (`useAppStore`)
- **Lenguaje**: TypeScript 5.9
- **Utilidades**: date-fns, uuid

## Arquitectura (Clean Architecture)

```
src/
├── domain/
│   ├── entities/        # Interfaces de dominio (PascalCase)
│   ├── enums/           # InventoryLevel, PaymentMethod, PizzaSize, etc.
│   └── interfaces/
│       └── repositories/  # Contratos de repositorio (IXxxRepository)
├── data/
│   └── repositories/    # Implementaciones Supabase (SupabaseXxxRepository)
├── services/            # Lógica de negocio (reciben repos por constructor)
├── di/
│   ├── container.ts     # Instanciación de repos y servicios (singleton)
│   └── providers.tsx    # React context, hook useDI()
├── components/
│   ├── common/          # Reutilizables (StoreSelector, SearchableSelect, etc.)
│   └── inventario/      # Específicos del módulo inventario
├── stores/              # Zustand stores
├── hooks/               # Custom hooks (useSnackbar, etc.)
└── utils/               # Helpers (dates, currency)

app/
├── (tabs)/
│   ├── ventas/          # Registro, cierre de caja, historial
│   ├── inventario/      # Niveles, compras, producción, recetas, cierre físico,
│   │                    # validaciones, demanda, envíos, insumos
│   ├── cartera/         # Créditos y seguimiento
│   ├── contabilidad/    # (en desarrollo)
│   ├── rrhh/            # Asistencia, trabajadores
│   └── dashboard/       # Analytics
└── login.tsx

supabase/
└── migrations/          # 001 a 010 (schema, seeds, auth, data import, etc.)
```

## Convenciones de Código

### Naming
- Entidades: `PascalCase` (ej. `ProductionRecipe`)
- Propiedades de entidad: `camelCase` (ej. `storeId`)
- Columnas DB: `snake_case` (ej. `store_id`)
- Repos mapean snake_case (DB) ↔ camelCase (TS) en funciones `toEntity()`

### Patrones
- Servicios reciben repositorios por constructor (inyección de dependencias)
- Pantallas acceden a servicios via `const { xxxService } = useDI()`
- Feedback al usuario con `useSnackbar()` → `showSuccess()` / `showError()`
- Nuevas entidades, repos, servicios **siempre** se exportan desde su `index.ts`
- Nuevos repos y servicios se registran en `src/di/container.ts`

### Inventario
- 3 niveles: `RAW` (materia prima), `PROCESSED` (producto procesado), `STORE` (en tienda)
- `deductGrams` crea registro con balance negativo si no existe previamente
- `addGrams` crea registro si no existe (upsert pattern)

### Fechas y moneda
- Zona horaria: `America/Bogota` (usar `todayColombia()` de `src/utils/dates.ts`)
- Moneda: COP (usar `formatCOP()` de `src/utils/currency.ts`)

### UI
- Tema oscuro. Fondos: `#111111`, `#1E1E1E`. Texto: `#F5F0EB`
- Color primario/acción: `#E63946`
- Color éxito: `#4CAF50`
- Cards con `borderRadius: 12`

## Reglas Importantes
- **NUNCA** crear usuarios de Supabase Auth via SQL INSERT directo; usar Dashboard o Admin API
- **NUNCA** usar `toISODate(new Date())` para fecha actual; usar `todayColombia()`
- Al agregar un módulo nuevo: crear entidad → interfaz repo → implementación Supabase → servicio → registrar en container.ts → crear pantalla en app/(tabs)/

## Comandos
```sh
npx expo start --web     # Desarrollo web
npx expo start           # Desarrollo (todos)
npx tsc --noEmit         # Verificar tipos
```

## Supabase
- Las migraciones están en `supabase/migrations/` (001-010)
- Los enums de DB son strings ('RAW', 'PROCESSED', 'STORE', etc.)
- RLS (Row Level Security) está activo - las políticas se definen en migraciones
