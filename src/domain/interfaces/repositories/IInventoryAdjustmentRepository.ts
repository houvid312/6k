import { InventoryAdjustment } from '../../entities';

export interface IInventoryAdjustmentRepository {
  create(adjustment: Omit<InventoryAdjustment, 'id' | 'createdAt'>): Promise<InventoryAdjustment>;
  getByStore(storeId: string, limit?: number): Promise<InventoryAdjustment[]>;
}
