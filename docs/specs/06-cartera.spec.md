# Cartera y creditos

## Alcance

Cubre:

- `app/(tabs)/cartera/index.tsx`
- `app/(tabs)/cartera/[id].tsx`
- `app/(tabs)/cartera/nuevo.tsx`
- `src/services/CreditService.ts`
- `src/stores/useCreditStore.ts`
- Repositorio Supabase de creditos.

## Acceso

El tab de cartera solo es visible para `ADMIN`.

## Crear credito

Pantalla `nuevo`:

- Requiere nombre del deudor.
- Requiere monto positivo.
- Tipo de deudor:
  - `CLIENTE`
  - `TRABAJADOR`
- Concepto por defecto: `Credito`.
- Fecha: `todayColombia()`.

`CreditService.createCredit`:

- Crea registro con:
  - `amount`.
  - `balance = amount`.
  - `isPaid = false`.

## Listado de cartera

Pantalla principal:

- Carga todos los creditos.
- Filtra activos con `isPaid = false`.
- Agrupa por `debtorName`.
- Suma `balance` por deudor.
- Cuenta creditos por deudor.
- Ordena deudores por saldo descendente.

KPIs:

- Total cartera.
- Numero de deudores.
- Creditos vencidos.
- Creditos con seguimiento esta semana.

## Vencimiento y seguimiento

Credito vencido:

- No pagado.
- Mas de 7 dias desde `date`.

Seguimiento esta semana:

- No pagado.
- Proximo seguimiento cae dentro de 7 dias.
- El seguimiento se calcula en multiples de 7 dias desde la fecha de creacion.

Filtros:

- Todos.
- Vencidos.
- Esta semana.

## Detalle de deudor

Ruta `cartera/[id]`:

- Busca credito por id.
- Carga creditos relacionados por `debtorName`.
- Muestra saldo pendiente total de creditos no pagados.
- Lista historial de creditos.
- Muestra dias pendientes y siguiente seguimiento.

Estados visuales de dias:

- 0 a 7 dias: verde.
- 8 a 14 dias: naranja.
- Mas de 14 dias: rojo.

## Pagos

Pantalla detalle:

- Permite registrar pago si el credito base no esta pagado.
- Requiere monto positivo.

`CreditService.registerPayment`:

- Busca credito.
- Calcula `newBalance = max(0, balance - paymentAmount)`.
- Si `newBalance === 0`, marca pagado.
- Para pago parcial, el servicio actual tambien llama `markAsPaid`.

Brecha actual:

- Los pagos parciales no reducen saldo parcialmente; terminan marcando el credito
  como pagado por limitacion de la interfaz de repositorio. Si se implementa
  pago parcial real, se debe actualizar el servicio, repositorio y este spec.

## Escenarios de prueba

- Crear credito lo muestra agrupado por deudor.
- Credito mayor a 7 dias aparece en filtro vencidos.
- Filtro esta semana muestra creditos con proximo seguimiento cercano.
- Detalle suma solo saldos no pagados.
- Pago total marca credito como pagado.
- Pago parcial actual marca pagado por brecha conocida.
