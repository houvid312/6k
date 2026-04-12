import { supabase } from '../../lib/supabase';
import { CashOpening } from '../../domain/entities/CashOpening';
import { ICashOpeningRepository } from '../../domain/interfaces/repositories/ICashOpeningRepository';
import { DenominationCount } from '../../domain/entities';

// --- Row type ---

interface CashOpeningRow {
  id: string;
  store_id: string;
  date: string;
  denominations: Record<string, number>;
  total: number;
  opened_by: string | null;
  created_at: string;
}

// --- Mappers ---

function toEntity(row: CashOpeningRow): CashOpening {
  return {
    id: row.id,
    storeId: row.store_id,
    date: row.date,
    denominations: row.denominations as unknown as DenominationCount,
    total: row.total,
    openedBy: row.opened_by ?? undefined,
    createdAt: row.created_at,
  };
}

// --- Repository ---

export class SupabaseCashOpeningRepository implements ICashOpeningRepository {
  async getByDate(storeId: string, date: string): Promise<CashOpening | null> {
    const { data, error } = await supabase
      .from('cash_openings')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toEntity(data as CashOpeningRow);
  }

  async create(opening: Omit<CashOpening, 'id' | 'createdAt'>): Promise<CashOpening> {
    const { data, error } = await supabase
      .from('cash_openings')
      .insert({
        store_id: opening.storeId,
        date: opening.date,
        denominations: opening.denominations,
        total: opening.total,
        opened_by: opening.openedBy ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CashOpeningRow);
  }
}
