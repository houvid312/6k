import { InventoryLevel } from '../enums';

export interface StockMinimum {
  id: string;
  supplyId: string;
  storeId: string;
  level: InventoryLevel;
  minimumGrams: number;
}
