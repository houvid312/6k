import { supabase } from '../../lib/supabase';
import { DemandEstimate } from '../../domain/entities';
import { IDemandEstimateRepository } from '../../domain/interfaces/repositories';

interface DemandRow {
  id: string;
  store_id: string;
  product_id: string;
  day_of_week: number;
  estimated_portions: number;
}

function toEntity(row: DemandRow): DemandEstimate {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    dayOfWeek: row.day_of_week,
    estimatedPortions: row.estimated_portions,
  };
}

export class SupabaseDemandEstimateRepository implements IDemandEstimateRepository {
  async getByStoreAndDay(storeId: string, dayOfWeek: number): Promise<DemandEstimate[]> {
    const { data, error } = await supabase
      .from('demand_estimates')
      .select('*')
      .eq('store_id', storeId)
      .eq('day_of_week', dayOfWeek);
    if (error) throw error;
    return (data as DemandRow[]).map(toEntity);
  }

  async getByStore(storeId: string): Promise<DemandEstimate[]> {
    const { data, error } = await supabase
      .from('demand_estimates')
      .select('*')
      .eq('store_id', storeId)
      .order('day_of_week')
      .order('product_id');
    if (error) throw error;
    return (data as DemandRow[]).map(toEntity);
  }

  async upsert(estimates: Omit<DemandEstimate, 'id'>[]): Promise<void> {
    const rows = estimates.map((e) => ({
      store_id: e.storeId,
      product_id: e.productId,
      day_of_week: e.dayOfWeek,
      estimated_portions: e.estimatedPortions,
    }));

    const { error } = await supabase
      .from('demand_estimates')
      .upsert(rows, { onConflict: 'store_id,product_id,day_of_week' });
    if (error) throw error;
  }
}
