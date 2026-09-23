-- 097_pnl_cogs_fix.sql

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
  v_is_prod boolean;
  v_net_sales numeric := 0;
  v_internal_transfer_income numeric := 0;
  
  v_cogs_sales numeric := 0;
  v_cogs_transfers_out numeric := 0;
  v_cogs_total numeric := 0;
  
  v_gross_profit numeric := 0;
  v_fixed_expenses numeric := 0;
  v_variable_expenses numeric := 0;
  v_payroll_advances numeric := 0;
  v_operational_profit numeric := 0;
BEGIN
  SELECT is_production_center INTO v_is_prod FROM stores WHERE id = p_store_id;

  IF v_is_prod THEN
    -- CP Revenue: Total of APPROVED transfers SENT to stores
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_internal_transfer_income
    FROM store_transfers
    WHERE origin_store_id = p_store_id
      AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
      AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date
      AND status = 'APPROVED';
      
    v_net_sales := v_internal_transfer_income;

    -- CP COGS: Cost of APPROVED transfers SENT to stores
    SELECT COALESCE(SUM(total_price_cop), 0)
    INTO v_cogs_transfers_out
    FROM store_transfers
    WHERE origin_store_id = p_store_id
      AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
      AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date
      AND status = 'APPROVED';
      
    v_cogs_total := v_cogs_transfers_out;
  ELSE
    -- Store Revenue: Total of APPROVED closings
    SELECT COALESCE(SUM(expected_total), 0)
    INTO v_net_sales
    FROM cash_closings
    WHERE store_id = p_store_id
      AND date >= p_start_date
      AND date <= p_end_date
      AND status IN ('APPROVED', 'CONFIRMED');

    -- Store COGS: Sum of total_cost_cop from sales
    SELECT COALESCE(SUM(total_cost_cop), 0)
    INTO v_cogs_sales
    FROM sales
    WHERE store_id = p_store_id
      AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
      AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date;
      
    v_cogs_total := v_cogs_sales;
  END IF;

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
    'grossProfit', v_gross_profit,
    'fixedExpenses', v_fixed_expenses,
    'variableExpenses', v_variable_expenses,
    'payrollAdvances', v_payroll_advances,
    'operationalProfit', v_operational_profit
  );
END;
$$;
