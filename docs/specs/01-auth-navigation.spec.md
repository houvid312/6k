# Autenticacion, roles y navegacion

## Alcance

Cubre:

- `app/_layout.tsx`
- `app/index.tsx`
- `app/login.tsx`
- `app/(tabs)/_layout.tsx`
- `src/services/SupabaseAuthService.ts`
- `src/stores/useAppStore.ts`
- `src/stores/useMasterDataStore.ts`

## Actores

- `ADMIN`: acceso a ventas, inventario, contabilidad, cartera, RRHH y dashboard.
- `COLABORADOR`: acceso visible a ventas e inventario operativo.

## Inicio de sesion

1. El usuario ingresa `Usuario` y `PIN`.
2. La pantalla normaliza el usuario eliminando espacios y usando minusculas.
3. El PIN solo acepta digitos y se limita a 6 caracteres.
4. `SupabaseAuthService.login(username, pin)` construye el email como
   `<username>@6kpizza.app`.
5. Supabase Auth valida `email + password`.
6. Si Auth falla, se muestra `Usuario o PIN incorrecto`.
7. Si Auth pasa, se busca un worker activo con el mismo `username`.
8. Si no existe worker activo, se cierra sesion y se muestra
   `Trabajador no encontrado`.
9. Si existe worker activo, se guarda en estado global:
   `userId`, `userName`, `userRole`, `isAuthenticated`.
10. Se cargan locales activos y datos maestros.
11. Se redirige a `/(tabs)/ventas`.

## Sesion persistida

En `AuthGate`, al montar la app:

1. Se consulta `supabase.auth.getSession()`.
2. Si hay sesion, se busca el worker por `auth_user_id`.
3. Si existe, se restaura `login(...)`, se cargan locales y datos maestros.
4. Mientras se valida la sesion, se muestra un indicador sobre fondo oscuro.
5. Si la sesion no existe o falla, la app queda sin autenticar.

## Redireccion raiz

`app/index.tsx` aplica:

- Si `isAuthenticated` es falso, redirige a `/login`.
- Si `isAuthenticated` es verdadero, redirige a `/(tabs)/ventas`.

## Seleccion de local

`useAppStore.loadStores()`:

- Carga locales activos desde `stores`.
- Para `ADMIN`, el local por defecto es el centro de produccion si existe.
- Para `COLABORADOR`, el local por defecto es el primer local que no sea centro
  de produccion si existe.
- Si ya existe `selectedStoreId`, lo conserva.
- Si los locales ya fueron cargados y hay local seleccionado, no vuelve a pedirlos.

## Navegacion por tabs

La navegacion principal exige `isAuthenticated`.

Tabs visibles para todos los usuarios autenticados:

- Ventas.
- Inventario.

Tabs visibles solo para `ADMIN`:

- Contabilidad.
- Cartera.
- RRHH.
- Dashboard.

## Datos maestros

`useMasterDataStore` carga y cachea:

- Insumos.
- Productos.
- Trabajadores.

Tambien expone helpers para resolver nombres:

- `getSupplyName(id)`.
- `getWorkerName(id)`.
- `getProductName(id)`.

## Logout esperado

`useAppStore.logout()` limpia:

- `userId`
- `userName`
- `userRole` a `COLABORADOR`
- `isAuthenticated`
- `selectedStoreId`

El servicio de Auth tambien debe hacer `supabase.auth.signOut()`.

## Validaciones y errores

- El boton de login queda deshabilitado si falta usuario, el PIN tiene menos de
  6 digitos o hay carga en curso.
- Los errores de autenticacion se muestran en la misma pantalla.
- Una sesion invalida no rompe el render; la app queda sin autenticar.

## Escenarios de prueba

- Login exitoso de admin redirige a ventas y muestra tabs de backoffice.
- Login exitoso de colaborador redirige a ventas y oculta tabs admin.
- Usuario/PIN incorrecto no autentica.
- Worker inactivo o inexistente cierra sesion despues de Auth.
- Refresco de navegador con sesion activa restaura usuario, local y datos.
- Refresco sin sesion activa envia a `/login`.
