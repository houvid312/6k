import { supabase } from '../../lib/supabase';
import { CashAuditEntry } from '../../domain/entities';
import { ICashAuditRepository } from '../../domain/interfaces/repositories';

interface CashAuditRow {
  id: string;
  store_id: string;
  date: string;
  opening_base: number;
  cash_sales: number;
  cash_expenses: number;
  theoretical_total: number;
  actual_total: number;
  discrepancy: number;
  notes: string | null;
  bills_100k: number;
  bills_50k: number;
  bills_20k: number;
  bills_10k: number;
  bills_5k: number;
  bills_2k: number;
  coins: number;
  bank_total: number;
  created_at: string | null;
  updated_at: string | null;
}

function toEntity(row: CashAuditRow): CashAuditEntry {
  return {
    id: row.id,
    storeId: row.store_id,
    date: row.date,
    openingBase: row.opening_base,
    cashSales: row.cash_sales,
    cashExpenses: row.cash_expenses,
    theoreticalTotal: row.theoretical_total,
    actualTotal: row.actual_total,
    discrepancy: row.discrepancy,
    notes: row.notes ?? '',
    bills100k: row.bills_100k ?? 0,
    bills50k: row.bills_50k ?? 0,
    bills20k: row.bills_20k ?? 0,
    bills10k: row.bills_10k ?? 0,
    bills5k: row.bills_5k ?? 0,
    bills2k: row.bills_2k ?? 0,
    coins: row.coins ?? 0,
    bankTotal: row.bank_total ?? 0,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function toRow(entry: Omit<CashAuditEntry, 'id' | 'createdAt' | 'updatedAt'>): Record<string, unknown> {
  return {
    store_id: entry.storeId,
    date: entry.date,
    opening_base: entry.openingBase,
    cash_sales: entry.cashSales,
    cash_expenses: entry.cashExpenses,
    theoretical_total: entry.theoreticalTotal,
    actual_total: entry.actualTotal,
    discrepancy: entry.discrepancy,
    notes: entry.notes,
    bills_100k: entry.bills100k,
    bills_50k: entry.bills50k,
    bills_20k: entry.bills20k,
    bills_10k: entry.bills10k,
    bills_5k: entry.bills5k,
    bills_2k: entry.bills2k,
    coins: entry.coins,
    bank_total: entry.bankTotal,
  };
}

export class SupabaseCashAuditRepository implements ICashAuditRepository {
  async getByDate(storeId: string, date: string): Promise<CashAuditEntry | null> {
    const { data, error } = await supabase
      .from('cash_audit_entries')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toEntity(data as CashAuditRow);
  }

  async getByDateRange(storeId: string, from: string, to: string): Promise<CashAuditEntry[]> {
    const { data, error } = await supabase
      .from('cash_audit_entries')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as CashAuditRow[]).map(toEntity);
  }

  async upsert(entry: Omit<CashAuditEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<CashAuditEntry> {
    const { data, error } = await supabase
      .from('cash_audit_entries')
      .upsert(toRow(entry), { onConflict: 'store_id,date' })
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CashAuditRow);
  }
}
