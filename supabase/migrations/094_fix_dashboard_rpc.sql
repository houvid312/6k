-- 094_fix_dashboard_rpc.sql

-- Drop the old one
DROP FUNCTION IF EXISTS get_dashboard_metrics;

-- 1. RPC for Dashboard Metrics
CREATE OR REPLACE FUNCTION get_dashboard_metrics(
  p_store_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_units numeric := 0;
  v_total_pesos numeric := 0;
  v_days_count integer;
  v_daily_avg_units numeric := 0;
  v_daily_avg_pesos numeric := 0;
  v_pizza_distribution json;
  v_beverage_distribution json;
  v_other_distribution json;
BEGIN
  -- Calculate totals
  SELECT COALESCE(SUM(total_portions), 0), COALESCE(SUM(total_amount), 0)
  INTO v_total_units, v_total_pesos
  FROM sales
  WHERE store_id = p_store_id
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date;

  -- Calculate daily averages
  v_days_count := (p_end_date - p_start_date) + 1;
  IF v_days_count > 0 THEN
    v_daily_avg_units := v_total_units / v_days_count;
    v_daily_avg_pesos := v_total_pesos / v_days_count;
  END IF;

  -- Calculate flavor distribution by category
  WITH item_data AS (
    SELECT
      UPPER(COALESCE(p.name, i.format_name, 'DESCONOCIDO')) as product_name,
      CASE 
        WHEN p.category = 'BEBIDA' OR UPPER(p.name) LIKE '%GASEOSA%' OR UPPER(p.name) LIKE '%JUGO%' OR UPPER(p.name) LIKE '%AGUA%' THEN 'BEBIDAS'
        WHEN UPPER(p.name) LIKE '%CAJA%' OR UPPER(p.name) LIKE '%EMPAQUE%' OR UPPER(p.name) LIKE '%BOLSA%' OR UPPER(p.name) LIKE '%ADICION%' THEN 'ADICIONES_EMPAQUES'
        ELSE 'PIZZAS'
      END as category_group,
      COALESCE(i.portions, i.quantity, 1) as qty,
      i.subtotal as pesos
    FROM sales s
    JOIN sale_items i ON s.id = i.sale_id
    LEFT JOIN products p ON i.product_id = p.id
    WHERE s.store_id = p_store_id
      AND date(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
      AND date(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date
  ),
  grouped_items AS (
    SELECT
      product_name,
      category_group,
      SUM(qty) as total_qty,
      SUM(pesos) as total_pesos
    FROM item_data
    GROUP BY product_name, category_group
  )
  SELECT 
    (SELECT json_object_agg(product_name, json_build_object('units', total_qty, 'pesos', total_pesos)) FROM grouped_items WHERE category_group = 'PIZZAS'),
    (SELECT json_object_agg(product_name, json_build_object('units', total_qty, 'pesos', total_pesos)) FROM grouped_items WHERE category_group = 'BEBIDAS'),
    (SELECT json_object_agg(product_name, json_build_object('units', total_qty, 'pesos', total_pesos)) FROM grouped_items WHERE category_group = 'ADICIONES_EMPAQUES')
  INTO v_pizza_distribution, v_beverage_distribution, v_other_distribution;

  RETURN json_build_object(
    'totalUnits', v_total_units,
    'totalPesos', v_total_pesos,
    'dailyAvgUnits', v_daily_avg_units,
    'dailyAvgPesos', v_daily_avg_pesos,
    'pizzaDistribution', COALESCE(v_pizza_distribution, '{}'::json),
    'beverageDistribution', COALESCE(v_beverage_distribution, '{}'::json),
    'otherDistribution', COALESCE(v_other_distribution, '{}'::json)
  );
END;
$$;
