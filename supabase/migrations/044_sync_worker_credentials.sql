-- 044_sync_worker_credentials.sql
-- Automatiza la sincronización de PIN (contraseña) y username (email) desde workers hacia auth.users.

CREATE OR REPLACE FUNCTION public.sync_worker_credentials_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el trabajador tiene un auth_user_id vinculado
  IF NEW.auth_user_id IS NOT NULL THEN
    -- Si el pin cambió, actualizar contraseña en auth.users
    IF (OLD.pin IS DISTINCT FROM NEW.pin) THEN
      UPDATE auth.users
      SET encrypted_password = crypt(NEW.pin, gen_salt('bf')),
          updated_at = now()
      WHERE id = NEW.auth_user_id;
    END IF;

    -- Si el username cambió, actualizar email y metadatos en auth.users
    IF (OLD.username IS DISTINCT FROM NEW.username) THEN
      UPDATE auth.users
      SET email = NEW.username || '@6kpizza.app',
          raw_user_meta_data = jsonb_build_object('username', NEW.username),
          updated_at = now()
      WHERE id = NEW.auth_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_worker_credentials_to_auth ON public.workers;
CREATE TRIGGER trg_sync_worker_credentials_to_auth
  AFTER UPDATE OF pin, username ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_worker_credentials_to_auth();

-- Sincronización retrospectiva única para corregir cualquier desfase previo de PINs y usernames
UPDATE auth.users u
SET encrypted_password = crypt(w.pin, gen_salt('bf')),
    email = w.username || '@6kpizza.app',
    raw_user_meta_data = jsonb_build_object('username', w.username),
    updated_at = now()
FROM public.workers w
WHERE u.id = w.auth_user_id
  AND w.pin IS NOT NULL
  AND w.username IS NOT NULL;
