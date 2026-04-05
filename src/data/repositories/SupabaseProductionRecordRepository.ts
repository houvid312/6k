import { supabase } from '../../lib/supabase';
import { ProductionRecord, ProductionRecordItem } from '../../domain/entities';
import { IProductionRecordRepository } from '../../domain/interfaces/repositories';

interface RecordRow {
  id: string;
  store_id: string;
  worker_id: string;
  production_recipe_id: string;
  batches: number;
  total_grams_produced: number;
  notes: string;
  created_at: string;
}

interface ItemRow {
  id: string;
  production_record_id: string;
  supply_id: string;
  grams_consumed: number;
}

function toEntity(row: RecordRow, itemRows: ItemRow[]): ProductionRecord {
  return {
    id: row.id,
    storeId: row.store_id,
    workerId: row.worker_id,
    productionRecipeId: row.production_recipe_id,
    batches: row.batches,
    totalGramsProduced: Number(row.total_grams_produced),
    notes: row.notes ?? '',
    timestamp: row.created_at,
    items: itemRows.map((r) => ({
      supplyId: r.supply_id,
      gramsConsumed: Number(r.grams_consumed),
    })),
  };
}

export class SupabaseProductionRecordRepository implements IProductionRecordRepository {
  async create(record: Omit<ProductionRecord, 'id' | 'timestamp'>): Promise<ProductionRecord> {
    const { data: recordRow, error: recordError } = await supabase
      .from('production_records')
      .insert({
        store_id: record.storeId,
        worker_id: record.workerId,
        production_recipe_id: record.productionRecipeId,
        batches: record.batches,
        total_grams_produced: record.totalGramsProduced,
        notes: record.notes,
      })
      .select()
      .single();
    if (recordError) throw recordError;

    const typedRow = recordRow as RecordRow;

    const itemRows = record.items.map((item) => ({
      production_record_id: typedRow.id,
      supply_id: item.supplyId,
      grams_consumed: item.gramsConsumed,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from('production_record_items')
      .insert(itemRows)
      .select();
    if (itemsError) throw itemsError;

    return toEntity(typedRow, insertedItems as ItemRow[]);
  }

  async getByStore(storeId: string): Promise<ProductionRecord[]> {
    const { data: rows, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const records: ProductionRecord[] = [];
    for (const row of rows as RecordRow[]) {
      const { data: items, error: itemsError } = await supabase
        .from('production_record_items')
        .select('*')
        .eq('production_record_id', row.id);
      if (itemsError) throw itemsError;
      records.push(toEntity(row, items as ItemRow[]));
    }
    return records;
  }

  async getByDateRange(storeId: string, from: string, to: string): Promise<ProductionRecord[]> {
    const fromTs = from.includes('T') ? from : `${from}T00:00:00`;
    const toTs = to.includes('T') ? to : `${to}T23:59:59`;

    const { data: rows, error } = await supabase
      .from('production_records')
      .select('*')
      .eq('store_id', storeId)
      .gte('created_at', fromTs)
      .lte('created_at', toTs)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const records: ProductionRecord[] = [];
    for (const row of rows as RecordRow[]) {
      const { data: items, error: itemsError } = await supabase
        .from('production_record_items')
        .select('*')
        .eq('production_record_id', row.id);
      if (itemsError) throw itemsError;
      records.push(toEntity(row, items as ItemRow[]));
    }
    return records;
  }
}
