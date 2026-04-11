import { supabase } from '../../lib/supabase';
import { Product, ProductCategory } from '../../domain/entities';
import { IProductRepository } from '../../domain/interfaces/repositories';

interface ProductRow {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
  has_recipe: boolean;
}

function toEntity(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ProductCategory,
    isActive: row.is_active,
    hasRecipe: row.has_recipe ?? false,
  };
}

export class SupabaseProductRepository implements IProductRepository {
  async getAll(): Promise<Product[]> {
    const { data, error } = await supabase.from('products').select('*');
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

  async create(data: { name: string; category: ProductCategory; hasRecipe: boolean }): Promise<Product> {
    const { data: row, error } = await supabase
      .from('products')
      .insert({ name: data.name, category: data.category, has_recipe: data.hasRecipe })
      .select()
      .single();
    if (error) throw error;
    return toEntity(row as ProductRow);
  }

  async update(
    id: string,
    updates: Partial<Pick<Product, 'name' | 'category' | 'hasRecipe' | 'isActive'>>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.hasRecipe !== undefined) row.has_recipe = updates.hasRecipe;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { error } = await supabase.from('products').update(row).eq('id', id);
    if (error) throw error;
  }
}
