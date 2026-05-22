import { supabase } from '../../lib/supabase';
import { CreditEntry, CreditPayment, DebtorType } from '../../domain/entities';
import { ICreditRepository } from '../../domain/interfaces/repositories';
import { todayColombia } from '../../utils/dates';

// --- Row type ---

interface CreditEntryRow {
  id: string;
  date: string;
  debtor_name: string;
  debtor_type: string;
  worker_id: string | null;
  store_id: string | null;
  transfer_id: string | null;
  concept: string;
  amount: number;
  balance: number;
  is_paid: boolean;
  paid_date: string | null;
}

interface CreditPaymentRow {
  id: string;
  credit_entry_id: string;
  worker_id: string | null;
  store_id: string | null;
  payroll_period_id: string | null;
  payroll_entry_id: string | null;
  amount: number;
  date: string;
  source: string;
  notes: string | null;
  created_at: string;
}

// --- Mappers ---

function toEntity(row: CreditEntryRow): CreditEntry {
  return {
    id: row.id,
    date: row.date,
    debtorName: row.debtor_name,
    debtorType: row.debtor_type as DebtorType,
    workerId: row.worker_id ?? undefined,
    storeId: row.store_id ?? undefined,
    transferId: row.transfer_id ?? undefined,
    concept: row.concept,
    amount: row.amount,
    balance: row.balance,
    isPaid: row.is_paid,
    paidDate: row.paid_date ?? undefined,
  };
}

function toRow(entry: Omit<CreditEntry, 'id'>): Record<string, unknown> {
  return {
    date: entry.date,
    debtor_name: entry.debtorName,
    debtor_type: entry.debtorType,
    worker_id: entry.workerId ?? null,
    store_id: entry.storeId ?? null,
    transfer_id: entry.transferId ?? null,
    concept: entry.concept,
    amount: entry.amount,
    balance: entry.balance,
    is_paid: entry.isPaid,
    paid_date: entry.paidDate ?? null,
  };
}

function paymentToEntity(row: CreditPaymentRow): CreditPayment {
  return {
    id: row.id,
    creditEntryId: row.credit_entry_id,
    workerId: row.worker_id ?? undefined,
    storeId: row.store_id ?? undefined,
    payrollPeriodId: row.payroll_period_id ?? undefined,
    payrollEntryId: row.payroll_entry_id ?? undefined,
    amount: row.amount,
    date: row.date,
    source: row.source as CreditPayment['source'],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

// --- Repository ---

export class SupabaseCreditRepository implements ICreditRepository {
  async getAll(): Promise<CreditEntry[]> {
    const { data, error } = await supabase
      .from('credit_entries')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as CreditEntryRow[]).map(toEntity);
  }

  async getByDebtor(debtorName: string): Promise<CreditEntry[]> {
    const { data, error } = await supabase
      .from('credit_entries')
      .select('*')
      .eq('debtor_name', debtorName)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as CreditEntryRow[]).map(toEntity);
  }

  async create(entry: Omit<CreditEntry, 'id'>): Promise<CreditEntry> {
    const { data, error } = await supabase
      .from('credit_entries')
      .insert(toRow(entry))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CreditEntryRow);
  }

  async markAsPaid(id: string): Promise<CreditEntry> {
    const today = todayColombia();
    const { data, error } = await supabase
      .from('credit_entries')
      .update({
        is_paid: true,
        balance: 0,
        paid_date: today,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CreditEntryRow);
  }

  async updateBalance(id: string, balance: number): Promise<CreditEntry> {
    const { data, error } = await supabase
      .from('credit_entries')
      .update({
        balance,
        is_paid: balance <= 0,
        paid_date: balance <= 0 ? todayColombia() : null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CreditEntryRow);
  }

  async getActiveByWorker(workerId: string): Promise<CreditEntry[]> {
    const { data, error } = await supabase
      .from('credit_entries')
      .select('*')
      .eq('worker_id', workerId)
      .eq('is_paid', false)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as CreditEntryRow[]).map(toEntity);
  }

  async applyPayment(input: Omit<CreditPayment, 'id' | 'createdAt'>): Promise<CreditPayment> {
    const { data: creditRow, error: creditError } = await supabase
      .from('credit_entries')
      .select('*')
      .eq('id', input.creditEntryId)
      .single();
    if (creditError) throw creditError;

    const credit = toEntity(creditRow as CreditEntryRow);
    const amount = Math.min(input.amount, credit.balance);
    if (amount <= 0) {
      throw new Error('El abono debe ser mayor a cero');
    }

    const { data, error } = await supabase
      .from('credit_payments')
      .insert({
        credit_entry_id: input.creditEntryId,
        worker_id: input.workerId ?? credit.workerId ?? null,
        store_id: input.storeId ?? null,
        payroll_period_id: input.payrollPeriodId ?? null,
        payroll_entry_id: input.payrollEntryId ?? null,
        amount,
        date: input.date,
        source: input.source,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    await this.updateBalance(input.creditEntryId, Math.max(0, credit.balance - amount));
    return paymentToEntity(data as CreditPaymentRow);
  }

  async getPaymentsByStoreDateRange(storeId: string, from: string, to: string): Promise<CreditPayment[]> {
    const { data, error } = await supabase
      .from('credit_payments')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as CreditPaymentRow[]).map(paymentToEntity);
  }
}
