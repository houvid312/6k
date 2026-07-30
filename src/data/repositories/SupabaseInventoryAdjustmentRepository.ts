import { supabase } from '../../lib/supabase';
import { InventoryAdjustment } from '../../domain/entities';
import { InventoryLevel } from '../../domain/enums';
import { IInventoryAdjustmentRepository } from '../../domain/interfaces/repositories';

interface Row {
  id: string;
  store_id: string;
  supply_id: string;
  level: string;
  previous_quantity_grams: number;
  new_quantity_grams: number;
  difference_grams: number;
  reason: string;
  user_id: string | null;
  created_at: string;
}

function toEntity(row: Row): InventoryAdjustment {
  return {
    id: row.id,
    storeId: row.store_id,
    supplyId: row.supply_id,
    level: (row.level as any) as InventoryLevel,
    previousQuantityGrams: Number(row.previous_quantity_grams ?? 0),
    newQuantityGrams: Number(row.new_quantity_grams ?? 0),
    differenceGrams: Number(row.difference_grams ?? 0),
    reason: row.reason,
    userId: row.user_id ?? undefined,
    createdAt: row.created_at,
  };
}

export class SupabaseInventoryAdjustmentRepository implements IInventoryAdjustmentRepository {
  async create(adjustment: Omit<InventoryAdjustment, 'id' | 'createdAt'>): Promise<InventoryAdjustment> {
    const { data, error } = await supabase
      .from('inventory_adjustments')
      .insert({
        store_id: adjustment.storeId,
        supply_id: adjustment.supplyId,
        level: String(adjustment.level),
        previous_quantity_grams: adjustment.previousQuantityGrams,
        new_quantity_grams: adjustment.newQuantityGrams,
        difference_grams: adjustment.differenceGrams,
        reason: adjustment.reason,
        user_id: adjustment.userId,
      })
      .select()
      .single();

    if (error) throw error;
    return toEntity(data as Row);
  }

  async getByStore(storeId: string, limit = 50): Promise<InventoryAdjustment[]> {
    const { data, error } = await supabase
      .from('inventory_adjustments')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as Row[]).map(toEntity);
  }
}
