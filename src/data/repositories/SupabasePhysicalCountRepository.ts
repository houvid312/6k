import { supabase } from '../../lib/supabase';
import { PhysicalCount, PhysicalCountItem } from '../../domain/entities';
import { IPhysicalCountRepository } from '../../domain/interfaces/repositories/IPhysicalCountRepository';

// --- Row types ---

interface PhysicalCountRow {
  id: string;
  store_id: string;
  created_at: string;
}

interface PhysicalCountItemRow {
  id: string;
  physical_count_id: string;
  supply_id: string;
  bags: number;
  loose_grams: number;
  total_grams: number;
}

// --- Mappers ---

function toEntity(row: PhysicalCountRow, itemRows: PhysicalCountItemRow[]): PhysicalCount {
  return {
    id: row.id,
    storeId: row.store_id,
    timestamp: row.created_at,
    items: itemRows.map(toItemEntity),
  };
}

function toItemEntity(row: PhysicalCountItemRow): PhysicalCountItem {
  return {
    supplyId: row.supply_id,
    bags: row.bags,
    looseGrams: Number(row.loose_grams),
    totalGrams: Number(row.total_grams),
  };
}

// --- Repository ---

export class SupabasePhysicalCountRepository implements IPhysicalCountRepository {
  async create(count: Omit<PhysicalCount, 'id' | 'timestamp'>): Promise<PhysicalCount> {
    const { data: countRow, error: countError } = await supabase
      .from('physical_counts')
      .insert({ store_id: count.storeId })
      .select()
      .single();
    if (countError) throw countError;

    const typedRow = countRow as PhysicalCountRow;

    const itemRows = count.items.map((item) => ({
      physical_count_id: typedRow.id,
      supply_id: item.supplyId,
      bags: item.bags,
      loose_grams: item.looseGrams,
      total_grams: item.totalGrams,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from('physical_count_items')
      .insert(itemRows)
      .select();
    if (itemsError) throw itemsError;

    return toEntity(typedRow, insertedItems as PhysicalCountItemRow[]);
  }

  async getByStore(storeId: string): Promise<PhysicalCount[]> {
    const { data: countRows, error: countError } = await supabase
      .from('physical_counts')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    if (countError) throw countError;

    const counts: PhysicalCount[] = [];
    for (const row of countRows as PhysicalCountRow[]) {
      const { data: itemRows, error: itemsError } = await supabase
        .from('physical_count_items')
        .select('*')
        .eq('physical_count_id', row.id);
      if (itemsError) throw itemsError;
      counts.push(toEntity(row, itemRows as PhysicalCountItemRow[]));
    }

    return counts;
  }

  async getLatest(storeId: string): Promise<PhysicalCount | null> {
    const { data, error } = await supabase
      .from('physical_counts')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    const typedRow = data as PhysicalCountRow;

    const { data: itemRows, error: itemsError } = await supabase
      .from('physical_count_items')
      .select('*')
      .eq('physical_count_id', typedRow.id);
    if (itemsError) throw itemsError;

    return toEntity(typedRow, itemRows as PhysicalCountItemRow[]);
  }
}
