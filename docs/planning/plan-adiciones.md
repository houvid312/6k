# Plan: Adiciones de Pizza

## Contexto

El sistema actual maneja pizzas con recetas fijas (recipe → recipe_ingredients → grams_per_portion). Al vender, el RPC `deduct_inventory_for_sale` descuenta ingredientes del inventario STORE multiplicando `grams_per_portion × portions`. No existe concepto de adiciones/toppings extras.

Se necesita que el cliente pueda agregar ingredientes extra a su pizza, con precio y gramaje que **varía según el formato** (Individual, Diamante, Mediana, Familiar). El caso especial de la Diamante: 1 adicion Diamante = mismo gramaje que 2 adiciones normales, pero con precio independiente (no es 2x el precio normal).

---

## Diseño: Catálogo por formato (no por producto)

La clave del diseño: cada adición se define **por formato**, no por producto. Esto resuelve el caso Diamante de forma genérica — cada formato tiene su propio precio y gramaje por adición, sin excepciones hardcodeadas.

---

## 1. Migración SQL (`supabase/migrations/019_adiciones.sql`)

### Tabla `addition_catalog` — catálogo de adiciones disponibles por formato

```sql
CREATE TABLE addition_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  format_id UUID NOT NULL REFERENCES product_formats(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- "Extra Queso", "Extra Jamón"
  price INTEGER NOT NULL,          -- precio COP para ESTE formato
  grams INTEGER NOT NULL,          -- gramos a descontar para ESTE formato
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supply_id, format_id)
);
CREATE INDEX idx_addition_catalog_format ON addition_catalog(format_id, is_active);
```

**Ejemplo**: "Extra Queso" para los 4 formatos de Hawaiana:
| formato     | portions | price  | grams |
|-------------|----------|--------|-------|
| Individual  | 1        | 3,000  | 30g   |
| Diamante    | 2        | 4,000  | 60g   | ← mismo gramaje que 2 individuales, precio diferente
| Mediana     | 4        | 10,000 | 120g  |
| Familiar    | 8        | 18,000 | 240g  |

### Tabla `sale_item_additions` — adiciones compradas por sale_item

```sql
CREATE TABLE sale_item_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  addition_catalog_id UUID NOT NULL REFERENCES addition_catalog(id),
  supply_id UUID NOT NULL REFERENCES supplies(id),
  name TEXT NOT NULL,               -- snapshot al momento de la venta
  price INTEGER NOT NULL,           -- snapshot
  grams INTEGER NOT NULL,           -- snapshot
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_item_additions_item ON sale_item_additions(sale_item_id);
```

### Columna en `sale_items`

```sql
ALTER TABLE sale_items ADD COLUMN additions_total INTEGER NOT NULL DEFAULT 0;
```

### RLS policies (misma estructura que tablas existentes)

### Actualizar RPC `deduct_inventory_for_sale`

Agregar loop de adiciones después del loop de recipe_ingredients:

```sql
-- NUEVO: descontar adiciones
FOR addition IN
  SELECT sia.supply_id, sia.grams, sia.quantity
  FROM sale_item_additions sia
  WHERE sia.sale_item_id = item.id
LOOP
  UPDATE inventory
  SET quantity_grams = quantity_grams - (addition.grams * addition.quantity),
      last_updated = now()
  WHERE supply_id = addition.supply_id
    AND store_id = v_store_id
    AND level = 'STORE';
END LOOP;
```

---

## 2. Entidad (`src/domain/entities/Addition.ts`)

```typescript
export interface AdditionCatalogItem {
  id: string;
  supplyId: string;
  formatId: string;
  name: string;
  price: number;
  grams: number;
  isActive: boolean;
  sortOrder: number;
}

export interface SaleItemAddition {
  additionCatalogId: string;
  supplyId: string;
  name: string;
  price: number;
  grams: number;
  quantity: number;
}
```

Agregar a `SaleItem`: `additions?: SaleItemAddition[]`, `additionsTotal?: number`

---

## 3. Repositorio (`src/data/repositories/SupabaseAdditionCatalogRepository.ts`)

- `getByFormatId(formatId): Promise<AdditionCatalogItem[]>` — query principal para el UI
- CRUD admin (create/update/delete) para gestión futura del catálogo
- Seguir patrón de `SupabaseProductFormatRepository`

---

## 4. Repositorio de ventas (`SupabaseSaleRepository.ts`)

Cambio crítico en `create()`:

1. Cambiar insert de sale_items para capturar IDs: `.insert(itemRows).select('id')`
2. Para cada item con adiciones, insertar en `sale_item_additions` usando el ID retornado
3. Luego llamar RPC como antes

En `hydrateSales()` y `fetchSaleItems()`: también traer `sale_item_additions` y adjuntarlas a cada SaleItem.

---

## 5. Servicio (`SaleService.ts`)

Agregar a `CreateSaleItemInput`:
```typescript
additions?: { additionCatalogId: string; supplyId: string; name: string; price: number; grams: number; quantity: number }[]
```

Calcular `additionsTotal` por item y sumarlo al `subtotal`:
```typescript
const additionsTotal = (item.additions ?? []).reduce((s, a) => s + a.price * a.quantity, 0);
const subtotal = item.unitPrice * item.quantity + additionsTotal;
```

---

## 6. Store Zustand (`useSaleStore.ts`)

Agregar a `CartItem`:
```typescript
additions: CartItemAddition[];    // lista de adiciones seleccionadas
additionsTotal: number;           // suma de precios de adiciones
```

Nuevas acciones:
- `addAdditionToCartItem(cartItemId, addition)`
- `removeAdditionFromCartItem(cartItemId, additionCatalogId)`

Actualizar `subtotal`: `unitPrice * quantity + additionsTotal`

**Merge logic**: Items con adiciones NO se mergean (siempre línea independiente).

---

## 7. UI Components

### Nuevo: `src/components/ventas/AdditionSelector.tsx`

- Se muestra después de seleccionar formato, antes de "Agregar"
- Chips toggleables con nombre + precio del formato seleccionado
- Control +/- para cantidad cuando está seleccionada
- Dark theme (#1E1E1E), mismo estilo que packaging selector

### Modificar: `SaleScreen.tsx`

- Fetch adiciones cuando se selecciona formato: `additionCatalogRepo.getByFormatId(formatId)`
- Estado local: `selectedAdditions: CartItemAddition[]`
- Pasar adiciones al `addToCart`
- Mostrar precio total (base + adiciones) junto al botón "Agregar"
- Reset adiciones al agregar al carrito

### Modificar: `CartSummary.tsx`

Mostrar adiciones debajo de cada item:
```
Pizza Hawaiana - Individual . 1 porc.
  + Extra Queso ($3,000)
  + Extra Jamón ($4,000)
                              $10,000
```

---

## 8. DI Container (`src/di/container.ts`)

- Instanciar `SupabaseAdditionCatalogRepository`
- Exportar como `additionCatalogRepo`

---

## 9. Secuencia de implementación

1. Migración SQL (019_adiciones.sql)
2. Entidad Addition.ts + actualizar SaleItem + exports en index.ts
3. Interfaz IAdditionCatalogRepository + implementación Supabase
4. Actualizar SupabaseSaleRepository (insert con .select('id'), insertar adiciones)
5. Actualizar SaleService (additions en input, calcular additionsTotal)
6. Actualizar useSaleStore (additions en CartItem, nuevas acciones)
7. Registrar en container.ts
8. Crear AdditionSelector.tsx
9. Integrar en SaleScreen.tsx
10. Actualizar CartSummary.tsx

---

## 10. Archivos a modificar/crear

| Acción  | Archivo |
|---------|---------|
| CREAR   | `supabase/migrations/019_adiciones.sql` |
| CREAR   | `src/domain/entities/Addition.ts` |
| CREAR   | `src/domain/interfaces/repositories/IAdditionCatalogRepository.ts` |
| CREAR   | `src/data/repositories/SupabaseAdditionCatalogRepository.ts` |
| CREAR   | `src/components/ventas/AdditionSelector.tsx` |
| EDITAR  | `src/domain/entities/SaleItem.ts` |
| EDITAR  | `src/domain/entities/index.ts` |
| EDITAR  | `src/domain/interfaces/repositories/index.ts` |
| EDITAR  | `src/data/repositories/SupabaseSaleRepository.ts` |
| EDITAR  | `src/services/SaleService.ts` |
| EDITAR  | `src/stores/useSaleStore.ts` |
| EDITAR  | `src/di/container.ts` |
| EDITAR  | `src/screens/SaleScreen.tsx` |
| EDITAR  | `src/components/ventas/CartSummary.tsx` |
| EDITAR  | `src/components/ventas/index.ts` |

---

## 11. Verificación

1. **SQL**: Aplicar migración 019, verificar tablas creadas y RPC actualizado
2. **TypeScript**: `npx tsc --noEmit` sin errores
3. **Flujo completo**: Seleccionar pizza → formato → agregar adiciones → ver en carrito con precios correctos → confirmar venta → verificar que sale_item_additions se insertaron → verificar que inventario STORE se descontó correctamente (receta base + adiciones)
4. **Caso Diamante**: Verificar que muestra precios/gramajes diferentes a los de Individual
5. **Backwards compat**: Ventas sin adiciones deben funcionar igual que antes (additions_total=0)
