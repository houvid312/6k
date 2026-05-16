# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

6K Pizza is a full-stack management app for a pizza restaurant, covering sales, multi-level inventory, production, HR, credit tracking, accounting, and analytics. Deployed as a web app via Expo.

## Commands

```sh
npx expo start --web     # Web development server
npx expo start           # Development (all platforms)
npx tsc --noEmit         # Type-check without emitting
npm run build:web        # Production web build (output: dist/)
```

## Tech Stack

- **Framework**: React Native + Expo SDK 54, Expo Router v6 (file-based routing)
- **UI**: React Native Paper v5 (dark theme, primary `#E63946`)
- **Backend**: Supabase (PostgreSQL + Auth + REST API)
- **Global state**: Zustand (`useAppStore`)
- **Language**: TypeScript 5.9, path alias `@/*` → `src/*`
- **Utilities**: date-fns, uuid
- **Deployment**: Vercel (SPA mode)

## Architecture (Clean Architecture)

```
src/
├── domain/
│   ├── entities/          # Domain interfaces (PascalCase)
│   ├── enums/             # InventoryLevel, PaymentMethod, PizzaSize, UserRole, etc.
│   └── interfaces/
│       └── repositories/  # Repository contracts (IXxxRepository)
├── data/
│   └── repositories/      # Supabase implementations (SupabaseXxxRepository)
├── services/              # Business logic — receive repos via constructor DI
├── di/
│   ├── container.ts       # Singleton instantiation of repos and services
│   └── providers.tsx      # React context + useDI() hook
├── components/
│   ├── common/            # Reusable (StoreSelector, SearchableSelect, etc.)
│   └── inventario/        # Inventory-specific components
├── stores/                # Zustand stores
├── hooks/                 # Custom hooks (useSnackbar, etc.)
└── utils/                 # Helpers (dates, currency)

app/
├── (tabs)/
│   ├── ventas/            # Sales, cash closing, history
│   ├── inventario/        # Multi-level inventory, purchases, production, recipes,
│   │                      # physical counts, validations, demand, shipments, supplies
│   ├── cartera/           # Credit entries and tracking
│   ├── contabilidad/      # Accounting (in development)
│   ├── rrhh/              # Attendance, workers
│   └── dashboard/         # Analytics
└── login.tsx

supabase/
└── migrations/            # 001–016 (schema, seeds, auth, data import, RLS, etc.)
```

## Code Conventions

### Naming
- Entities: `PascalCase` (e.g. `ProductionRecipe`)
- Entity properties: `camelCase` (e.g. `storeId`)
- DB columns: `snake_case` (e.g. `store_id`)
- Repos map snake_case (DB) ↔ camelCase (TS) inside `toEntity()` functions

### Patterns
- Screens access services via `const { xxxService } = useDI()`
- User feedback: `useSnackbar()` → `showSuccess()` / `showError()`
- New entities, repos, and services must be exported from their `index.ts`
- New repos and services must be registered in `src/di/container.ts`

### Inventory
- 3 levels: `RAW` (raw materials), `PROCESSED` (processed product), `STORE` (in-store)
- `deductGrams` creates a negative-balance record if none exists
- `addGrams` upserts — creates the record if it doesn't exist

### Dates and currency
- Timezone: `America/Bogota` — always use `todayColombia()` from `src/utils/dates.ts` for current date; **never** `toISODate(new Date())`
- Currency: COP — use `formatCOP()` from `src/utils/currency.ts`

### UI
- Dark theme. Backgrounds: `#111111`, `#1E1E1E`. Text: `#F5F0EB`
- Primary/action color: `#E63946`
- Success color: `#4CAF50`
- Cards: `borderRadius: 12`

## Critical Rules

- **NEVER** create Supabase Auth users via direct SQL `INSERT`; use the Supabase Dashboard or Admin API
- Adding a new module: entity → repo interface → Supabase implementation → service → register in `container.ts` → screen in `app/(tabs)/`

## Supabase

- Migrations: `supabase/migrations/` (001–016)
- DB enums are stored as strings (`'RAW'`, `'PROCESSED'`, `'STORE'`, etc.)
- RLS (Row Level Security) is active — policies are defined in migration files
