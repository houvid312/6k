-- Migration 073: Asegurar que todas las tablas del esquema public tengan RLS habilitado
BEGIN;

-- 1. Habilitar RLS explicitamente en las 5 tablas señaladas por Supabase
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

-- 2. Asegurar RLS en todas las tablas del esquema public
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(tbl.tablename) || ' ENABLE ROW LEVEL SECURITY;';
  END LOOP;
END $$;

COMMIT;
