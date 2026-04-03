import { ProductionRecord } from '../../entities/ProductionRecord';

export interface IProductionRecordRepository {
  create(record: Omit<ProductionRecord, 'id' | 'timestamp'>): Promise<ProductionRecord>;
  getByStore(storeId: string): Promise<ProductionRecord[]>;
  getByDateRange(storeId: string, from: string, to: string): Promise<ProductionRecord[]>;
}
