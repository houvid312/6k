import { Validation, AlertType } from '../domain/entities';
import { PORTIONS_PER_SIZE, InventoryLevel } from '../domain/enums';
import { ISaleRepository, IRecipeRepository, IInventoryRepository } from '../domain/interfaces/repositories';

export interface TheoreticalConsumption {
  supplyId: string;
  theoreticalGrams: number;
}

export interface ValidationAlert {
  supplyId: string;
  supplyName: string;
  theoreticalGrams: number;
  realGrams: number;
  differenceGrams: number;
  differencePercent: number;
  alertType: AlertType;
}

export class ValidationService {
  constructor(
    private saleRepo: ISaleRepository,
    private recipeRepo: IRecipeRepository,
    private inventoryRepo: IInventoryRepository,
  ) {}

  /**
   * Calculates theoretical consumption from sales using recipes.
   */
  async calculateTheoreticalConsumption(
    storeId: string,
    startDate: string,
    endDate: string,
  ): Promise<TheoreticalConsumption[]> {
    const sales = await this.saleRepo.getByDateRange(storeId, startDate, endDate);
    const consumptionMap = new Map<string, number>();

    for (const sale of sales) {
      for (const item of sale.items) {
        const recipe = await this.recipeRepo.getByProductId(item.productId);
        if (!recipe) continue;

        const portions = item.portions;

        for (const ingredient of recipe.ingredients) {
          const grams = ingredient.gramsPerPortion * portions;
          const current = consumptionMap.get(ingredient.supplyId) ?? 0;
          consumptionMap.set(ingredient.supplyId, current + grams);
        }
      }
    }

    return Array.from(consumptionMap.entries()).map(([supplyId, theoreticalGrams]) => ({
      supplyId,
      theoreticalGrams: Math.round(theoreticalGrams * 100) / 100,
    }));
  }

  /**
   * Creates a validation record comparing theoretical vs real consumption for a supply.
   */
  async createValidation(
    storeId: string,
    date: string,
    supplyId: string,
    theoreticalGrams: number,
    realGrams: number,
  ): Promise<Validation> {
    const differenceGrams = Math.round((realGrams - theoreticalGrams) * 100) / 100;
    const alertPercentage =
      theoreticalGrams > 0
        ? Math.round((differenceGrams / theoreticalGrams) * 10000) / 100
        : 0;

    let alertType: AlertType = 'OK';
    if (alertPercentage > 5) alertType = 'SURPLUS';
    else if (alertPercentage < -5) alertType = 'LOSS';

    const validation: Validation = {
      id: `val-${supplyId}-${Date.now()}`,
      date,
      storeId,
      supplyId,
      theoreticalGrams,
      realGrams,
      differenceGrams,
      alertPercentage,
      alertType,
    };

    return validation;
  }

  /**
   * Returns alerts for supplies where actual consumption differs
   * significantly from theoretical (> threshold %).
   */
  async getAlerts(
    storeId: string,
    startDate: string,
    endDate: string,
    initialInventory: Record<string, number>,
    finalInventory: Record<string, number>,
    thresholdPercent: number = 5,
  ): Promise<ValidationAlert[]> {
    const theoretical = await this.calculateTheoreticalConsumption(storeId, startDate, endDate);
    const alerts: ValidationAlert[] = [];

    for (const tc of theoretical) {
      if (tc.theoreticalGrams === 0) continue;
      const initial = initialInventory[tc.supplyId] ?? 0;
      const final_ = finalInventory[tc.supplyId] ?? 0;
      const realConsumed = Math.round((initial - final_) * 100) / 100;
      const differenceGrams = Math.round((realConsumed - tc.theoreticalGrams) * 100) / 100;
      const diffPercent = Math.round((differenceGrams / tc.theoreticalGrams) * 10000) / 100;

      if (Math.abs(diffPercent) > thresholdPercent) {
        let alertType: AlertType = 'OK';
        if (diffPercent > thresholdPercent) alertType = 'SURPLUS';
        else if (diffPercent < -thresholdPercent) alertType = 'LOSS';

        alerts.push({
          supplyId: tc.supplyId,
          supplyName: '',
          theoreticalGrams: tc.theoreticalGrams,
          realGrams: realConsumed,
          differenceGrams,
          differencePercent: diffPercent,
          alertType,
        });
      }
    }

    return alerts;
  }
}
