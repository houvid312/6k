-- Migration 058: Limpieza de datos de prueba para salida a producción 6K Pizza
-- Esta migración borra únicamente los datos transaccionales de prueba (ventas, cartera, nómina, contabilidad, traslados, producciones)
-- Y preserva intacta toda la información maestra: sedes, trabajadores, usuarios, insumos, productos, recetas, adiciones y mínimos de stock.

BEGIN;

-- Desactivar temporalmente restricciones para evitar bloqueos por FK
SET CONSTRAINTS ALL DEFERRED;

-- 1. Módulo de Ventas
TRUNCATE TABLE public.sale_item_additions CASCADE;
TRUNCATE TABLE public.sale_items CASCADE;
TRUNCATE TABLE public.sales CASCADE;
TRUNCATE TABLE public.shift_portions CASCADE;

-- 2. Módulo de Cartera y Créditos
TRUNCATE TABLE public.credit_payments CASCADE;
TRUNCATE TABLE public.credit_entries CASCADE;

-- 3. Módulo de Contabilidad, Caja, Gastos e Ingresos
TRUNCATE TABLE public.expenses CASCADE;
TRUNCATE TABLE public.incomes CASCADE;
TRUNCATE TABLE public.purchases CASCADE;
TRUNCATE TABLE public.cash_closings CASCADE;
TRUNCATE TABLE public.cash_openings CASCADE;
TRUNCATE TABLE public.cash_audit_entries CASCADE;
TRUNCATE TABLE public.closing_checklist_entries CASCADE;
TRUNCATE TABLE public.validations CASCADE;
TRUNCATE TABLE public.accounting_period_locks CASCADE;

-- 4. Módulo de Inventario, Traslados y Producción
TRUNCATE TABLE public.transfer_items CASCADE;
TRUNCATE TABLE public.transfers CASCADE;
TRUNCATE TABLE public.production_record_items CASCADE;
TRUNCATE TABLE public.production_records CASCADE;
TRUNCATE TABLE public.physical_count_items CASCADE;
TRUNCATE TABLE public.physical_counts CASCADE;
TRUNCATE TABLE public.inventory_writeoffs CASCADE;
TRUNCATE TABLE public.inventory_adjustments CASCADE;
TRUNCATE TABLE public.demand_estimates CASCADE;
TRUNCATE TABLE public.daily_alerts CASCADE;

-- 5. Módulo de Talento Humano y Nómina
TRUNCATE TABLE public.payroll_entries CASCADE;
TRUNCATE TABLE public.payroll_periods CASCADE;
TRUNCATE TABLE public.attendance CASCADE;
TRUNCATE TABLE public.schedules CASCADE;

-- 6. Reiniciar balances de stock en inventario a cero (mantiene los insumos registrados listos para conteo)
UPDATE public.inventory
SET quantity_grams = 0,
    bags = 0,
    updated_at = NOW();

COMMIT;
