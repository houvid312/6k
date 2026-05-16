# Recursos humanos

## Alcance

Cubre:

- `app/(tabs)/rrhh/index.tsx`
- `app/(tabs)/rrhh/horarios.tsx`
- `app/(tabs)/rrhh/asistencia.tsx`
- `app/(tabs)/rrhh/nomina.tsx`
- `app/(tabs)/rrhh/reporte.tsx`
- `src/services/PayrollService.ts`
- `src/services/CashClosingService.ts` para carga automatica de asistencia.
- Repositorios de workers, schedules y attendance.

## Acceso

El tab de RRHH solo es visible para `ADMIN`.

## Trabajadores

Pantalla principal:

- Lista trabajadores.
- Muestra rol, estado, tarifa por hora y telefono.
- Permite crear trabajador.
- Permite desactivar trabajador activo.

Crear trabajador:

- Nombre obligatorio.
- PIN exactamente de 6 digitos numericos.
- Tarifa por hora positiva.
- Rol obligatorio.
- Estado inicial activo.

Roles:

- `ADMINISTRADOR`
- `CAJERO`
- `PREPARADOR`
- `HORNERO`
- `ESTIRADOR`
- `COORDINADOR`

Importante:

- Crear worker en esta pantalla no crea usuario Supabase Auth. La regla critica
  del proyecto prohibe insertar usuarios Auth por SQL directo.

## Horarios

Pantalla `horarios`:

- Usa local seleccionado.
- Carga trabajadores y horarios.
- Muestra solo trabajadores activos.
- Tocar una celda abre modal de edicion.
- Permite editar:
  - hora inicio.
  - hora fin.
- Calcula horas como diferencia de la hora entera:
  `parseInt(endHour) - parseInt(startHour)`, minimo 0.
- Guarda con `scheduleRepo.upsert`.

Brecha actual:

- La formula ignora minutos. Por ejemplo `08:30 -> 16:00` calcula 8 horas, no
  7.5.

## Asistencia manual

Pantalla `asistencia`:

- Usa local seleccionado y fecha `todayColombia()`.
- Carga trabajadores activos y horarios.
- Calcula horas programadas para el dia actual.
- Permite ingresar horas trabajadas por trabajador.
- Permite marcar ausente.
- Resumen:
  - presentes.
  - ausentes.
  - con horas extra.

Brecha actual critica:

- `handleSubmit` construye entradas y muestra snackbar, pero no llama
  `attendanceRepo.create` ni `attendanceRepo.upsert`. En el estado actual, la
  asistencia manual no se persiste.

## Carga automatica de asistencia al aprobar cierre

`CashClosingService.approveClosing`:

- Cambia cierre a `APPROVED`.
- Intenta `autoLoadAttendance(storeId, date)`.
- Si falla, la aprobacion no falla.

`autoLoadAttendance`:

- Convierte dia JS a formato del proyecto:
  - JS Domingo 0 pasa a 6.
  - Lunes 1 pasa a 0.
- Lee horarios del local.
- Filtra horarios del dia.
- Lee workers.
- Ignora workers inexistentes o inactivos.
- Hace `attendanceRepo.upsert` con:
  - `scheduledHours = schedule.hours`
  - `actualHours = schedule.hours`
  - `hourlyRate = worker.hourlyRate`
  - `subtotal = hours * hourlyRate`

## Nomina

Pantalla `nomina`:

- Periodos:
  - semanal.
  - quincenal.
  - mensual.
- Calcula rango actual segun fecha local.
- Usa `PayrollService.generateReport`.

`PayrollService.calculatePayroll`:

- Toma workers activos.
- Lee asistencia por trabajador y rango.
- Suma `actualHours`.
- `grossPay = totalHours * hourlyRate`.
- Deducciones iniciales 0.

`applyDeductions`:

- Lee creditos activos por trabajador.
- `deduction = min(totalDebt, grossPay)`.
- `netPay = grossPay - deduction`.

Reporte:

- Total bruto.
- Total deducciones.
- Total neto.
- Detalle por trabajador.

## Reporte diario

Pantalla `reporte`:

- Muestra asistencia rapida por trabajador con estados:
  - presente.
  - tarde.
  - ausente.
- Muestra ventas del dia:
  - total ventas.
  - ticket promedio.
- Permite escribir incidencias.
- Muestra resumen.
- Boton enviar muestra `Alert` de exito.

Brechas actuales:

- El reporte diario no se persiste ni se envia a un backend.
- `dayPortions` se setea internamente pero no se muestra.
- `dayPortions` usa `salesCount` cuando hay ventas, no porciones reales.

## Historico laboral

En `reporte`:

- Permite seleccionar trabajador.
- Carga asistencia de ultimos 30 dias.
- Muestra total horas, total bruto y hasta 10 registros recientes.

## Escenarios de prueba

- Crear trabajador con PIN invalido falla.
- Desactivar trabajador lo marca inactivo y lo oculta de horarios/asistencia.
- Editar horario crea/actualiza schedule.
- Aprobar cierre crea attendance desde horarios.
- Nomina usa attendance persistida y descuenta creditos activos.
- Asistencia manual no persiste hasta resolver brecha documentada.
- Reporte diario solo muestra confirmacion local hasta implementar persistencia.
