import { InventoryWriteoff } from '../domain/entities/InventoryWriteoff';
import { InventoryLevel } from '../domain/enums/InventoryLevel';
import { WriteoffStatus } from '../domain/enums/WriteoffStatus';
import { WriteoffReason } from '../domain/enums/WriteoffReason';
import { IWriteoffRepository } from '../domain/interfaces/repositories/IWriteoffRepository';
import { IInventoryRepository } from '../domain/interfaces/repositories/IInventoryRepository';
import { IRecipeRepository } from '../domain/interfaces/repositories/IRecipeRepository';

export class WriteoffService {
  constructor(
    private writeoffRepo: IWriteoffRepository,
    private inventoryRepo: IInventoryRepository,
    private recipeRepo?: IRecipeRepository,
  ) {}

  async createRequest(
    storeId: string,
    supplyId: string | undefined,
    level: InventoryLevel,
    quantityGrams: number,
    reason: WriteoffReason,
    notes: string,
    requestedBy: string,
    productId?: string,
  ): Promise<InventoryWriteoff> {
    return this.writeoffRepo.create({
      storeId,
      supplyId,
      productId,
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
    if (writeoff.productId && this.recipeRepo) {
      const recipe = await this.recipeRepo.getByProductId(writeoff.productId);
      if (recipe) {
        for (const ingredient of recipe.ingredients) {
          const grams = ingredient.gramsPerPortion * writeoff.quantityGrams;
          await this.inventoryRepo.deductGrams(
            writeoff.storeId,
            ingredient.supplyId,
            grams,
            writeoff.level,
          );
        }
      }
    } else if (writeoff.supplyId) {
      await this.inventoryRepo.deductGrams(
        writeoff.storeId,
        writeoff.supplyId,
        writeoff.quantityGrams,
        writeoff.level,
      );
    }
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
