import { InventoryWriteoff } from '../domain/entities/InventoryWriteoff';
import { InventoryLevel } from '../domain/enums/InventoryLevel';
import { WriteoffStatus } from '../domain/enums/WriteoffStatus';
import { WriteoffReason } from '../domain/enums/WriteoffReason';
import { IWriteoffRepository } from '../domain/interfaces/repositories/IWriteoffRepository';
import { IInventoryRepository } from '../domain/interfaces/repositories/IInventoryRepository';

export class WriteoffService {
  constructor(
    private writeoffRepo: IWriteoffRepository,
    private inventoryRepo: IInventoryRepository,
  ) {}

  async createRequest(
    storeId: string,
    supplyId: string,
    level: InventoryLevel,
    quantityGrams: number,
    reason: WriteoffReason,
    notes: string,
    requestedBy: string,
  ): Promise<InventoryWriteoff> {
    return this.writeoffRepo.create({
      storeId,
      supplyId,
      level,
      quantityGrams,
      reason,
      notes,
      status: WriteoffStatus.PENDING,
      requestedBy,
    });
  }

  async approve(id: string, reviewedBy: string): Promise<InventoryWriteoff> {
    const writeoff = await this.writeoffRepo.updateStatus(
      id,
      WriteoffStatus.APPROVED,
      reviewedBy,
    );
    await this.inventoryRepo.deductGrams(
      writeoff.storeId,
      writeoff.supplyId,
      writeoff.quantityGrams,
      writeoff.level,
    );
    return writeoff;
  }

  async reject(id: string, reviewedBy: string): Promise<InventoryWriteoff> {
    return this.writeoffRepo.updateStatus(id, WriteoffStatus.REJECTED, reviewedBy);
  }

  async getPendingRequests(): Promise<InventoryWriteoff[]> {
    return this.writeoffRepo.getPending();
  }

  async getPendingByStore(storeId: string): Promise<InventoryWriteoff[]> {
    return this.writeoffRepo.getPendingByStore(storeId);
  }

  async getHistory(storeId: string): Promise<InventoryWriteoff[]> {
    return this.writeoffRepo.getByStore(storeId);
  }

  async getAllHistory(): Promise<InventoryWriteoff[]> {
    return this.writeoffRepo.getAll();
  }
}
