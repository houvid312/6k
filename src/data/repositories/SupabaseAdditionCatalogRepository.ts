import { supabase } from '../../lib/supabase';
import { AdditionCatalogItem } from '../../domain/entities/Addition';
import { IAdditionCatalogRepository } from '../../domain/interfaces/repositories/IAdditionCatalogRepository';

interface AdditionCatalogRow {
  id: string;
  supply_id: string;
  format_id: string;
  name: string;
  price: number;
  grams: number;
  is_active: boolean;
  sort_order: number;
}

function toEntity(row: AdditionCatalogRow): AdditionCatalogItem {
  return {
    id: row.id,
    supplyId: row.supply_id,
    formatId: row.format_id,
    name: row.name,
    price: row.price,
    grams: row.grams,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export class SupabaseAdditionCatalogRepository implements IAdditionCatalogRepository {
  async getByFormatId(formatId: string): Promise<AdditionCatalogItem[]> {
    const { data, error } = await supabase
      .from('addition_catalog')
      .select('*')
      .eq('format_id', formatId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data as AdditionCatalogRow[]).map(toEntity);
  }

  async getByFormatIds(formatIds: string[]): Promise<AdditionCatalogItem[]> {
    if (formatIds.length === 0) return [];
    const { data, error } = await supabase
      .from('addition_catalog')
      .select('*')
      .in('format_id', formatIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data as AdditionCatalogRow[]).map(toEntity);
  }

  async create(item: Omit<AdditionCatalogItem, 'id'>): Promise<AdditionCatalogItem> {
    const { data, error } = await supabase
      .from('addition_catalog')
      .insert({
        supply_id: item.supplyId,
        format_id: item.formatId,
        name: item.name,
        price: item.price,
        grams: item.grams,
        is_active: item.isActive,
        sort_order: item.sortOrder,
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as AdditionCatalogRow);
  }

  async update(id: string, updates: Partial<Omit<AdditionCatalogItem, 'id'>>): Promise<void> {
    const row: Partial<AdditionCatalogRow> = {};
    if (updates.supplyId !== undefined) row.supply_id = updates.supplyId;
    if (updates.formatId !== undefined) row.format_id = updates.formatId;
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.price !== undefined) row.price = updates.price;
    if (updates.grams !== undefined) row.grams = updates.grams;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;

    const { error } = await supabase.from('addition_catalog').update(row).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('addition_catalog').delete().eq('id', id);
    if (error) throw error;
  }
}
