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

  async create(supply: Omit<Supply, 'id'>): Promise<Supply> {
    const { data, error } = await supabase
      .from('supplies')
      .insert({
        name: supply.name,
        unit: supply.unit,
        grams_per_bag: supply.gramsPerBag,
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as SupplyRow);
  }

  async update(id: string, updates: Partial<Omit<Supply, 'id'>>): Promise<Supply> {
    const row: Record<string, unknown> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.unit !== undefined) row.unit = updates.unit;
    if (updates.gramsPerBag !== undefined) row.grams_per_bag = updates.gramsPerBag;

    const { data, error } = await supabase
      .from('supplies')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as SupplyRow);
  }
}
