import { supabase } from '../../lib/supabase';
import { DailyAlert, AlertType } from '../../domain/entities';
import { IDailyAlertRepository } from '../../domain/interfaces/repositories';

interface AlertRow {
  id: string;
  store_id: string;
  date: string;
  physical_count_id: string | null;
  closing_worker_id: string | null;
  count_worker_id: string | null;
  supply_id: string;
  theoretical_grams: number;
  real_grams: number;
  difference_grams: number;
  difference_percent: number;
  alert_type: string;
  created_at: string;
}

function toEntity(row: AlertRow): DailyAlert {
  return {
    id: row.id,
    storeId: row.store_id,
    date: row.date,
    physicalCountId: row.physical_count_id ?? undefined,
    closingWorkerId: row.closing_worker_id ?? undefined,
    countWorkerId: row.count_worker_id ?? undefined,
    supplyId: row.supply_id,
    theoreticalGrams: Number(row.theoretical_grams),
    realGrams: Number(row.real_grams),
    differenceGrams: Number(row.difference_grams),
    differencePercent: Number(row.difference_percent),
    alertType: row.alert_type as AlertType,
  };
}

export class SupabaseDailyAlertRepository implements IDailyAlertRepository {
  async createMany(alerts: Omit<DailyAlert, 'id'>[]): Promise<DailyAlert[]> {
    const rows = alerts.map((a) => ({
      store_id: a.storeId,
      date: a.date,
      physical_count_id: a.physicalCountId ?? null,
      closing_worker_id: a.closingWorkerId ?? null,
      count_worker_id: a.countWorkerId ?? null,
      supply_id: a.supplyId,
      theoretical_grams: a.theoreticalGrams,
      real_grams: a.realGrams,
      difference_grams: a.differenceGrams,
      difference_percent: a.differencePercent,
      alert_type: a.alertType,
    }));

    const { data, error } = await supabase
      .from('daily_alerts')
      .insert(rows)
      .select();
    if (error) throw error;
    return (data as AlertRow[]).map(toEntity);
  }

  async deleteByStoreAndDate(storeId: string, date: string): Promise<void> {
    const { error } = await supabase
      .from('daily_alerts')
      .delete()
      .eq('store_id', storeId)
      .eq('date', date);
    if (error) throw error;
  }

  async getByStoreAndDate(storeId: string, date: string): Promise<DailyAlert[]> {
    const { data, error } = await supabase
      .from('daily_alerts')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as AlertRow[]).map(toEntity);
  }

  async getByDateRange(storeId: string, from: string, to: string): Promise<DailyAlert[]> {
    const { data, error } = await supabase
      .from('daily_alerts')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as AlertRow[]).map(toEntity);
  }
}
