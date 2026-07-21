-- ==================== INGRESOS NO OPERACIONALES ====================

CREATE TABLE public.incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'Otro', -- 'Capital Inicial', 'Capitalización', 'Inversión', 'Otro'
  description TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'EFECTIVO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "incomes_policy" ON public.incomes
  FOR ALL TO authenticated
  USING (public.is_admin_or_assigned_local(store_id))
  WITH CHECK (public.is_admin_or_assigned_local(store_id));

-- Índice
CREATE INDEX idx_incomes_store_date ON public.incomes(store_id, date);
