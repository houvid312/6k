import { StockMinimum } from '../../entities/StockMinimum';
import { InventoryLevel } from '../../enums';

export interface IStockMinimumRepository {
  getByStoreAndLevel(storeId: string, level: InventoryLevel): Promise<StockMinimum[]>;
  upsert(storeId: string, supplyId: string, level: InventoryLevel, minimumGrams: number): Promise<StockMinimum>;
}
