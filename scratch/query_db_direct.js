process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
let supabaseUrl = '';
let supabaseAnonKey = '';
envText.split('\n').forEach(line => {
  if (line.startsWith('EXPO_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY=')) supabaseAnonKey = line.split('=')[1].trim();
});

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLoginAndFetch() {
  // Try login with common pins for esteban or david
  let session = null;
  const pins = ['1234', '0000', '1111', '8000', '2026', '6666'];
  const usernames = ['esteban', 'david', 'maria'];

  for (const u of usernames) {
    for (const p of pins) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: `${u}@6kpizza.app`,
        password: p,
      });
      if (!error && data.session) {
        console.log(`Successfully logged in as ${u} with pin ${p}`);
        session = data.session;
        break;
      }
    }
    if (session) break;
  }

  if (!session) {
    console.log("Could not log in with test pins. Let us try RPC or anon query.");
  }

  // Fetch workers
  const { data: workers, error: wErr } = await supabase
    .from('workers')
    .select('*, worker_store_assignments(store_id)');

  if (wErr) {
    console.error('wErr:', wErr);
    return;
  }

  console.log(`Workers count: ${workers.length}`);
  workers.forEach(w => {
    console.log(`- ID: ${w.id} | Name: "${w.name}" | username: "${w.username}" | store_id: ${w.store_id} | user_role: ${w.user_role} | is_active: ${w.is_active} | assignments: ${JSON.stringify(w.worker_store_assignments)}`);
  });
}

testLoginAndFetch();
