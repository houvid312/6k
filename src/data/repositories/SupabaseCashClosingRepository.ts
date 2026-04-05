import { supabase } from '../../lib/supabase';
import { CashClosing, DenominationCount } from '../../domain/entities';
import { ICashClosingRepository } from '../../domain/interfaces/repositories';
import { ClosingStatus } from '../../domain/enums';

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
  status: string;
  confirmed_by_worker_id: string | null;
  approved_by_worker_id: string | null;
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
    status: row.status as ClosingStatus,
    confirmedByWorkerId: row.confirmed_by_worker_id ?? undefined,
    approvedByWorkerId: row.approved_by_worker_id ?? undefined,
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
    status: closing.status,
    confirmed_by_worker_id: closing.confirmedByWorkerId ?? null,
    approved_by_worker_id: closing.approvedByWorkerId ?? null,
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

  async update(id: string, data: Partial<Omit<CashClosing, 'id'>>): Promise<CashClosing> {
    const updateRow: Record<string, unknown> = {};

    if (data.denominations) {
      updateRow.bills_100k = data.denominations.bills100k;
      updateRow.bills_50k = data.denominations.bills50k;
      updateRow.bills_20k = data.denominations.bills20k;
      updateRow.bills_10k = data.denominations.bills10k;
      updateRow.bills_5k = data.denominations.bills5k;
      updateRow.bills_2k = data.denominations.bills2k;
      updateRow.coins = data.denominations.coins;
    }
    if (data.bankTotal !== undefined) updateRow.bank_total = data.bankTotal;
    if (data.expectedTotal !== undefined) updateRow.expected_total = data.expectedTotal;
    if (data.actualTotal !== undefined) updateRow.actual_total = data.actualTotal;
    if (data.discrepancy !== undefined) updateRow.discrepancy = data.discrepancy;
    if (data.expenses !== undefined) updateRow.expenses = data.expenses;
    if (data.status !== undefined) updateRow.status = data.status;
    if (data.confirmedByWorkerId !== undefined) updateRow.confirmed_by_worker_id = data.confirmedByWorkerId;
    if (data.approvedByWorkerId !== undefined) updateRow.approved_by_worker_id = data.approvedByWorkerId;

    const { data: result, error } = await supabase
      .from('cash_closings')
      .update(updateRow)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(result as CashClosingRow);
  }

  async updateStatus(id: string, status: ClosingStatus, workerId?: string): Promise<CashClosing> {
    const updateData: Record<string, unknown> = { status };

    if (status === ClosingStatus.CONFIRMED && workerId) {
      updateData.confirmed_by_worker_id = workerId;
    } else if (status === ClosingStatus.APPROVED && workerId) {
      updateData.approved_by_worker_id = workerId;
    }

    const { data, error } = await supabase
      .from('cash_closings')
      .update(updateData)
      .eq('id', id)
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
