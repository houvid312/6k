-- 057_inventory_adjustments.sql
-- Tabla para trazabilidad de ajustes manuales e inicialización de inventario por la gerencia.

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  supply_id UUID NOT NULL REFERENCES public.supplies(id),
  level VARCHAR(20) NOT NULL, -- 'RAW', 'PROCESSED', 'STORE'
  previous_quantity_grams NUMERIC NOT NULL DEFAULT 0,
  new_quantity_grams NUMERIC NOT NULL DEFAULT 0,
  difference_grams NUMERIC NOT NULL DEFAULT 0,
  reason VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read inventory_adjustments"
  ON public.inventory_adjustments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gerente insert inventory_adjustments"
  ON public.inventory_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'GERENTE' OR public.get_user_role() = 'ADMIN_LOCAL');
