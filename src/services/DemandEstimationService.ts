import { DemandEstimate } from '../domain/entities';
import {
  IDemandEstimateRepository,
  IRecipeRepository,
  IInventoryRepository,
  ISupplyRepository,
  IProductRepository,
  IProductStoreAssignmentRepository,
  IStockMinimumRepository,
} from '../domain/interfaces/repositories';
import { InventoryLevel } from '../domain/enums';

export interface SupplyRequirement {
  supplyId: string;
  supplyName: string;
  requiredGrams: number;
  currentGrams: number;
  neededGrams: number;
  bagsToSend: number;
  gramsPerBag: number;
}

export class DemandEstimationService {
  constructor(
    private demandRepo: IDemandEstimateRepository,
    private recipeRepo: IRecipeRepository,
    private inventoryRepo: IInventoryRepository,
    private supplyRepo: ISupplyRepository,
    private productRepo: IProductRepository,
    private productStoreAssignmentRepo: IProductStoreAssignmentRepository,
    private stockMinimumRepo?: IStockMinimumRepository,
  ) {}

  /**
   * Returns estimated demand (portions per product) for a store on a day.
   */
  async getEstimatedDemand(
    storeId: string,
    dayOfWeek: number,
  ): Promise<DemandEstimate[]> {
    return this.demandRepo.getByStoreAndDay(storeId, dayOfWeek);
  }

  /**
   * Returns all demand estimates for a store (all days).
   */
  async getAllEstimates(storeId: string): Promise<DemandEstimate[]> {
    return this.demandRepo.getByStore(storeId);
  }

  /**
   * Saves demand estimates (upserts by store+product+day).
   */
  async saveEstimates(estimates: Omit<DemandEstimate, 'id'>[]): Promise<void> {
    return this.demandRepo.upsert(estimates);
  }

  /**
   * Cross-references demand with recipes to calculate required grams per supply across one or multiple days.
   */
  async calculateRequiredSupplies(
    storeId: string,
    daysOfWeek: number | number[],
  ): Promise<Map<string, number>> {
    const days = Array.isArray(daysOfWeek) ? daysOfWeek : [daysOfWeek];

    // Productos activos globalmente
    const allProducts = await this.productRepo.getAll();
    const globallyActiveIds = new Set(allProducts.filter((p) => p.isActive).map((p) => p.id));

    // Productos habilitados para esta sede
    const assignedIds = new Set(await this.productStoreAssignmentRepo.getProductIdsByStore(storeId));

    const supplyGrams = new Map<string, number>();

    for (const day of days) {
      const demand = await this.demandRepo.getByStoreAndDay(storeId, day);
      for (const d of demand) {
        // Saltar si el producto está inactivo globalmente o no asignado a esta sede
        if (!globallyActiveIds.has(d.productId) || !assignedIds.has(d.productId)) continue;

        const recipe = await this.recipeRepo.getByProductId(d.productId);
        if (!recipe) continue;

        for (const ingredient of recipe.ingredients) {
          const grams = ingredient.gramsPerPortion * d.estimatedPortions;
          const current = supplyGrams.get(ingredient.supplyId) ?? 0;
          supplyGrams.set(ingredient.supplyId, current + grams);
        }
      }
    }

    return supplyGrams;
  }

  /**
   * Generates a suggested transfer: what a destination store needs based on
   * demand estimates across one or multiple days and stock minimums minus current inventory.
   * Returns editable requirements that the shipment screen turns into transfer items.
   */
  async generateSuggestedTransfer(
    toStoreId: string,
    daysOfWeek: number | number[],
  ): Promise<SupplyRequirement[]> {
    const requiredMap = await this.calculateRequiredSupplies(toStoreId, daysOfWeek);
    const supplies = await this.supplyRepo.getAll();
    const supplyMap = new Map(supplies.map((s) => [s.id, s]));

    // Incorporar requerimientos por Stock Mínimo (PAR Level) de la sede
    if (this.stockMinimumRepo) {
      try {
        const minimums = await this.stockMinimumRepo.getByStoreAndLevel(toStoreId, InventoryLevel.STORE);
        for (const m of minimums) {
          if (m.minimumGrams > 0) {
            if (!requiredMap.has(m.supplyId)) {
              requiredMap.set(m.supplyId, m.minimumGrams);
            } else {
              requiredMap.set(m.supplyId, Math.max(requiredMap.get(m.supplyId)!, m.minimumGrams));
            }
          }
        }
      } catch (err) {
        console.warn('Could not load stock minimums for transfer suggestion:', err);
      }
    }

    const requirements: SupplyRequirement[] = [];

    for (const [supplyId, requiredGrams] of requiredMap.entries()) {
      const supply = supplyMap.get(supplyId);
      if (!supply || supply.isActive === false) continue;
      if (supply.category === 'RAW' && !supply.isBillableToStore && !supply.allowLocalPurchase) continue;

      const currentItem = await this.inventoryRepo.getBySupply(
        supplyId,
        toStoreId,
        InventoryLevel.STORE,
      );
      const currentGrams = currentItem?.quantityGrams ?? 0;
      const neededGrams = Math.max(0, requiredGrams - currentGrams);
      const bagsToSend = neededGrams > 0 ? Math.ceil(neededGrams / (supply.gramsPerBag || 1)) : 0;

      requirements.push({
        supplyId,
        supplyName: supply.name,
        requiredGrams: Math.round(requiredGrams * 100) / 100,
        currentGrams,
        neededGrams: Math.round(neededGrams * 100) / 100,
        bagsToSend,
        gramsPerBag: supply.gramsPerBag,
      });
    }

    return requirements.filter((r) => r.bagsToSend > 0);
  }
}
