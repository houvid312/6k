import { DemandEstimate } from '../../entities/DemandEstimate';

export interface IDemandEstimateRepository {
  getByStoreAndDay(storeId: string, dayOfWeek: number): Promise<DemandEstimate[]>;
  getByStore(storeId: string): Promise<DemandEstimate[]>;
  upsert(estimates: Omit<DemandEstimate, 'id'>[]): Promise<void>;
}
