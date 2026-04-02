import { supabase } from '../../lib/supabase';
import { Worker } from '../../domain/entities';
import { IWorkerRepository } from '../../domain/interfaces/repositories';
import { WorkerRole } from '../../domain/enums';

// --- Row type ---

interface WorkerRow {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  is_active: boolean;
  phone: string | null;
  pin: string | null;
}

// --- Mappers ---

function toEntity(row: WorkerRow): Worker {
  return {
    id: row.id,
    name: row.name,
    role: row.role as WorkerRole,
    hourlyRate: row.hourly_rate,
    isActive: row.is_active,
    phone: row.phone ?? undefined,
    pin: row.pin ?? undefined,
  };
}

function toRow(worker: Omit<Worker, 'id'>): Record<string, unknown> {
  return {
    name: worker.name,
    role: worker.role,
    hourly_rate: worker.hourlyRate,
    is_active: worker.isActive,
    phone: worker.phone ?? null,
    pin: worker.pin ?? null,
  };
}

// --- Repository ---

export class SupabaseWorkerRepository implements IWorkerRepository {
  async getAll(): Promise<Worker[]> {
    const { data, error } = await supabase
      .from('workers')
      .select('*');
    if (error) throw error;
    return (data as WorkerRow[]).map(toEntity);
  }

  async getById(id: string): Promise<Worker | null> {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as WorkerRow);
  }

  async getByRole(role: WorkerRole): Promise<Worker[]> {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('role', role);
    if (error) throw error;
    return (data as WorkerRow[]).map(toEntity);
  }

  async create(worker: Omit<Worker, 'id'>): Promise<Worker> {
    const { data, error } = await supabase
      .from('workers')
      .insert(toRow(worker))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as WorkerRow);
  }
}
