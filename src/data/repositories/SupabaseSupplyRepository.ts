import { supabase } from '../../lib/supabase';
import { Supply, SupplyUnit } from '../../domain/entities';
import { ISupplyRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface SupplyRow {
  id: string;
  name: string;
  unit: string;
  grams_per_bag: number;
  production_cost_cop?: number | null;
  commercial_price_cop: number | null;
  sale_price_cop: number | null;
  is_billable_to_store: boolean | null;
}

// --- Mappers ---

function toEntity(row: SupplyRow): Supply {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit as SupplyUnit,
    gramsPerBag: row.grams_per_bag,
    productionCostCop: row.production_cost_cop ?? 0,
    commercialPriceCop: row.commercial_price_cop ?? 0,
    salePriceCop: row.sale_price_cop ?? 0,
    isBillableToStore: row.is_billable_to_store ?? true,
  };
}

// --- Repository ---

export class SupabaseSupplyRepository implements ISupplyRepository {
  async getAll(includeProductionCost = false): Promise<Supply[]> {
    const columns = includeProductionCost
      ? '*'
      : 'id,name,unit,grams_per_bag,commercial_price_cop,sale_price_cop,is_billable_to_store';
    const { data, error } = await supabase
      .from('supplies')
      .select(columns);
    if (error) throw error;
    return (data as unknown as SupplyRow[]).map(toEntity);
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
        production_cost_cop: supply.productionCostCop,
        commercial_price_cop: supply.commercialPriceCop,
        sale_price_cop: supply.salePriceCop,
        is_billable_to_store: supply.isBillableToStore,
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
    if (updates.productionCostCop !== undefined) row.production_cost_cop = updates.productionCostCop;
    if (updates.commercialPriceCop !== undefined) row.commercial_price_cop = updates.commercialPriceCop;
    if (updates.salePriceCop !== undefined) row.sale_price_cop = updates.salePriceCop;
    if (updates.isBillableToStore !== undefined) row.is_billable_to_store = updates.isBillableToStore;

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
