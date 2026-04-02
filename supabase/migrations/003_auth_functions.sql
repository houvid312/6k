-- ============================================================
-- 6K PIZZA - Auth helper functions
-- Permite login por nombre+PIN sin requerir Supabase Auth
-- (login directo contra tabla workers)
-- ============================================================

-- Función pública para autenticar worker por nombre y PIN
-- Se llama desde la app con supabase.rpc('authenticate_worker', {worker_name, worker_pin})
CREATE OR REPLACE FUNCTION public.authenticate_worker(worker_name TEXT, worker_pin TEXT)
RETURNS JSON AS $$
DECLARE
  found_worker RECORD;
BEGIN
  SELECT id, name, role, user_role, hourly_rate, phone
  INTO found_worker
  FROM workers
  WHERE LOWER(name) = LOWER(worker_name)
    AND pin = worker_pin
    AND is_active = true
  LIMIT 1;

  IF found_worker IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Nombre o PIN incorrecto');
  END IF;

  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', found_worker.id,
      'name', found_worker.name,
      'role', found_worker.user_role,
      'worker_role', found_worker.role,
      'hourly_rate', found_worker.hourly_rate,
      'phone', found_worker.phone
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permitir que la función sea llamada por usuarios anónimos (para login)
GRANT EXECUTE ON FUNCTION public.authenticate_worker(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.authenticate_worker(TEXT, TEXT) TO authenticated;
