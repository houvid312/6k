import { supabase } from '../../lib/supabase';
import { CashClosing, DenominationCount } from '../../domain/entities';
import { ICashClosingRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface CashClosingRow {
  id: string;
  date: string;
  store_id: string;
  bills_100k: number;
  bills_50k: number;
  bills_20k: number;
  bills_10k: number;
  bills_5k: number;
  bills_2k: number;
  coins: number;
  bank_total: number;
  expected_total: number;
  actual_total: number;
  discrepancy: number;
  expenses: number;
}

// --- Mappers ---

function toEntity(row: CashClosingRow): CashClosing {
  return {
    id: row.id,
    date: row.date,
    storeId: row.store_id,
    denominations: {
      bills100k: row.bills_100k,
      bills50k: row.bills_50k,
      bills20k: row.bills_20k,
      bills10k: row.bills_10k,
      bills5k: row.bills_5k,
      bills2k: row.bills_2k,
      coins: row.coins,
    },
    bankTotal: row.bank_total,
    expectedTotal: row.expected_total,
    actualTotal: row.actual_total,
    discrepancy: row.discrepancy,
    expenses: row.expenses,
  };
}

function toRow(closing: Omit<CashClosing, 'id'>): Record<string, unknown> {
  return {
    date: closing.date,
    store_id: closing.storeId,
    bills_100k: closing.denominations.bills100k,
    bills_50k: closing.denominations.bills50k,
    bills_20k: closing.denominations.bills20k,
    bills_10k: closing.denominations.bills10k,
    bills_5k: closing.denominations.bills5k,
    bills_2k: closing.denominations.bills2k,
    coins: closing.denominations.coins,
    bank_total: closing.bankTotal,
    expected_total: closing.expectedTotal,
    actual_total: closing.actualTotal,
    discrepancy: closing.discrepancy,
    expenses: closing.expenses,
  };
}

// --- Repository ---

export class SupabaseCashClosingRepository implements ICashClosingRepository {
  async getByDate(storeId: string, date: string): Promise<CashClosing | null> {
    const { data, error } = await supabase
      .from('cash_closings')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as CashClosingRow);
  }

  async create(closing: Omit<CashClosing, 'id'>): Promise<CashClosing> {
    const { data, error } = await supabase
      .from('cash_closings')
      .insert(toRow(closing))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CashClosingRow);
  }

  async getByDateRange(
    storeId: string,
    from: string,
    to: string,
  ): Promise<CashClosing[]> {
    const { data, error } = await supabase
      .from('cash_closings')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as CashClosingRow[]).map(toEntity);
  }
}
