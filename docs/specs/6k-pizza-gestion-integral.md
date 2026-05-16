# Contexto del Proyecto: App de Gestión Integral y Escalable para Pizzería (6K Pizza)

Actúa como un Desarrollador Full-Stack, Arquitecto de Software y Experto en Bases de Datos. Tu objetivo es diseñar la arquitectura y proponer el stack tecnológico (Base de datos y Front-end) para una aplicación de gestión interna de una pizzería llamada 6K Pizza. 

El negocio vende pizzas estilo New York (masa delgada, sin borde/cornicione inflado). Actualmente opera con un centro de producción y un local, pero el sistema debe ser altamente escalable para soportar múltiples locales operando en simultáneo en el futuro cercano. Aunque actualmente la lógica reside en Google Sheets, tienes total libertad para proponer el sistema de base de datos (SQL, NoSQL, u otro) que resulte más eficiente, rápido y robusto para esta operación.

## Lógica Central del Negocio (Muy Importante)
1. **Unidad Mínima de Venta:** Todo el modelo de negocio, recetas y ventas se calcula con base en la **porción**. 
   * Pizza Familiar = 8 porciones.
   * Pizza Mediana = 4 porciones.
   * Pizza Diamante = 2 porciones.
   * Porciones individuales.
2. **Niveles de Inventario:** La pizzería maneja tres inventarios distintos que deben conectarse:
   * **Inventario 1:** Insumos comprados sin procesar (Materia prima bruta).
   * **Inventario 2:** Insumos procesados en el Centro de Producción (Ej. bolsas de masa de 600g, bolsas de queso de 312g, litros de salsa napolitana).
   * **Inventario 3:** Insumos procesados disponibles en cada Local.

## Requerimientos por Módulos

### 1. Módulo de Ventas y Cierre de Caja
* **Registro Transaccional:** Registro de cada venta (Local, Fecha/Hora, Producto, Tamaño/Porciones, Método de Pago).
* **Trigger de Inventario:** Al vender, el sistema debe descontar del *Inventario 3 (Local)* los gramos exactos de insumos basados en la cantidad de *porciones* vendidas y la tabla de recetas.
* **Cierre Diario y Arqueo:** Submódulo de corte que exija un arqueo de caja físico exhaustivo (conteo de billetes y monedas en COP), registro de transferencias y que cruce el dinero en caja contra el total de transacciones y los gastos de caja menor del local en ese día.

### 2. Módulo de Inventario y Traslados
* **Gestión de los 3 Inventarios:** Flujo desde la compra (Ingreso al Inv. 1), procesamiento (Paso al Inv. 2) y traslado a puntos de venta (Paso al Inv. 3).
* **Gasto Teórico vs. Gasto Real (Auditoría):** * *Teórico:* Calculado automáticamente por las porciones vendidas.
    * *Real:* Conteo físico de existencias (bolsas, gramos, unidades) al cierre del local.
* **Alertas:** Cálculo de diferencias (Teórico - Real) para generar métricas de % de pérdida o % de sobrante por insumo.
* **Automatización de Pedidos (Traslados):** A partir de existencias mínimas necesarias por local según el día de la semana y promedios de demanda, el sistema no autogenera compras a proveedores, sino **una orden de traslado automatizada** de insumos procesados desde el Centro de Producción hacia cada Local.

### 3. Módulo Contable y Flujo de Caja
* **Consolidación General:** Unificación de ingresos (todos los locales) contra egresos globales (nómina, arriendos, servicios, proveedores) y egresos de caja menor.
* **Bancos y Efectivo:** Conciliación de saldos en cuentas bancarias versus el efectivo físico consolidado.

### 4. Módulo de Cartera (Créditos)
* **Gestión de Deudores:** Registro de fiados a clientes con límite de crédito.
* **Anticipos y Préstamos:** Registro de adelantos otorgados a los trabajadores, vinculados a su perfil.

### 5. Módulo de RRHH y Nómina
* **Control de Horarios:** Asignación de turnos semanales por rol (Preparador, Administrador, Cajero, Hornero, Estirador) y ubicación (Centro de Producción o Local X).
* **Registro de Asistencia:** Cálculo de horas laboradas reales vs programadas.
* **Cálculo de Nómina y Deducciones:** Cálculo de pago por horas laboradas multiplicadas por el valor/hora, con aplicación automática de deducciones si el trabajador tiene deudas activas en el Módulo de Cartera.

### 6. Dashboard Interactivo e Informes
* **KPIs:** Ventas de porciones por producto, rentabilidad, costo de insumos (Food Cost).
* **Visualización:** Gráficas de histórico de ventas, desempeño por local, promedios diarios/mensuales. Datos presentados en números enteros para facilitar la lectura.

---

## Estructura Actual de Datos (Para referencia de la lógica matemática)
Para que comprendas la lógica actual que debe ser migrada y optimizada en la nueva base de datos, esta es la estructura simplificada que maneja el negocio hoy:
* **Recetas:** Definidas por producto (Ej. Hawaiana) en gramos por cada unidad de medida. (Masa: 75.2g, Queso: 39.1g, Salsa: 50g, etc.).
* **Conversión de Bolsas:** Los inventarios de local se miden en bolsas y gramos. (1 Bolsa de masa = 600g, 1 Bolsa de Queso = 312g, 1 Bolsa de Salsa = 3000g).
* **Ventas y Demanda:** Se hace tracking diario de "Total Porciones" vendidas por sabor.

## Instrucciones para ti (Claude)
1. **Arquitectura y Stack:** Propón el stack tecnológico más eficiente (Backend, Frontend, Base de Datos) considerando que el sistema debe manejar miles de transacciones, alta concurrencia (múltiples locales operando al tiempo) y cálculos de inventario en tiempo real. Si sugieres No-Code/Low-Code, justifica por qué sería mejor que código a medida.
2. **Modelo Entidad-Relación (ER):** Diseña la estructura de la base de datos necesaria para soportar los 3 niveles de inventario, el manejo de ventas por "porciones" escalables a tamaños (diamante, mediana, familiar) y los múltiples locales.
3. **Lógica de Traslados y Descuentos:** Explica técnicamente cómo programarías el trigger o la lógica del backend para que una venta de una "Pizza Mediana Hawaiana" en el "Local 2" descuente correctamente los gramos del "Inventario 3" de ese local, basándose en la tabla de recetas y la conversión de 4 porciones.
4. **Hoja de Ruta:** Dame los pasos precisos en fases de desarrollo (Fase 1: MVP, Fase 2, etc.) para empezar a codificar o ensamblar esto inmediatamente.