const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findAndUpdate5k() {
  console.log('--- Searching for $5,000 expense ---');
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('amount', 5000)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  console.log('Expenses with amount 5000:', JSON.stringify(data, null, 2));

  if (data && data.length > 0) {
    const target = data[0];
    console.log(`Updating expense ID ${target.id} (${target.description}) from date ${target.date} to 2026-08-06...`);
    const { data: updated, error: updateError } = await supabase
      .from('expenses')
      .update({ date: '2026-08-06' })
      .eq('id', target.id)
      .select();

    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('Successfully updated:', JSON.stringify(updated, null, 2));
    }
  } else {
    console.log('No expense with amount 5000 found. Checking purchases table...');
    const { data: purchases } = await supabase
      .from('purchases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    console.log('Purchases:', JSON.stringify(purchases, null, 2));
  }
}

findAndUpdate5k();
