import { PhysicalCount, PhysicalCountItem } from '../domain/entities';
import { IPhysicalCountRepository } from '../domain/interfaces/repositories/IPhysicalCountRepository';
import { IInventoryRepository, ISupplyRepository } from '../domain/interfaces/repositories';
import { InventoryLevel } from '../domain/enums';

export class PhysicalCountService {
  constructor(
    private physicalCountRepo: IPhysicalCountRepository,
    private inventoryRepo: IInventoryRepository,
    private supplyRepo?: ISupplyRepository,
  ) {}

  async submitCount(
    storeId: string,
    items: PhysicalCountItem[],
    workerId?: string,
    level: InventoryLevel = InventoryLevel.STORE,
  ): Promise<PhysicalCount> {
    // 1. Save the physical count
    const count = await this.physicalCountRepo.create({ storeId, workerId, items });

    // 2. Update inventory with the actual counted values
    let supplyCatMap = new Map<string, string>();
    if (this.supplyRepo && level !== InventoryLevel.STORE) {
      const supplies = await this.supplyRepo.getAll();
      supplyCatMap = new Map(supplies.map((s) => [s.id, s.category ?? 'PROCESSED']));
    }

    for (const item of items) {
      let targetLevel = level;
      if (level !== InventoryLevel.STORE) {
        const cat = supplyCatMap.get(item.supplyId);
        targetLevel = cat === 'RAW' ? InventoryLevel.RAW : InventoryLevel.PROCESSED;
      }
      await this.inventoryRepo.setQuantity(storeId, item.supplyId, targetLevel, item.totalGrams);
    }

    return count;
  }

  async getLatest(storeId: string): Promise<PhysicalCount | null> {
    return this.physicalCountRepo.getLatest(storeId);
  }

  async getByStore(storeId: string): Promise<PhysicalCount[]> {
    return this.physicalCountRepo.getByStore(storeId);
  }
}
