import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

async function run() {
  console.log('Fetching paid payroll periods...');
  const { data: periods, error } = await supabase
    .from('payroll_periods')
    .select('*')
    .eq('status', 'PAGADA');

  if (error) throw error;
  if (!periods || periods.length === 0) {
    console.log('No paid payrolls found.');
    return;
  }

  const periodId = periods[0].id;
  console.log(`Found paid payroll: ${periodId}. Looking for credit_payments...`);

  const { data: payments, error: payError } = await supabase
    .from('credit_payments')
    .select('*')
    .eq('payroll_period_id', periodId);

  if (payError) throw payError;

  if (payments && payments.length > 0) {
    console.log(`Found ${payments.length} credit payments linked to this payroll. Restoring balances...`);
    
    for (const payment of payments) {
      // 1. Fetch current credit entry
      const { data: credit, error: cErr } = await supabase
        .from('credit_entries')
        .select('*')
        .eq('id', payment.credit_entry_id)
        .single();
        
      if (cErr) throw cErr;
      
      // 2. Restore balance
      const newBalance = credit.balance + payment.amount;
      console.log(`Restoring credit ${credit.id}: balance ${credit.balance} -> ${newBalance}`);
      
      const { error: updErr } = await supabase
        .from('credit_entries')
        .update({
          balance: newBalance,
          is_paid: false,
          paid_date: null
        })
        .eq('id', credit.id);
        
      if (updErr) throw updErr;
      
      // 3. Delete payment
      const { error: delPayErr } = await supabase
        .from('credit_payments')
        .delete()
        .eq('id', payment.id);
        
      if (delPayErr) throw delPayErr;
    }
  } else {
    console.log('No credit payments found for this payroll.');
  }

  console.log(`Deleting payroll period ${periodId}...`);
  // payroll_entries are deleted by ON DELETE CASCADE if configured, or we must delete them manually.
  await supabase.from('payroll_entries').delete().eq('period_id', periodId);
  const { error: delPerErr } = await supabase.from('payroll_periods').delete().eq('id', periodId);
  
  if (delPerErr) throw delPerErr;
  
  console.log('Payroll and associated payments deleted successfully!');
}

run().catch(console.error);
