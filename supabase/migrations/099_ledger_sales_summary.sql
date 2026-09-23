-- 099_ledger_sales_summary.sql

CREATE OR REPLACE FUNCTION get_daily_sales_ledger(
  p_store_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS TABLE(
  sales_date date,
  cash_sales numeric,
  bank_sales numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') as sales_date,
    COALESCE(SUM(CASE WHEN payment_method = 'EFECTIVO' THEN total_amount ELSE 0 END), 0)::numeric as cash_sales,
    COALESCE(SUM(CASE WHEN payment_method != 'EFECTIVO' THEN total_amount ELSE 0 END), 0)::numeric as bank_sales
  FROM sales
  WHERE store_id = p_store_id
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') >= p_start_date
    AND date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota') <= p_end_date
  GROUP BY date(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')
  ORDER BY sales_date ASC;
END;
$$;
