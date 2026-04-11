import { supabase } from '../../lib/supabase';
import { IProductStoreAssignmentRepository } from '../../domain/interfaces/repositories/IProductStoreAssignmentRepository';

export class SupabaseProductStoreAssignmentRepository implements IProductStoreAssignmentRepository {
  async getProductIdsByStore(storeId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('product_store_assignments')
      .select('product_id')
      .eq('store_id', storeId)
      .eq('is_active', true);
    if (error) throw error;
    return (data as { product_id: string }[]).map((r) => r.product_id);
  }

  async setActive(productId: string, storeId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('product_store_assignments')
      .upsert({ product_id: productId, store_id: storeId, is_active: isActive }, {
        onConflict: 'product_id,store_id',
      });
    if (error) throw error;
  }

  async bulkAssign(productId: string, storeIds: string[]): Promise<void> {
    if (storeIds.length === 0) return;
    const rows = storeIds.map((storeId) => ({
      product_id: productId,
      store_id: storeId,
      is_active: true,
    }));
    const { error } = await supabase
      .from('product_store_assignments')
      .upsert(rows, { onConflict: 'product_id,store_id' });
    if (error) throw error;
  }

  async getAssignmentsByProduct(productId: string): Promise<Array<{ storeId: string; isActive: boolean }>> {
    const { data, error } = await supabase
      .from('product_store_assignments')
      .select('store_id, is_active')
      .eq('product_id', productId);
    if (error) throw error;
    return (data as { store_id: string; is_active: boolean }[]).map((r) => ({
      storeId: r.store_id,
      isActive: r.is_active,
    }));
  }
}
