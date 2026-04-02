-- ============================================================
-- 6K PIZZA - Crear usuarios reales en Supabase Auth
-- Email: {username}@6kpizza.app | Password: PIN del worker
-- ============================================================

-- Primero eliminar las policies anon (ya no las necesitamos)
DROP POLICY IF EXISTS "Anon read stores" ON stores;
DROP POLICY IF EXISTS "Anon read products" ON products;
DROP POLICY IF EXISTS "Anon read supplies" ON supplies;
DROP POLICY IF EXISTS "Anon read recipes" ON recipes;
DROP POLICY IF EXISTS "Anon read recipe_ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Anon read product_prices" ON product_prices;
DROP POLICY IF EXISTS "Anon read inventory" ON inventory;
DROP POLICY IF EXISTS "Anon read workers" ON workers;
DROP POLICY IF EXISTS "Anon read sales" ON sales;
DROP POLICY IF EXISTS "Anon read sale_items" ON sale_items;
DROP POLICY IF EXISTS "Anon read cash_closings" ON cash_closings;
DROP POLICY IF EXISTS "Anon read transfers" ON transfers;
DROP POLICY IF EXISTS "Anon read transfer_items" ON transfer_items;
DROP POLICY IF EXISTS "Anon read physical_counts" ON physical_counts;
DROP POLICY IF EXISTS "Anon read physical_count_items" ON physical_count_items;
DROP POLICY IF EXISTS "Anon read validations" ON validations;
DROP POLICY IF EXISTS "Anon read expenses" ON expenses;
DROP POLICY IF EXISTS "Anon read credit_entries" ON credit_entries;
DROP POLICY IF EXISTS "Anon read schedules" ON schedules;
DROP POLICY IF EXISTS "Anon read attendance" ON attendance;
DROP POLICY IF EXISTS "Anon read payroll_entries" ON payroll_entries;
DROP POLICY IF EXISTS "Anon insert sales" ON sales;
DROP POLICY IF EXISTS "Anon insert sale_items" ON sale_items;
DROP POLICY IF EXISTS "Anon insert cash_closings" ON cash_closings;
DROP POLICY IF EXISTS "Anon manage inventory" ON inventory;
DROP POLICY IF EXISTS "Anon insert purchases" ON purchases;
DROP POLICY IF EXISTS "Anon manage transfers" ON transfers;
DROP POLICY IF EXISTS "Anon manage transfer_items" ON transfer_items;
DROP POLICY IF EXISTS "Anon manage physical_counts" ON physical_counts;
DROP POLICY IF EXISTS "Anon manage physical_count_items" ON physical_count_items;
DROP POLICY IF EXISTS "Anon manage validations" ON validations;
DROP POLICY IF EXISTS "Anon manage expenses" ON expenses;
DROP POLICY IF EXISTS "Anon manage credit_entries" ON credit_entries;
DROP POLICY IF EXISTS "Anon manage schedules" ON schedules;
DROP POLICY IF EXISTS "Anon manage attendance" ON attendance;
DROP POLICY IF EXISTS "Anon manage payroll_entries" ON payroll_entries;
DROP POLICY IF EXISTS "Anon manage workers" ON workers;

-- ============================================================
-- Crear auth users y vincular a workers
-- ============================================================

DO $$
DECLARE
  w RECORD;
  new_auth_id UUID;
  user_email TEXT;
BEGIN
  FOR w IN SELECT id, username, pin FROM workers WHERE auth_user_id IS NULL
  LOOP
    user_email := w.username || '@6kpizza.app';
    new_auth_id := gen_random_uuid();

    -- Crear usuario en auth.users
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
      confirmation_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_auth_id,
      'authenticated',
      'authenticated',
      user_email,
      crypt(w.pin, gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username', w.username),
      false,
      ''
    );

    -- Crear identity para el usuario
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

    -- Vincular auth user al worker
    UPDATE workers SET auth_user_id = new_auth_id WHERE id = w.id;

    RAISE NOTICE 'Created auth user % for worker %', user_email, w.username;
  END LOOP;
END $$;
