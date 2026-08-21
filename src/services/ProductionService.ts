import { ProductionRecipe, ProductionRecord } from '../domain/entities';
import { InventoryLevel } from '../domain/enums';
import {
  IProductionRecipeRepository,
  IProductionRecordRepository,
  IInventoryRepository,
} from '../domain/interfaces/repositories';

export class ProductionService {
  constructor(
    private recipeRepo: IProductionRecipeRepository,
    private recordRepo: IProductionRecordRepository,
    private inventoryRepo: IInventoryRepository,
  ) {}

  /**
   * Returns all active production recipes.
   */
  async getRecipes(): Promise<ProductionRecipe[]> {
    return this.recipeRepo.getActive();
  }

  /**
   * Returns all production recipes (including inactive) for admin management.
   */
  async getAllRecipes(): Promise<ProductionRecipe[]> {
    return this.recipeRepo.getAll();
  }

  /**
   * Registers a production batch:
   * 1. Deducts raw materials from RAW inventory
   * 2. Adds produced grams to PROCESSED inventory
   * 3. Creates a production record for traceability
   */
  async registerProduction(
    storeId: string,
    workerId: string,
    recipeId: string,
    batches: number,
    notes: string = '',
    bags?: number,
  ): Promise<ProductionRecord> {
    const recipe = await this.recipeRepo.getById(recipeId);
    if (!recipe) {
      throw new Error(`Receta de produccion '${recipeId}' no encontrada`);
    }

    const outputBags = recipe.outputBags || 1;
    const isBagsMode = bags !== undefined && bags > 0;
    const effectiveBatches = isBagsMode ? bags / outputBags : batches;

    // 1. Deduct raw inputs proporcional y exactamente por unidad
    const consumedItems = [];
    for (const input of recipe.inputs) {
      const gramsToConsume = isBagsMode
        ? Math.round(((input.gramsRequired / outputBags) * bags) * 100) / 100
        : Math.round(input.gramsRequired * effectiveBatches * 100) / 100;

      await this.inventoryRepo.deductGrams(storeId, input.supplyId, gramsToConsume);
      consumedItems.push({
        supplyId: input.supplyId,
        gramsConsumed: gramsToConsume,
      });
    }

    // 2. Add to PROCESSED level (exacto por bolsa)
    const gramsPerBag = recipe.outputGrams / outputBags;
    const totalProduced = isBagsMode
      ? Math.round(bags * gramsPerBag * 100) / 100
      : Math.round(recipe.outputGrams * effectiveBatches * 100) / 100;

    await this.inventoryRepo.addGrams(
      storeId,
      recipe.supplyId,
      totalProduced,
      InventoryLevel.PROCESSED,
    );

    // 3. Create record
    return this.recordRepo.create({
      storeId,
      workerId,
      productionRecipeId: recipeId,
      batches: Math.round(effectiveBatches * 1000) / 1000,
      totalGramsProduced: totalProduced,
      notes,
      items: consumedItems,
    });
  }

  /**
   * Returns production history for a store.
   */
  async getProductionHistory(
    storeId: string,
    from?: string,
    to?: string,
  ): Promise<ProductionRecord[]> {
    if (from && to) {
      return this.recordRepo.getByDateRange(storeId, from, to);
    }
    return this.recordRepo.getByStore(storeId);
  }
}
