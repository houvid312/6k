import { supabase } from '../../lib/supabase';
import { CreditEntry, DebtorType } from '../../domain/entities';
import { ICreditRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface CreditEntryRow {
  id: string;
  date: string;
  debtor_name: string;
  debtor_type: string;
  worker_id: string | null;
  concept: string;
  amount: number;
  balance: number;
  is_paid: boolean;
  paid_date: string | null;
}

// --- Mappers ---

function toEntity(row: CreditEntryRow): CreditEntry {
  return {
    id: row.id,
    date: row.date,
    debtorName: row.debtor_name,
    debtorType: row.debtor_type as DebtorType,
    workerId: row.worker_id ?? undefined,
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
    concept: entry.concept,
    amount: entry.amount,
    balance: entry.balance,
    is_paid: entry.isPaid,
    paid_date: entry.paidDate ?? null,
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
    const today = new Date().toISOString().split('T')[0];
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
}
