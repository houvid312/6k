import { DailyAlert } from '../../entities/DailyAlert';

export interface IDailyAlertRepository {
  createMany(alerts: Omit<DailyAlert, 'id'>[]): Promise<DailyAlert[]>;
  deleteByStoreAndDate(storeId: string, date: string): Promise<void>;
  getByStoreAndDate(storeId: string, date: string): Promise<DailyAlert[]>;
  getByDateRange(storeId: string, from: string, to: string): Promise<DailyAlert[]>;
}
