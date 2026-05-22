import { supabase } from '../../lib/supabase';
import { WorkerStoreAssignment } from '../../domain/entities';
import { IWorkerStoreAssignmentRepository } from '../../domain/interfaces/repositories';

interface WorkerStoreAssignmentRow {
  id: string;
  worker_id: string;
  store_id: string;
  is_primary: boolean;
  created_at: string;
}

function toEntity(row: WorkerStoreAssignmentRow): WorkerStoreAssignment {
  return {
    id: row.id,
    workerId: row.worker_id,
    storeId: row.store_id,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}

export class SupabaseWorkerStoreAssignmentRepository implements IWorkerStoreAssignmentRepository {
  async getAll(): Promise<WorkerStoreAssignment[]> {
    const { data, error } = await supabase
      .from('worker_store_assignments')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as WorkerStoreAssignmentRow[]).map(toEntity);
  }

  async getByWorker(workerId: string): Promise<WorkerStoreAssignment[]> {
    const { data, error } = await supabase
      .from('worker_store_assignments')
      .select('*')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as WorkerStoreAssignmentRow[]).map(toEntity);
  }

  async getByStore(storeId: string): Promise<WorkerStoreAssignment[]> {
    const { data, error } = await supabase
      .from('worker_store_assignments')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as WorkerStoreAssignmentRow[]).map(toEntity);
  }

  async setWorkerStores(workerId: string, storeIds: string[], primaryStoreId?: string): Promise<void> {
    const uniqueStoreIds = Array.from(new Set(storeIds)).filter(Boolean);
    const { error: deleteError } = await supabase
      .from('worker_store_assignments')
      .delete()
      .eq('worker_id', workerId);
    if (deleteError) throw deleteError;

    if (uniqueStoreIds.length === 0) return;

    const primary = primaryStoreId && uniqueStoreIds.includes(primaryStoreId)
      ? primaryStoreId
      : uniqueStoreIds[0];
    const rows = uniqueStoreIds.map((storeId) => ({
      worker_id: workerId,
      store_id: storeId,
      is_primary: storeId === primary,
    }));

    const { error } = await supabase
      .from('worker_store_assignments')
      .insert(rows);
    if (error) throw error;
  }
}
