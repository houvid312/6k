-- Migration 072: Security Hardening - Eliminar funciones obsoletas y restringir permisos anon
BEGIN;

-- 1. Eliminar funcion obsoleta de autenticacion (la app usa Supabase Auth nativo)
DROP FUNCTION IF EXISTS public.authenticate_worker(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.authenticate_worker(character varying, character varying) CASCADE;

-- 2. Eliminar funcion obsoleta de depuracion RLS
DROP FUNCTION IF EXISTS public.debug_rls_check(UUID) CASCADE;

-- 3. Revocar permisos publicos / anon de replace_pending_sale_order
REVOKE EXECUTE ON FUNCTION public.replace_pending_sale_order FROM anon, public;
GRANT EXECUTE ON FUNCTION public.replace_pending_sale_order TO authenticated, service_role;

-- 4. Revocar ejecucion anon de funciones de validacion y triggers internos (Higiene)
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN (
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN (
            'is_accounting_period_locked',
            'raise_locked_period_error',
            'prevent_locked_accounting_mutation_sales',
            'prevent_locked_accounting_mutation_sale_items',
            'prevent_locked_accounting_mutation_purchases',
            'prevent_locked_accounting_mutation_expenses',
            'prevent_locked_accounting_mutation_incomes',
            'prevent_locked_accounting_mutation_transfers',
            'prevent_locked_accounting_mutation_payroll',
            'prevent_locked_accounting_mutation_credits',
            'prevent_locked_accounting_mutation_debts',
            'prevent_locked_accounting_mutation_waste',
            'prevent_locked_accounting_mutation_production'
          )
    ) LOOP
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || f.func_signature || ' FROM anon, public;';
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || f.func_signature || ' TO authenticated, service_role;';
    END LOOP;
END $$;

COMMIT;
