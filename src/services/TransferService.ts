import { Transfer, TransferItem } from '../domain/entities';
import { TransferStatus, InventoryLevel } from '../domain/enums';
import { ITransferRepository, IInventoryRepository, ISupplyRepository } from '../domain/interfaces/repositories';

export class TransferService {
  constructor(
    private transferRepo: ITransferRepository,
    private inventoryRepo: IInventoryRepository,
    private supplyRepo: ISupplyRepository,
  ) {}

  /**
   * Generates a transfer order based on minimum target inventory levels.
   * Calculates what the destination store needs at STORE level.
   */
  async generateTransferOrder(
    fromStoreId: string,
    toStoreId: string,
    minTargets: Record<string, number>,
  ): Promise<Transfer> {
    const items: TransferItem[] = [];
    const supplies = await this.supplyRepo.getAll();

    for (const supply of supplies) {
      const targetGrams = minTargets[supply.id] ?? 0;
      if (targetGrams <= 0) continue;

      const currentItem = await this.inventoryRepo.getBySupply(
        supply.id,
        toStoreId,
        InventoryLevel.STORE,
      );
      const currentGrams = currentItem?.quantityGrams ?? 0;

      if (currentGrams < targetGrams) {
        const neededGrams = targetGrams - currentGrams;
        const bagsToSend = Math.ceil(neededGrams / supply.gramsPerBag);

        items.push({
          supplyId: supply.id,
          targetGrams,
          currentInventoryGrams: currentGrams,
          bagsToSend,
        });
      }
    }

    const now = new Date().toISOString();
    const transfer = await this.transferRepo.create({
      fromStoreId,
      toStoreId,
      orderDate: now,
      shippingDate: '',
      items,
      status: TransferStatus.PENDING,
    } as Omit<Transfer, 'id'>);

    return transfer;
  }

  /**
   * Executes a transfer: deducts from source store and adds to destination store.
   */
  async executeTransfer(transferId: string): Promise<Transfer> {
    const all = await this.transferRepo.getAll();
    const transfer = all.find((t) => t.id === transferId);
    if (!transfer) {
      throw new Error(`Transfer '${transferId}' not found`);
    }

    if (transfer.status !== TransferStatus.PENDING && transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new Error(`Transfer '${transferId}' cannot be executed in status '${transfer.status}'`);
    }

    const supplies = await this.supplyRepo.getAll();
    const supplyMap = new Map(supplies.map((s) => [s.id, s]));

    for (const item of transfer.items) {
      const supply = supplyMap.get(item.supplyId);
      const gramsToTransfer = supply
        ? item.bagsToSend * supply.gramsPerBag
        : item.targetGrams - item.currentInventoryGrams;

      // Deduct from source
      await this.inventoryRepo.deductGrams(transfer.fromStoreId, item.supplyId, gramsToTransfer);
      // Add to destination
      await this.inventoryRepo.addGrams(
        transfer.toStoreId,
        item.supplyId,
        gramsToTransfer,
        InventoryLevel.STORE,
      );
    }

    return this.transferRepo.updateStatus(transferId, TransferStatus.RECEIVED);
  }

  /**
   * Gets all transfers for a store (incoming or outgoing).
   */
  async getTransfersByStore(storeId: string): Promise<Transfer[]> {
    return this.transferRepo.getByStore(storeId);
  }

  /**
   * Cancels a pending transfer.
   */
  async cancelTransfer(transferId: string): Promise<Transfer> {
    return this.transferRepo.updateStatus(transferId, TransferStatus.CANCELLED);
  }
}
