const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectClosing() {
  const { data: closing, error } = await supabase
    .from('cash_closings')
    .select('*')
    .eq('store_id', '00000000-0000-0000-0000-000000000002')
    .eq('date', '2026-08-06');

  console.log('Cash Closing for Aug 6:', JSON.stringify(closing, null, 2));
}

inspectClosing();
