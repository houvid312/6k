import { InventoryItem, Supply } from '../domain/entities';
import { InventoryLevel } from '../domain/enums';
import { IInventoryRepository, ISupplyRepository } from '../domain/interfaces/repositories';

export interface InventorySummaryItem {
  supplyId: string;
  supplyName: string;
  quantityGrams: number;
  bags: number;
  looseGrams: number;
  gramsPerBag: number;
}

export class InventoryService {
  constructor(
    private inventoryRepo: IInventoryRepository,
    private supplyRepo: ISupplyRepository,
  ) {}

  /**
   * Returns inventory items for a store at a specific inventory level.
   */
  async getInventoryByLevel(
    storeId: string,
    level: InventoryLevel,
  ): Promise<InventoryItem[]> {
    return this.inventoryRepo.getByStore(storeId, level);
  }

  /**
   * Converts raw inventory to processed inventory.
   * Deducts from RAW level and adds to PROCESSED level.
   */
  async processRawToProcessed(
    storeId: string,
    supplyId: string,
    grams: number,
  ): Promise<void> {
    // Find raw item and deduct
    const rawItem = await this.inventoryRepo.getBySupply(supplyId, storeId, InventoryLevel.RAW);
    if (!rawItem) {
      throw new Error(`No raw inventory for supply '${supplyId}' in store '${storeId}'`);
    }
    await this.inventoryRepo.setQuantity(
      storeId,
      supplyId,
      InventoryLevel.RAW,
      Math.max(0, rawItem.quantityGrams - grams),
    );
    // Add to processed level
    await this.inventoryRepo.addGrams(storeId, supplyId, grams, InventoryLevel.PROCESSED);
  }

  /**
   * Returns inventory summary with bags and loose grams for each supply.
   */
  async getInventorySummary(
    storeId: string,
    level: InventoryLevel = InventoryLevel.STORE,
  ): Promise<InventorySummaryItem[]> {
    const inventory = await this.inventoryRepo.getByStore(storeId, level);
    const supplies = await this.supplyRepo.getAll();

    const inventoryMap = new Map<string, number>();
    for (const item of inventory) {
      inventoryMap.set(item.supplyId, item.quantityGrams);
    }

    const activeSupplies = supplies.filter((s) => s.isActive !== false);

    return activeSupplies.map((supply) => {
      const quantityGrams = inventoryMap.get(supply.id) ?? 0;
      const gramsPerBag = supply.gramsPerBag || 1;
      const bags = Math.floor(quantityGrams / gramsPerBag);
      const looseGrams = Math.round((quantityGrams % gramsPerBag) * 100) / 100;

      return {
        supplyId: supply.id,
        supplyName: supply.name,
        quantityGrams,
        bags,
        looseGrams,
        gramsPerBag,
      };
    });
  }

  /**
   * Gets the current quantity of a specific supply in a store at a level.
   */
  async getSupplyQuantity(
    storeId: string,
    supplyId: string,
    level: InventoryLevel = InventoryLevel.STORE,
  ): Promise<number> {
    const item = await this.inventoryRepo.getBySupply(supplyId, storeId, level);
    return item?.quantityGrams ?? 0;
  }
}
