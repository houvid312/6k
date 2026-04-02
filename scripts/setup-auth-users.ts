/**
 * Script para crear usuarios de auth en Supabase y vincularlos a workers.
 *
 * Ejecutar UNA SOLA VEZ:
 *   npx tsx scripts/setup-auth-users.ts
 *
 * Prerequisito: En Supabase Dashboard > Authentication > Providers > Email
 *   - Desactivar "Confirm email"
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xtgllllvmiomdhojqbru.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Z2xsbGx2bWlvbWRob2pxYnJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDc1MTgsImV4cCI6MjA5MDcyMzUxOH0.7oj2Mr-nD6rjcbKGs6v5Zwxs9g4Ak8sLu80-b6zzNf4';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WORKERS = [
  { username: 'carlos', pin: '123456', workerId: '00000000-0000-0000-0004-000000000001' },
  { username: 'maria', pin: '567890', workerId: '00000000-0000-0000-0004-000000000002' },
  { username: 'juan', pin: '111111', workerId: '00000000-0000-0000-0004-000000000003' },
  { username: 'ana', pin: '222222', workerId: '00000000-0000-0000-0004-000000000004' },
  { username: 'pedro', pin: '333333', workerId: '00000000-0000-0000-0004-000000000005' },
  { username: 'laura', pin: '444444', workerId: '00000000-0000-0000-0004-000000000006' },
  { username: 'david', pin: '600000', workerId: '00000000-0000-0000-0004-000000000007' },
  { username: 'esteban', pin: '600100', workerId: '00000000-0000-0000-0004-000000000008' },
];

async function main() {
  console.log('Creando usuarios de auth en Supabase...\n');

  for (const w of WORKERS) {
    const email = `${w.username}@6kpizza.app`;

    // 1. Registrar usuario
    const { data, error } = await supabase.auth.signUp({
      email,
      password: w.pin,
      options: {
        data: { username: w.username },
      },
    });

    if (error) {
      console.log(`  ✗ ${w.username}: ${error.message}`);
      continue;
    }

    if (!data.user) {
      console.log(`  ✗ ${w.username}: No se creo el usuario`);
      continue;
    }

    // 2. Vincular auth_user_id al worker
    const { error: updateError } = await supabase
      .from('workers')
      .update({ auth_user_id: data.user.id })
      .eq('id', w.workerId);

    if (updateError) {
      console.log(`  ⚠ ${w.username}: Auth creado pero no se vinculo al worker: ${updateError.message}`);
    } else {
      console.log(`  ✓ ${w.username} (${email}) -> worker vinculado`);
    }

    // Sign out para no quedar logueado como este usuario
    await supabase.auth.signOut();
  }

  console.log('\n¡Listo! Usuarios creados.');
}

main().catch(console.error);
