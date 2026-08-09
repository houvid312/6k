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

async function checkWorker() {
  const { data: workers, error: wErr } = await supabase
    .from('workers')
    .select('*, worker_store_assignments(store_id)');

  if (wErr) {
    console.error('Error fetching workers:', wErr);
    return;
  }
  console.log('--- ALL WORKERS ---');
  workers.forEach(w => {
    console.log(`ID: ${w.id} | Name: "${w.name}" | username: "${w.username}" | store_id: ${w.store_id} | user_role: ${w.user_role} | is_active: ${w.is_active} | storeIds: ${JSON.stringify(w.worker_store_assignments)}`);
  });
}

checkWorker();
