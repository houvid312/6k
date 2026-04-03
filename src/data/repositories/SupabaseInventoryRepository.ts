import { supabase } from '../../lib/supabase';
import { InventoryItem } from '../../domain/entities';
import { IInventoryRepository } from '../../domain/interfaces/repositories';
import { InventoryLevel } from '../../domain/enums';

// DB enum string <-> TS enum number mapping
const LEVEL_TO_DB: Record<InventoryLevel, string> = {
  [InventoryLevel.RAW]: 'RAW',
  [InventoryLevel.PROCESSED]: 'PROCESSED',
  [InventoryLevel.STORE]: 'STORE',
};

const DB_TO_LEVEL: Record<string, InventoryLevel> = {
  RAW: InventoryLevel.RAW,
  PROCESSED: InventoryLevel.PROCESSED,
  STORE: InventoryLevel.STORE,
};

interface InventoryRow {
  id: string;
  supply_id: string;
  store_id: string;
  level: string;
  quantity_grams: number;
  last_updated: string;
}

function toEntity(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    supplyId: row.supply_id,
    storeId: row.store_id,
    level: DB_TO_LEVEL[row.level] ?? InventoryLevel.STORE,
    quantityGrams: row.quantity_grams,
    lastUpdated: row.last_updated,
  };
}

export class SupabaseInventoryRepository implements IInventoryRepository {
  async getAll(): Promise<InventoryItem[]> {
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) throw error;
    return (data as InventoryRow[]).map(toEntity);
  }

  async getByStore(storeId: string, level: InventoryLevel): Promise<InventoryItem[]> {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('store_id', storeId)
      .eq('level', LEVEL_TO_DB[level]);
    if (error) throw error;
    return (data as InventoryRow[]).map(toEntity);
  }

  async getBySupply(
    supplyId: string,
    storeId: string,
    level: InventoryLevel,
  ): Promise<InventoryItem | null> {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('supply_id', supplyId)
      .eq('store_id', storeId)
      .eq('level', LEVEL_TO_DB[level])
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as InventoryRow);
  }

  async deductGrams(storeId: string, supplyId: string, grams: number, level: InventoryLevel = InventoryLevel.RAW): Promise<InventoryItem> {
    const current = await this.getBySupply(supplyId, storeId, level);

    if (!current) {
      // Create inventory record with negative balance (deduction without prior stock)
      const { data, error } = await supabase
        .from('inventory')
        .insert({
          store_id: storeId,
          supply_id: supplyId,
          level: LEVEL_TO_DB[level],
          quantity_grams: -grams,
          last_updated: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return toEntity(data as InventoryRow);
    }

    const { data, error } = await supabase
      .from('inventory')
      .update({
        quantity_grams: current.quantityGrams - grams,
        last_updated: new Date().toISOString(),
      })
      .eq('id', current.id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as InventoryRow);
  }

  async addGrams(storeId: string, supplyId: string, grams: number, level: InventoryLevel): Promise<InventoryItem> {
    const existing = await this.getBySupply(supplyId, storeId, level);

    if (existing) {
      const { data, error } = await supabase
        .from('inventory')
        .update({
          quantity_grams: existing.quantityGrams + grams,
          last_updated: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return toEntity(data as InventoryRow);
    }

    const { data, error } = await supabase
      .from('inventory')
      .insert({
        store_id: storeId,
        supply_id: supplyId,
        level: LEVEL_TO_DB[level],
        quantity_grams: grams,
        last_updated: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as InventoryRow);
  }

  async setQuantity(storeId: string, supplyId: string, level: InventoryLevel, grams: number): Promise<InventoryItem> {
    const existing = await this.getBySupply(supplyId, storeId, level);

    if (existing) {
      const { data, error } = await supabase
        .from('inventory')
        .update({
          quantity_grams: grams,
          last_updated: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return toEntity(data as InventoryRow);
    }

    const { data, error } = await supabase
      .from('inventory')
      .insert({
        store_id: storeId,
        supply_id: supplyId,
        level: LEVEL_TO_DB[level],
        quantity_grams: grams,
        last_updated: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as InventoryRow);
  }
}
