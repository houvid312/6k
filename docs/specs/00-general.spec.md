# 6K Pizza - Spec general

## Proposito

Estos archivos `.spec.md` describen el comportamiento funcional esperado y el
comportamiento actual observado en el codigo de 6K Pizza. Funcionan como contrato
vivo entre pantallas, servicios, repositorios Supabase y migraciones.

## Regla obligatoria de mantenimiento

Cada vez que se modifique una funcionalidad, tambien se debe revisar y actualizar
el spec relacionado en `docs/specs/`.

Esto aplica a cambios de UI, validaciones, calculos, flujos de estados,
persistencia, permisos, formulas, rutas, side effects, migraciones, servicios,
stores y repositorios. Un cambio funcional no se considera completo si el spec
correspondiente queda desactualizado.

Cuando un PR o commit cambie comportamiento, debe incluir una de estas dos cosas:

- Cambios en uno o mas archivos `docs/specs/*.spec.md`.
- Una justificacion explicita de por que el cambio no altera comportamiento
  funcional observable.

## Principios funcionales del proyecto

- La app es una SPA Expo Web con rutas por archivo en `app/`.
- El usuario se autentica con Supabase Auth usando `username + PIN`, donde el
  email real se construye como `<username>@6kpizza.app`.
- La identidad operativa sale de `workers`, no directamente del usuario Auth.
- El rol `ADMIN` habilita backoffice completo; `COLABORADOR` ve solo flujos
  operativos limitados.
- El local seleccionado en `useAppStore.selectedStoreId` define el contexto de
  ventas, inventario, cierres, contabilidad y reportes.
- Las fechas operativas de "hoy" deben usar `todayColombia()` desde
  `src/utils/dates.ts`.
- Los valores monetarios se expresan en COP y se muestran con `formatCOP()`.
- El inventario se maneja por niveles: `RAW`, `PROCESSED`, `STORE`.
- Las entidades TypeScript usan `camelCase`; Supabase usa `snake_case`; los
  repositorios son responsables del mapeo.
- Los servicios reciben repositorios por inyeccion de dependencias desde
  `src/di/container.ts`.
- Las pantallas consumen dependencias via `useDI()`.

## Indice de specs

- `01-auth-navigation.spec.md`: sesion, roles, seleccion de local y navegacion.
- `02-ventas-caja.spec.md`: ventas, carrito, pagos, pendientes, apertura,
  cierre de caja, historial y consumo por ventas.
- `03-inventario-operacion.spec.md`: inventario operativo, compras, produccion,
  traslados, conteo fisico, alertas, demanda y bajas.
- `04-catalogos-recetas.spec.md`: productos, formatos, disponibilidad por sede,
  insumos, recetas de venta y recetas de produccion.
- `05-contabilidad.spec.md`: ingresos, egresos, gastos, bancos, cierres
  mensuales y balances.
- `06-cartera.spec.md`: creditos, seguimiento, deudores y pagos.
- `07-rrhh.spec.md`: trabajadores, horarios, asistencia, nomina y reportes.
- `08-dashboard-analitica.spec.md`: KPIs, food cost, tendencias, margenes y
  punto de equilibrio.
- `09-supabase-datos.spec.md`: persistencia, RLS, triggers/RPCs y contratos de
  repositorios.

## Definicion de "funcionalidad"

Una funcionalidad incluye cualquier comportamiento que un usuario pueda observar
o que afecte datos persistidos, por ejemplo:

- Una ruta o pantalla nueva.
- Una regla de validacion.
- Un calculo de totales, porciones, costos, balances o discrepancias.
- Un cambio de estado como `PENDING -> IN_TRANSIT -> RECEIVED`.
- Un cambio de permisos o visibilidad por rol.
- Una nueva tabla, columna, enum, trigger, policy o RPC.
- Un side effect como descontar inventario, crear alertas o cargar asistencia.
- Un cambio en como se filtran, ordenan o agrupan registros.

## Criterios de calidad para specs

Cada spec funcional debe documentar:

- Alcance y rutas/pantallas cubiertas.
- Actores y permisos.
- Datos principales involucrados.
- Flujo feliz.
- Validaciones y errores.
- Side effects persistidos.
- Casos borde conocidos.
- Brechas actuales si el codigo tiene comportamiento incompleto.
- Escenarios minimos de prueba manual o automatizada.

## Convencion de brechas

Las brechas documentadas no son tareas automaticamente aceptadas como
funcionalidad deseada. Son diferencias observadas entre intencion aparente,
nombre de pantalla o UI y comportamiento persistido actual. Si se corrigen, el
spec debe pasar de "brecha actual" a comportamiento esperado.
