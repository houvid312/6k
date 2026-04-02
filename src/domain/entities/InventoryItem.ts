import { InventoryLevel } from '../enums/InventoryLevel';

export interface InventoryItem {
  id: string;
  supplyId: string;
  storeId: string;
  level: InventoryLevel;
  quantityGrams: number;
  lastUpdated: string;
}
