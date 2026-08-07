const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function colombiaDateRangeToUtc(from, to) {
  const fromUtc = new Date(`${from}T00:00:00.000-05:00`).toISOString();
  const toUtc = new Date(`${to}T23:59:59.999-05:00`).toISOString();
  return { fromUtc, toUtc };
}

async function simulateCierreLoad() {
  const storeId = '00000000-0000-0000-0000-000000000002';
  const activeDate = '2026-08-06';

  const cleanFrom = activeDate.slice(0, 10);
  const cleanTo = activeDate.slice(0, 10);
  const { fromUtc, toUtc } = colombiaDateRangeToUtc(cleanFrom, cleanTo);

  console.log(`Querying expenses with fromUtc=${fromUtc}, toUtc=${toUtc}, cleanFrom=${cleanFrom}, cleanTo=${cleanTo}`);

  const { data: dbExpenses, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('store_id', storeId)
    .or(`and(date.gte.${fromUtc},date.lte.${toUtc}),and(date.gte.${cleanFrom},date.lte.${cleanTo})`);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Raw DB Expenses fetched:', dbExpenses.length);
  dbExpenses.forEach(e => console.log(`  - [${e.category}] ${e.description}: $${e.amount} (date=${e.date}, created_at=${e.created_at})`));

  // Now apply filter from SupabaseExpenseRepository.ts
  const filtered = dbExpenses.filter((e) => {
    if (!e.date) return false;
    const datePart = e.date.slice(0, 10);
    return datePart >= cleanFrom && datePart <= cleanTo;
  });

  console.log('\nFiltered Expenses:', filtered.length);
  const cashExpenses = filtered.filter(e => e.payment_method === 'EFECTIVO');
  const totalExpenses = cashExpenses.reduce((sum, e) => sum + e.amount, 0);

  console.log('Total Cash Expenses for closing:', totalExpenses);
}

simulateCierreLoad();
