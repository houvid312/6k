import { Transfer, TransferItem } from '../domain/entities';
import { TransferStatus, InventoryLevel } from '../domain/enums';
import { ITransferRepository, IInventoryRepository, ISupplyRepository } from '../domain/interfaces/repositories';

export interface TransferOrderInputItem {
  supplyId: string;
  currentInventoryGrams: number;
  bagsToSend: number;
  gramsPerBag: number;
}

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

    if (items.length === 0) {
      throw new Error('No hay insumos para trasladar');
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
   * Creates a transfer order from user-edited bag quantities.
   */
  async createTransferOrderFromBags(
    fromStoreId: string,
    toStoreId: string,
    inputItems: TransferOrderInputItem[],
  ): Promise<Transfer> {
    const items: TransferItem[] = inputItems
      .map((item) => {
        const bagsToSend = Math.max(0, Math.trunc(item.bagsToSend));
        const currentInventoryGrams = item.currentInventoryGrams ?? 0;
        const targetGrams = currentInventoryGrams + bagsToSend * item.gramsPerBag;

        return {
          supplyId: item.supplyId,
          currentInventoryGrams,
          targetGrams,
          bagsToSend,
        };
      })
      .filter((item) => item.bagsToSend > 0);

    if (items.length === 0) {
      throw new Error('No hay bolsas para trasladar');
    }

    return this.transferRepo.create({
      fromStoreId,
      toStoreId,
      orderDate: new Date().toISOString(),
      shippingDate: '',
      items,
      status: TransferStatus.PENDING,
    } as Omit<Transfer, 'id'>);
  }

  /**
   * Receives a transfer atomically: moves inventory, freezes billing values,
   * and creates the store receivable in Supabase.
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

    return this.transferRepo.receiveWithBilling(transferId);
  }

  /**
   * Gets all transfers for a store (incoming or outgoing).
   */
  async getTransfersByStore(storeId: string): Promise<Transfer[]> {
    return this.transferRepo.getByStore(storeId);
  }

  /**
   * Marks a pending transfer as in transit.
   */
  async markInTransit(transferId: string): Promise<Transfer> {
    return this.transferRepo.updateStatus(transferId, TransferStatus.IN_TRANSIT);
  }

  /**
   * Cancels a pending transfer.
   */
  async cancelTransfer(transferId: string): Promise<Transfer> {
    return this.transferRepo.updateStatus(transferId, TransferStatus.CANCELLED);
  }
}
