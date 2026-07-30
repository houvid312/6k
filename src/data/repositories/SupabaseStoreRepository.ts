import { supabase } from '../../lib/supabase';
import { Store } from '../../domain/entities';
import { IStoreRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface StoreRow {
  id: string;
  name: string;
  is_production_center: boolean;
  address: string | null;
  is_active: boolean;
}

// --- Mappers ---

function toEntity(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    isProductionCenter: row.is_production_center,
    address: row.address ?? undefined,
    isActive: row.is_active,
  };
}

// --- Repository ---

export class SupabaseStoreRepository implements IStoreRepository {
  async getAll(): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data as StoreRow[]).map(toEntity);
  }

  async getAllIncludeInactive(): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data as StoreRow[]).map(toEntity);
  }

  async getById(id: string): Promise<Store | null> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as StoreRow);
  }

  async getProductionCenter(): Promise<Store | null> {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_production_center', true)
      .limit(1)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as StoreRow);
  }

  async create(store: Omit<Store, 'id'>): Promise<Store> {
    const { data, error } = await supabase
      .from('stores')
      .insert({
        name: store.name,
        address: store.address ?? null,
        is_production_center: store.isProductionCenter,
        is_active: store.isActive !== false,
      })
      .select()
      .single();

    if (error) throw error;
    return toEntity(data as StoreRow);
  }

  async update(id: string, store: Partial<Store>): Promise<Store> {
    const updateData: Record<string, any> = {};
    if (store.name !== undefined) updateData.name = store.name;
    if (store.address !== undefined) updateData.address = store.address;
    if (store.isProductionCenter !== undefined) updateData.is_production_center = store.isProductionCenter;
    if (store.isActive !== undefined) updateData.is_active = store.isActive;

    const { data, error } = await supabase
      .from('stores')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return toEntity(data as StoreRow);
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('stores')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) throw error;
  }
}
