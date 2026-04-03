import { PhysicalCount, PhysicalCountItem } from '../domain/entities';
import { IPhysicalCountRepository } from '../domain/interfaces/repositories/IPhysicalCountRepository';
import { IInventoryRepository } from '../domain/interfaces/repositories';
import { InventoryLevel } from '../domain/enums';

export class PhysicalCountService {
  constructor(
    private physicalCountRepo: IPhysicalCountRepository,
    private inventoryRepo: IInventoryRepository,
  ) {}

  async submitCount(storeId: string, items: PhysicalCountItem[], workerId?: string): Promise<PhysicalCount> {
    // 1. Save the physical count
    const count = await this.physicalCountRepo.create({ storeId, workerId, items });

    // 2. Update inventory with the actual counted values
    for (const item of items) {
      await this.inventoryRepo.setQuantity(storeId, item.supplyId, InventoryLevel.STORE, item.totalGrams);
    }

    return count;
  }

  async getLatest(storeId: string): Promise<PhysicalCount | null> {
    return this.physicalCountRepo.getLatest(storeId);
  }
}
