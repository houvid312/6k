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
