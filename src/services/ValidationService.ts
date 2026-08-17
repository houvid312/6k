import { Validation, AlertType, ProductFormat } from '../domain/entities';
import { InventoryLevel } from '../domain/enums';
import { ISaleRepository, IRecipeRepository, IInventoryRepository, IWriteoffRepository, IProductFormatRepository } from '../domain/interfaces/repositories';

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
    private writeoffRepo?: IWriteoffRepository,
    private productFormatRepo?: IProductFormatRepository,
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

    const allProductIds = Array.from(new Set(sales.flatMap((s) => s.items.map((i) => i.productId))));
    let formatById = new Map<string, ProductFormat>();
    if (this.productFormatRepo && allProductIds.length > 0) {
      const formats = await this.productFormatRepo.getByProductIds(allProductIds);
      formatById = new Map(formats.map((f) => [f.id, f]));
    }

    for (const sale of sales) {
      for (const item of sale.items) {
        const recipe = await this.recipeRepo.getByProductId(item.productId);
        if (recipe) {
          const portions = item.portions;

          for (const ingredient of recipe.ingredients) {
            const grams = ingredient.gramsPerPortion * portions;
            const current = consumptionMap.get(ingredient.supplyId) ?? 0;
            consumptionMap.set(ingredient.supplyId, current + grams);
          }
        }

        if (item.formatId) {
          const format = formatById.get(item.formatId);
          if (format?.masaSupplyId && format.masaGrams) {
            const masaGrams = format.masaGrams * item.quantity;
            const current = consumptionMap.get(format.masaSupplyId) ?? 0;
            consumptionMap.set(format.masaSupplyId, current + masaGrams);
          }
        }

        for (const addition of item.additions ?? []) {
          const grams = addition.grams * addition.quantity;
          const current = consumptionMap.get(addition.supplyId) ?? 0;
          consumptionMap.set(addition.supplyId, current + grams);
        }

        if (item.packagingSupplyId && (item.packagingQuantity ?? 0) > 0) {
          const current = consumptionMap.get(item.packagingSupplyId) ?? 0;
          consumptionMap.set(item.packagingSupplyId, current + (item.packagingQuantity ?? 0));
        }
      }

      if (sale.packagingSupplyId && !sale.items.some((item) => item.packagingSupplyId)) {
        const current = consumptionMap.get(sale.packagingSupplyId) ?? 0;
        consumptionMap.set(sale.packagingSupplyId, current + 1);
      }
    }

    // Add approved writeoffs as legitimate consumption
    if (this.writeoffRepo) {
      const approvedWriteoffs = await this.writeoffRepo.getApprovedByStoreAndDateRange(
        storeId,
        startDate,
        endDate,
      );
      for (const wo of approvedWriteoffs) {
        if (wo.productId) {
          const recipe = await this.recipeRepo.getByProductId(wo.productId);
          if (recipe) {
            for (const ingredient of recipe.ingredients) {
              const grams = ingredient.gramsPerPortion * wo.quantityGrams;
              const current = consumptionMap.get(ingredient.supplyId) ?? 0;
              consumptionMap.set(ingredient.supplyId, current + grams);
            }
          }
        } else if (wo.supplyId) {
          const current = consumptionMap.get(wo.supplyId) ?? 0;
          consumptionMap.set(wo.supplyId, current + wo.quantityGrams);
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
