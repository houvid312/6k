-- 045_worker_auth_integration.sql
-- Integración bidireccional completa para creación y actualización automática de usuarios de autenticación.

-- 1. Limpiar enlaces huérfanos/muertos de auth_user_id (si el UUID de auth no existe en auth.users, ponerlo a NULL)
UPDATE public.workers w
SET auth_user_id = NULL
WHERE auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = w.auth_user_id
  );

-- 2. Limpiar teléfonos vacíos en auth.users (para evitar conflictos de la restricción UNIQUE users_phone_key)
UPDATE auth.users 
SET phone = NULL 
WHERE phone = '';

-- 3. Crear función del trigger con comprobaciones y conversiones a minúsculas
CREATE OR REPLACE FUNCTION public.sync_worker_credentials_to_auth()
RETURNS TRIGGER AS $$
DECLARE
  new_auth_id UUID;
  user_email TEXT;
BEGIN
  -- Si no tiene auth_user_id pero sí tiene username y pin, crear o enlazar el usuario de Auth
  IF (NEW.auth_user_id IS NULL) AND (NEW.username IS NOT NULL) THEN
    user_email := LOWER(NEW.username) || '@6kpizza.app';
    
    -- Verificar si ya existe en auth.users para re-enlazar (en minúsculas)
    SELECT id INTO new_auth_id FROM auth.users WHERE LOWER(email) = LOWER(user_email) LIMIT 1;
    
    IF new_auth_id IS NULL THEN
      new_auth_id := gen_random_uuid();
      
      -- Insertar en auth.users (inicializando columnas opcionales a '' para evitar errores de scan en GoTrue,
      -- pero dejando 'phone' en NULL para respetar su restricción de unicidad users_phone_key)
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change_token_current,
        phone,
        phone_change,
        phone_change_token,
        email_change,
        reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_auth_id,
        'authenticated',
        'authenticated',
        user_email,
        crypt(COALESCE(NEW.pin, '123456'), gen_salt('bf')),
        now(),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('username', NEW.username),
        false,
        '',
        '',
        '',
        '',
        NULL, -- El teléfono DEBE ser NULL en lugar de '' para evitar violaciones de la restricción users_phone_key
        '',
        '',
        '',
        ''
      );

      -- Insertar en auth.identities
      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        new_auth_id,
        new_auth_id,
        user_email,
        jsonb_build_object('sub', new_auth_id::text, 'email', user_email),
        'email',
        now(),
        now(),
        now()
      );
    END IF;
    
    NEW.auth_user_id := new_auth_id;
  END IF;

  -- Si ya tiene auth_user_id, sincronizar cambios en pin o username
  IF NEW.auth_user_id IS NOT NULL THEN
    -- Si el pin cambió, actualizar contraseña en auth.users
    IF (TG_OP = 'UPDATE') AND (OLD.pin IS DISTINCT FROM NEW.pin) THEN
      UPDATE auth.users
      SET encrypted_password = crypt(NEW.pin, gen_salt('bf')),
          updated_at = now()
      WHERE id = NEW.auth_user_id;
    END IF;

    -- Si el username cambió, actualizar email y metadatos en auth.users
    IF (TG_OP = 'UPDATE') AND (OLD.username IS DISTINCT FROM NEW.username) THEN
      user_email := LOWER(NEW.username) || '@6kpizza.app';
      UPDATE auth.users
      SET email = user_email,
          raw_user_meta_data = jsonb_build_object('username', NEW.username),
          updated_at = now()
      WHERE id = NEW.auth_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger para ejecutarse BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_sync_worker_credentials_to_auth ON public.workers;
CREATE TRIGGER trg_sync_worker_credentials_to_auth
  BEFORE INSERT OR UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_worker_credentials_to_auth();

-- Ejecutar un UPDATE de simulación en todos los trabajadores existentes que tengan username pero no auth_user_id
-- Esto ejecutará el trigger BEFORE UPDATE, enlazará las cuentas existentes o creará las que falten.
UPDATE public.workers
SET name = name
WHERE username IS NOT NULL
  AND auth_user_id IS NULL;

-- Asegurar sincronía final de contraseñas de todos los trabajadores existentes con auth.users
UPDATE auth.users u
SET encrypted_password = crypt(w.pin, gen_salt('bf')),
    email = LOWER(w.username) || '@6kpizza.app',
    raw_user_meta_data = jsonb_build_object('username', w.username),
    updated_at = now()
FROM public.workers w
WHERE u.id = w.auth_user_id
  AND w.pin IS NOT NULL
  AND w.username IS NOT NULL;
