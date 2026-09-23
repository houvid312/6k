-- 093_dashboard_and_pnl_rpcs.sql

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
  v_flavor_distribution json;
BEGIN
  -- Validate dates
  IF p_start_date > p_end_date THEN
    RETURN json_build_object('error', 'start_date must be less than or equal to end_date');
  END IF;

  -- Calculate totals
  SELECT COALESCE(SUM(total_items), 0), COALESCE(SUM(total_amount), 0)
  INTO v_total_units, v_total_pesos
  FROM sales
  WHERE store_id = p_store_id
    AND date(timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
    AND date(timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date;

  -- Calculate daily averages
  v_days_count := (p_end_date - p_start_date) + 1;
  IF v_days_count > 0 THEN
    v_daily_avg_units := v_total_units / v_days_count;
    v_daily_avg_pesos := v_total_pesos / v_days_count;
  END IF;

  -- Calculate flavor distribution
  WITH item_flavors AS (
    SELECT
      i.name as flavor_name,
      SUM(i.quantity) as total_qty
    FROM sales s
    JOIN sale_items i ON s.id = i.sale_id
    WHERE s.store_id = p_store_id
      AND date(s.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
      AND date(s.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date
    GROUP BY i.name
  ),
  total_flavor_qty AS (
    SELECT NULLIF(SUM(total_qty), 0) as total FROM item_flavors
  )
  SELECT json_object_agg(
    f.flavor_name,
    json_build_object(
      'total', f.total_qty,
      'percentage', ROUND((f.total_qty::numeric / t.total::numeric) * 100, 2)
    )
  )
  INTO v_flavor_distribution
  FROM item_flavors f, total_flavor_qty t;

  RETURN json_build_object(
    'totalUnits', v_total_units,
    'totalPesos', v_total_pesos,
    'dailyAvgUnits', v_daily_avg_units,
    'dailyAvgPesos', v_daily_avg_pesos,
    'flavorDistribution', COALESCE(v_flavor_distribution, '{}'::json)
  );
END;
$$;

-- 2. RPC for Accounting P&L (Estado de Resultados)
CREATE OR REPLACE FUNCTION get_accounting_pnl(
  p_store_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net_sales numeric := 0;
  v_transfers_cogs numeric := 0;
  v_direct_purchases numeric := 0;
  v_fixed_expenses numeric := 0;
  v_variable_expenses numeric := 0;
  v_payroll_advances numeric := 0;
  v_cogs_total numeric := 0;
  v_gross_profit numeric := 0;
  v_operational_profit numeric := 0;
BEGIN
  -- Net Sales (from approved closings)
  SELECT COALESCE(SUM(expected_total), 0)
  INTO v_net_sales
  FROM cash_closings
  WHERE store_id = p_store_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status IN ('APPROVED', 'CONFIRMED');

  -- COGS from CP Transfers (Approved)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_transfers_cogs
  FROM store_transfers
  WHERE destination_store_id = p_store_id
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date
    AND status = 'APPROVED';

  -- COGS from Direct Purchases
  SELECT COALESCE(SUM(price_cop), 0)
  INTO v_direct_purchases
  FROM purchases
  WHERE store_id = p_store_id
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date;

  v_cogs_total := v_transfers_cogs + v_direct_purchases;
  v_gross_profit := v_net_sales - v_cogs_total;

  -- Expenses
  SELECT 
    COALESCE(SUM(CASE WHEN category = 'Nómina' OR category = 'Arriendo' OR category = 'Servicios Públicos' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category NOT IN ('Nómina', 'Arriendo', 'Servicios Públicos', 'Adelanto', 'Compra Turno') THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN category = 'Adelanto' THEN amount ELSE 0 END), 0)
  INTO v_fixed_expenses, v_variable_expenses, v_payroll_advances
  FROM expenses
  WHERE store_id = p_store_id
    AND date >= p_start_date
    AND date <= p_end_date;

  v_operational_profit := v_gross_profit - v_fixed_expenses - v_variable_expenses;

  RETURN json_build_object(
    'netSales', v_net_sales,
    'cogsTotal', v_cogs_total,
    'cogsTransfers', v_transfers_cogs,
    'cogsDirectPurchases', v_direct_purchases,
    'grossProfit', v_gross_profit,
    'fixedExpenses', v_fixed_expenses,
    'variableExpenses', v_variable_expenses,
    'payrollAdvances', v_payroll_advances,
    'operationalProfit', v_operational_profit
  );
END;
$$;
