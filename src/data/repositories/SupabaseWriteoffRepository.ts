import { supabase } from '../../lib/supabase';
import { InventoryWriteoff } from '../../domain/entities/InventoryWriteoff';
import { IWriteoffRepository } from '../../domain/interfaces/repositories/IWriteoffRepository';
import { InventoryLevel } from '../../domain/enums/InventoryLevel';
import { WriteoffStatus } from '../../domain/enums/WriteoffStatus';
import { WriteoffReason } from '../../domain/enums/WriteoffReason';

const LEVEL_TO_DB: Record<InventoryLevel, string> = {
  [InventoryLevel.RAW]: 'RAW',
  [InventoryLevel.PROCESSED]: 'PROCESSED',
  [InventoryLevel.STORE]: 'STORE',
};

const DB_TO_LEVEL: Record<string, InventoryLevel> = {
  RAW: InventoryLevel.RAW,
  PROCESSED: InventoryLevel.PROCESSED,
  STORE: InventoryLevel.STORE,
};

interface WriteoffRow {
  id: string;
  store_id: string;
  supply_id: string;
  level: string;
  quantity_grams: number;
  reason: string;
  notes: string;
  status: string;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function toEntity(row: WriteoffRow): InventoryWriteoff {
  return {
    id: row.id,
    storeId: row.store_id,
    supplyId: row.supply_id,
    level: DB_TO_LEVEL[row.level] ?? InventoryLevel.STORE,
    quantityGrams: Number(row.quantity_grams),
    reason: row.reason as WriteoffReason,
    notes: row.notes,
    status: row.status as WriteoffStatus,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export class SupabaseWriteoffRepository implements IWriteoffRepository {
  async create(
    writeoff: Omit<InventoryWriteoff, 'id' | 'reviewedBy' | 'reviewedAt' | 'createdAt'>,
  ): Promise<InventoryWriteoff> {
    const { data, error } = await supabase
      .from('inventory_writeoffs')
      .insert({
        store_id: writeoff.storeId,
        supply_id: writeoff.supplyId,
        level: LEVEL_TO_DB[writeoff.level],
        quantity_grams: writeoff.quantityGrams,
        reason: writeoff.reason,
        notes: writeoff.notes,
        status: writeoff.status,
        requested_by: writeoff.requestedBy,
      })
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as WriteoffRow);
  }

  async getByStore(storeId: string): Promise<InventoryWriteoff[]> {
    const { data, error } = await supabase
      .from('inventory_writeoffs')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as WriteoffRow[]).map(toEntity);
  }

  async getAll(): Promise<InventoryWriteoff[]> {
    const { data, error } = await supabase
      .from('inventory_writeoffs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as WriteoffRow[]).map(toEntity);
  }

  async getPending(): Promise<InventoryWriteoff[]> {
    const { data, error } = await supabase
      .from('inventory_writeoffs')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as WriteoffRow[]).map(toEntity);
  }

  async getPendingByStore(storeId: string): Promise<InventoryWriteoff[]> {
    const { data, error } = await supabase
      .from('inventory_writeoffs')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as WriteoffRow[]).map(toEntity);
  }

  async updateStatus(
    id: string,
    status: WriteoffStatus,
    reviewedBy: string,
  ): Promise<InventoryWriteoff> {
    const { data, error } = await supabase
      .from('inventory_writeoffs')
      .update({
        status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as WriteoffRow);
  }

  async getApprovedByStoreAndDateRange(
    storeId: string,
    startDate: string,
    endDate: string,
  ): Promise<InventoryWriteoff[]> {
    const { data, error } = await supabase
      .from('inventory_writeoffs')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'APPROVED')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`);
    if (error) throw error;
    return (data as WriteoffRow[]).map(toEntity);
  }
}
