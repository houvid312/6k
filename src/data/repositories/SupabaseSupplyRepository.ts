import { supabase } from '../../lib/supabase';
import { Supply, SupplyUnit } from '../../domain/entities';
import { ISupplyRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface SupplyRow {
  id: string;
  name: string;
  unit: string;
  grams_per_bag: number;
}

// --- Mappers ---

function toEntity(row: SupplyRow): Supply {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit as SupplyUnit,
    gramsPerBag: row.grams_per_bag,
  };
}

// --- Repository ---

export class SupabaseSupplyRepository implements ISupplyRepository {
  async getAll(): Promise<Supply[]> {
    const { data, error } = await supabase
      .from('supplies')
      .select('*');
    if (error) throw error;
    return (data as SupplyRow[]).map(toEntity);
  }

  async getById(id: string): Promise<Supply | null> {
    const { data, error } = await supabase
      .from('supplies')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as SupplyRow);
  }
}
