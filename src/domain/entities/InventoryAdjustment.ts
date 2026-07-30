import { InventoryLevel } from '../enums';

export interface InventoryAdjustment {
  id: string;
  storeId: string;
  supplyId: string;
  level: InventoryLevel;
  previousQuantityGrams: number;
  newQuantityGrams: number;
  differenceGrams: number;
  reason: string;
  userId?: string;
  createdAt: string;
}
