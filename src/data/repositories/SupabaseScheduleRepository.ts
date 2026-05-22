import { supabase } from '../../lib/supabase';
import { Schedule } from '../../domain/entities';
import { IScheduleRepository } from '../../domain/interfaces/repositories';

// --- Row type ---

interface ScheduleRow {
  id: string;
  worker_id: string;
  store_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  hours: number;
  notes: string | null;
}

// --- Mappers ---

function toEntity(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    workerId: row.worker_id,
    storeId: row.store_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    hours: row.hours,
    notes: row.notes ?? undefined,
  };
}

function toRow(schedule: Omit<Schedule, 'id'>): Record<string, unknown> {
  return {
    worker_id: schedule.workerId,
    store_id: schedule.storeId,
    day_of_week: schedule.dayOfWeek,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    hours: schedule.hours,
    notes: schedule.notes ?? null,
  };
}

// --- Repository ---

export class SupabaseScheduleRepository implements IScheduleRepository {
  async getByWorker(workerId: string): Promise<Schedule[]> {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('worker_id', workerId)
      .order('day_of_week', { ascending: true });
    if (error) throw error;
    return (data as ScheduleRow[]).map(toEntity);
  }

  async getByStore(storeId: string): Promise<Schedule[]> {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('store_id', storeId)
      .order('day_of_week', { ascending: true });
    if (error) throw error;
    return (data as ScheduleRow[]).map(toEntity);
  }

  async getByStoreAndDay(storeId: string, dayOfWeek: number): Promise<Schedule[]> {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('store_id', storeId)
      .eq('day_of_week', dayOfWeek)
      .order('start_time', { ascending: true });
    if (error) throw error;
    return (data as ScheduleRow[]).map(toEntity);
  }

  async getWeekSchedule(storeId: string, _weekStart: string): Promise<Schedule[]> {
    // Schedules are recurring templates by day_of_week.
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('store_id', storeId)
      .order('day_of_week', { ascending: true });
    if (error) throw error;
    return (data as ScheduleRow[]).map(toEntity);
  }

  async create(schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    const { data, error } = await supabase
      .from('schedules')
      .insert(toRow(schedule))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as ScheduleRow);
  }

  async update(id: string, schedule: Partial<Omit<Schedule, 'id'>>): Promise<Schedule> {
    const row: Record<string, unknown> = {};
    if (schedule.workerId !== undefined) row.worker_id = schedule.workerId;
    if (schedule.storeId !== undefined) row.store_id = schedule.storeId;
    if (schedule.dayOfWeek !== undefined) row.day_of_week = schedule.dayOfWeek;
    if (schedule.startTime !== undefined) row.start_time = schedule.startTime;
    if (schedule.endTime !== undefined) row.end_time = schedule.endTime;
    if (schedule.hours !== undefined) row.hours = schedule.hours;
    if (schedule.notes !== undefined) row.notes = schedule.notes ?? null;

    const { data, error } = await supabase
      .from('schedules')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as ScheduleRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (error) throw error;
  }
}
