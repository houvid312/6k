import { supabase } from '../../lib/supabase';
import { Attendance } from '../../domain/entities';
import { IAttendanceRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface AttendanceRow {
  id: string;
  date: string;
  worker_id: string;
  store_id: string;
  scheduled_hours: number;
  actual_hours: number;
  hourly_rate: number;
  subtotal: number;
}

// --- Mappers ---

function toEntity(row: AttendanceRow): Attendance {
  return {
    id: row.id,
    date: row.date,
    workerId: row.worker_id,
    storeId: row.store_id,
    scheduledHours: row.scheduled_hours,
    actualHours: row.actual_hours,
    hourlyRate: row.hourly_rate,
    subtotal: row.subtotal,
  };
}

function toRow(attendance: Omit<Attendance, 'id'>): Record<string, unknown> {
  return {
    date: attendance.date,
    worker_id: attendance.workerId,
    store_id: attendance.storeId,
    scheduled_hours: attendance.scheduledHours,
    actual_hours: attendance.actualHours,
    hourly_rate: attendance.hourlyRate,
    subtotal: attendance.subtotal,
  };
}

// --- Repository ---

export class SupabaseAttendanceRepository implements IAttendanceRepository {
  async getByDate(storeId: string, date: string): Promise<Attendance[]> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date);
    if (error) throw error;
    return (data as AttendanceRow[]).map(toEntity);
  }

  async create(attendance: Omit<Attendance, 'id'>): Promise<Attendance> {
    const { data, error } = await supabase
      .from('attendance')
      .insert(toRow(attendance))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as AttendanceRow);
  }

  async getByWorkerDateRange(
    workerId: string,
    from: string,
    to: string,
  ): Promise<Attendance[]> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('worker_id', workerId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data as AttendanceRow[]).map(toEntity);
  }
}
