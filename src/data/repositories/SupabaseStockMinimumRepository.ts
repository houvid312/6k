import { supabase } from '../../lib/supabase';
import { StockMinimum } from '../../domain/entities/StockMinimum';
import { IStockMinimumRepository } from '../../domain/interfaces/repositories/IStockMinimumRepository';
import { InventoryLevel } from '../../domain/enums';

const LEVEL_MAP: Record<InventoryLevel, string> = {
  [InventoryLevel.RAW]: 'RAW',
  [InventoryLevel.PROCESSED]: 'PROCESSED',
  [InventoryLevel.STORE]: 'STORE',
};

const REVERSE_LEVEL: Record<string, InventoryLevel> = {
  RAW: InventoryLevel.RAW,
  PROCESSED: InventoryLevel.PROCESSED,
  STORE: InventoryLevel.STORE,
};

interface Row {
  id: string;
  supply_id: string;
  store_id: string;
  level: string;
  minimum_grams: number;
}

function toEntity(row: Row): StockMinimum {
  return {
    id: row.id,
    supplyId: row.supply_id,
    storeId: row.store_id,
    level: REVERSE_LEVEL[row.level] ?? InventoryLevel.STORE,
    minimumGrams: Number(row.minimum_grams),
  };
}

export class SupabaseStockMinimumRepository implements IStockMinimumRepository {
  async getByStoreAndLevel(storeId: string, level: InventoryLevel): Promise<StockMinimum[]> {
    const { data, error } = await supabase
      .from('stock_minimums')
      .select('*')
      .eq('store_id', storeId)
      .eq('level', LEVEL_MAP[level]);
    if (error) throw error;
    return (data as Row[]).map(toEntity);
  }

  async upsert(storeId: string, supplyId: string, level: InventoryLevel, minimumGrams: number): Promise<StockMinimum> {
    const { data, error } = await supabase
      .from('stock_minimums')
      .upsert(
        {
          store_id: storeId,
          supply_id: supplyId,
          level: LEVEL_MAP[level],
          minimum_grams: minimumGrams,
        },
        { onConflict: 'supply_id,store_id,level' },
      )
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as Row);
  }
}
