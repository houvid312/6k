import { InventoryItem } from '../../entities/InventoryItem';
import { InventoryLevel } from '../../enums/InventoryLevel';

export interface IInventoryRepository {
  getByStore(storeId: string, level: InventoryLevel): Promise<InventoryItem[]>;
  getBySupply(supplyId: string, storeId: string, level: InventoryLevel): Promise<InventoryItem | null>;
  deductGrams(storeId: string, supplyId: string, grams: number): Promise<InventoryItem>;
  addGrams(storeId: string, supplyId: string, grams: number, level: InventoryLevel): Promise<InventoryItem>;
  setQuantity(storeId: string, supplyId: string, level: InventoryLevel, grams: number): Promise<InventoryItem>;
  getAll(): Promise<InventoryItem[]>;
}
