import { supabase } from '../../lib/supabase';
import { Attendance } from '../../domain/entities';
import { IAttendanceRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface AttendanceRow {
  id: string;
  date: string;
  worker_id: string;
  store_id: string;
  schedule_id: string | null;
  scheduled_hours: number;
  actual_hours: number;
  hourly_rate: number;
  subtotal: number;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  is_unplanned: boolean;
  source: string;
  status: string;
}

// --- Mappers ---

function toEntity(row: AttendanceRow): Attendance {
  return {
    id: row.id,
    date: row.date,
    workerId: row.worker_id,
    storeId: row.store_id,
    scheduleId: row.schedule_id ?? undefined,
    scheduledHours: row.scheduled_hours,
    actualHours: row.actual_hours,
    hourlyRate: row.hourly_rate,
    subtotal: row.subtotal,
    checkIn: row.check_in ?? undefined,
    checkOut: row.check_out ?? undefined,
    notes: row.notes ?? undefined,
    isUnplanned: row.is_unplanned,
    source: row.source as Attendance['source'],
    status: row.status as Attendance['status'],
  };
}

function toRow(attendance: Omit<Attendance, 'id'>): Record<string, unknown> {
  return {
    date: attendance.date,
    worker_id: attendance.workerId,
    store_id: attendance.storeId,
    schedule_id: attendance.scheduleId ?? null,
    scheduled_hours: attendance.scheduledHours,
    actual_hours: attendance.actualHours,
    hourly_rate: attendance.hourlyRate,
    subtotal: attendance.subtotal,
    check_in: attendance.checkIn ?? null,
    check_out: attendance.checkOut ?? null,
    notes: attendance.notes ?? null,
    is_unplanned: attendance.isUnplanned,
    source: attendance.source,
    status: attendance.status,
  };
}

// --- Repository ---

export class SupabaseAttendanceRepository implements IAttendanceRepository {
  async getByDate(storeId: string, date: string): Promise<Attendance[]> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date)
      .order('check_in', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return (data as AttendanceRow[]).map(toEntity);
  }

  async getByStoreDateRange(storeId: string, from: string, to: string): Promise<Attendance[]> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });
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

  async update(id: string, attendance: Partial<Omit<Attendance, 'id'>>): Promise<Attendance> {
    const row: Record<string, unknown> = {};
    if (attendance.date !== undefined) row.date = attendance.date;
    if (attendance.workerId !== undefined) row.worker_id = attendance.workerId;
    if (attendance.storeId !== undefined) row.store_id = attendance.storeId;
    if (attendance.scheduleId !== undefined) row.schedule_id = attendance.scheduleId ?? null;
    if (attendance.scheduledHours !== undefined) row.scheduled_hours = attendance.scheduledHours;
    if (attendance.actualHours !== undefined) row.actual_hours = attendance.actualHours;
    if (attendance.hourlyRate !== undefined) row.hourly_rate = attendance.hourlyRate;
    if (attendance.subtotal !== undefined) row.subtotal = attendance.subtotal;
    if (attendance.checkIn !== undefined) row.check_in = attendance.checkIn ?? null;
    if (attendance.checkOut !== undefined) row.check_out = attendance.checkOut ?? null;
    if (attendance.notes !== undefined) row.notes = attendance.notes ?? null;
    if (attendance.isUnplanned !== undefined) row.is_unplanned = attendance.isUnplanned;
    if (attendance.source !== undefined) row.source = attendance.source;
    if (attendance.status !== undefined) row.status = attendance.status;

    const { data, error } = await supabase
      .from('attendance')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as AttendanceRow);
  }
}
