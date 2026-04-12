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

  async getWeekSchedule(storeId: string, weekStart: string): Promise<Schedule[]> {
    // Schedules are recurring by day_of_week; weekStart is used for context
    // but the schedules table stores templates, not date-specific entries
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

  async upsert(schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    const { data, error } = await supabase
      .from('schedules')
      .upsert(toRow(schedule), { onConflict: 'worker_id,store_id,day_of_week' })
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
