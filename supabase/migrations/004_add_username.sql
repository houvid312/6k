-- Agregar campo username para login (sin espacios, lowercase)
ALTER TABLE workers ADD COLUMN username TEXT UNIQUE;

-- Poblar usernames basados en los nombres existentes
UPDATE workers SET username = 'carlos' WHERE id = '00000000-0000-0000-0004-000000000001';
UPDATE workers SET username = 'maria' WHERE id = '00000000-0000-0000-0004-000000000002';
UPDATE workers SET username = 'juan' WHERE id = '00000000-0000-0000-0004-000000000003';
UPDATE workers SET username = 'ana' WHERE id = '00000000-0000-0000-0004-000000000004';
UPDATE workers SET username = 'pedro' WHERE id = '00000000-0000-0000-0004-000000000005';
UPDATE workers SET username = 'laura' WHERE id = '00000000-0000-0000-0004-000000000006';
UPDATE workers SET username = 'david' WHERE id = '00000000-0000-0000-0004-000000000007';
UPDATE workers SET username = 'esteban' WHERE id = '00000000-0000-0000-0004-000000000008';

-- Hacer NOT NULL despues de poblar
ALTER TABLE workers ALTER COLUMN username SET NOT NULL;

-- Actualizar funcion de login para usar username en vez de name
CREATE OR REPLACE FUNCTION public.authenticate_worker(worker_name TEXT, worker_pin TEXT)
RETURNS JSON AS $$
DECLARE
  found_worker RECORD;
BEGIN
  SELECT id, name, username, role, user_role, hourly_rate, phone
  INTO found_worker
  FROM workers
  WHERE LOWER(username) = LOWER(worker_name)
    AND pin = worker_pin
    AND is_active = true
  LIMIT 1;

  IF found_worker IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuario o PIN incorrecto');
  END IF;

  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', found_worker.id,
      'name', found_worker.name,
      'username', found_worker.username,
      'role', found_worker.user_role,
      'worker_role', found_worker.role,
      'hourly_rate', found_worker.hourly_rate,
      'phone', found_worker.phone
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
