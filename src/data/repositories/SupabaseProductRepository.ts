import { supabase } from '../../lib/supabase';
import { Product, ProductCategory } from '../../domain/entities';
import { IProductRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface ProductRow {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
}

// --- Mappers ---

function toEntity(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ProductCategory,
    isActive: row.is_active,
  };
}

// --- Repository ---

export class SupabaseProductRepository implements IProductRepository {
  async getAll(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*');
    if (error) throw error;
    return (data as ProductRow[]).map(toEntity);
  }

  async getById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as ProductRow);
  }

  async getByCategory(category: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('category', category);
    if (error) throw error;
    return (data as ProductRow[]).map(toEntity);
  }
}
