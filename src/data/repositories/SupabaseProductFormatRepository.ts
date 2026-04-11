import { supabase } from '../../lib/supabase';
import { ProductFormat } from '../../domain/entities/ProductFormat';
import { IProductFormatRepository } from '../../domain/interfaces/repositories/IProductFormatRepository';

interface ProductFormatRow {
  id: string;
  product_id: string;
  name: string;
  portions: number;
  price: number;
  is_active: boolean;
  sort_order: number;
}

function toEntity(row: ProductFormatRow): ProductFormat {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    portions: row.portions,
    price: row.price,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export class SupabaseProductFormatRepository implements IProductFormatRepository {
  async getByProductId(productId: string): Promise<ProductFormat[]> {
    const { data, error } = await supabase
      .from('product_formats')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data as ProductFormatRow[]).map(toEntity);
  }

  async getByProductIds(productIds: string[]): Promise<ProductFormat[]> {
    if (productIds.length === 0) return [];
    const { data, error } = await supabase
      .from('product_formats')
      .select('*')
      .in('product_id', productIds)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data as ProductFormatRow[]).map(toEntity);
  }

  async create(productId: string, data: Omit<ProductFormat, 'id' | 'productId'>): Promise<ProductFormat> {
    const { data: row, error } = await supabase
      .from('product_formats')
      .insert({
        product_id: productId,
        name: data.name,
        portions: data.portions,
        price: data.price,
        is_active: data.isActive,
        sort_order: data.sortOrder,
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(row as ProductFormatRow);
  }

  async update(id: string, updates: Partial<Omit<ProductFormat, 'id' | 'productId'>>): Promise<void> {
    const row: Partial<ProductFormatRow> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.portions !== undefined) row.portions = updates.portions;
    if (updates.price !== undefined) row.price = updates.price;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;

    const { error } = await supabase.from('product_formats').update(row).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('product_formats').delete().eq('id', id);
    if (error) throw error;
  }
}
