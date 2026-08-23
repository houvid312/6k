-- Migration 084: Agregar tiempo y vida util a recetas de produccion y crear tablas de plan semanal
BEGIN;

-- 1. Campos de duracion y vida util en production_recipes
ALTER TABLE public.production_recipes
  ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER DEFAULT 3;

-- 2. Tabla de Planes Semanales de Produccion
CREATE TABLE IF NOT EXISTS public.weekly_production_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'
  total_planned_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota')::timestamptz,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota')::timestamptz,
  UNIQUE(store_id, week_start_date)
);

-- 3. Tabla de Items / Tareas del Plan Semanal
CREATE TABLE IF NOT EXISTS public.weekly_production_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.weekly_production_plans(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.production_recipes(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL, -- 0 (Domingo) a 6 (Sabado) o 1 (Lunes) a 7 (Domingo)
  planned_batches NUMERIC(10, 3) NOT NULL DEFAULT 0,
  planned_bags NUMERIC(10, 3) NOT NULL DEFAULT 0,
  est_minutes INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota')::timestamptz
);

-- Indices para busqueda rapida
CREATE INDEX IF NOT EXISTS idx_weekly_plans_store_week ON public.weekly_production_plans(store_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_plan ON public.weekly_production_plan_items(plan_id);

-- RLS Policies
ALTER TABLE public.weekly_production_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_production_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read weekly_production_plans"
  ON public.weekly_production_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to insert/update weekly_production_plans"
  ON public.weekly_production_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to read weekly_production_plan_items"
  ON public.weekly_production_plan_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to insert/update weekly_production_plan_items"
  ON public.weekly_production_plan_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sembrar tiempos estimados y vida util inicial en recetas conocidas si existen
UPDATE public.production_recipes SET prep_time_minutes = 120, shelf_life_days = 6 WHERE name ILIKE '%Salsa Napolitana%';
UPDATE public.production_recipes SET prep_time_minutes = 60, shelf_life_days = 4 WHERE name ILIKE '%Carne Mexicana%';
UPDATE public.production_recipes SET prep_time_minutes = 45, shelf_life_days = 3 WHERE name ILIKE '%Masa 40 Libras%';
UPDATE public.production_recipes SET prep_time_minutes = 30, shelf_life_days = 3 WHERE name ILIKE '%Estirado Masa%';
UPDATE public.production_recipes SET prep_time_minutes = 40, shelf_life_days = 5 WHERE name ILIKE '%Piña Calada%';
UPDATE public.production_recipes SET prep_time_minutes = 30, shelf_life_days = 4 WHERE name ILIKE '%Pollo%';
UPDATE public.production_recipes SET prep_time_minutes = 35, shelf_life_days = 5 WHERE name ILIKE '%Queso%';
UPDATE public.production_recipes SET prep_time_minutes = 25, shelf_life_days = 5 WHERE name ILIKE '%Jamon%';
UPDATE public.production_recipes SET prep_time_minutes = 25, shelf_life_days = 5 WHERE name ILIKE '%Tocineta%';
UPDATE public.production_recipes SET prep_time_minutes = 20, shelf_life_days = 5 WHERE name ILIKE '%Peperoni%';
UPDATE public.production_recipes SET prep_time_minutes = 20, shelf_life_days = 4 WHERE name ILIKE '%Champinones%';
UPDATE public.production_recipes SET prep_time_minutes = 25, shelf_life_days = 2 WHERE name ILIKE '%Guacamole%';
UPDATE public.production_recipes SET prep_time_minutes = 20, shelf_life_days = 2 WHERE name ILIKE '%Pico de gallo%';
UPDATE public.production_recipes SET prep_time_minutes = 30, shelf_life_days = 5 WHERE name ILIKE '%Salsa Albahaca%';
UPDATE public.production_recipes SET prep_time_minutes = 30, shelf_life_days = 5 WHERE name ILIKE '%Salsa Jalapeño%';
UPDATE public.production_recipes SET prep_time_minutes = 15, shelf_life_days = 4 WHERE name ILIKE '%Cebolla%';
UPDATE public.production_recipes SET prep_time_minutes = 15, shelf_life_days = 4 WHERE name ILIKE '%Tomate%';
UPDATE public.production_recipes SET prep_time_minutes = 15, shelf_life_days = 4 WHERE name ILIKE '%Limon%';
UPDATE public.production_recipes SET prep_time_minutes = 15, shelf_life_days = 3 WHERE name ILIKE '%Cilantro%';
UPDATE public.production_recipes SET prep_time_minutes = 15, shelf_life_days = 3 WHERE name ILIKE '%Albahaca%';

COMMIT;
