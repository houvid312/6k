const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectExpenses() {
  console.log('--- Inspecting Expenses for Aug 5, 6, 7 ---');
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching expenses:', error);
    return;
  }

  console.log('Expenses:', JSON.stringify(expenses, null, 2));
}

inspectExpenses();
