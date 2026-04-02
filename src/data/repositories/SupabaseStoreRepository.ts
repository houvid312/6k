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
      .select('*');
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
}
