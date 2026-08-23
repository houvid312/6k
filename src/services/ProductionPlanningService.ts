import {
  WeeklyProductionPlan,
  WeeklyProductionPlanItem,
  WeeklyPlanCalculationResult,
  PlannedRecipeRequirement,
  RawPurchaseRequirement,
  ProductionRecipe,
  Supply,
} from '../domain/entities';
import {
  IWeeklyProductionPlanRepository,
  IProductionRecipeRepository,
  IDemandEstimateRepository,
  IRecipeRepository,
  IInventoryRepository,
  ISupplyRepository,
  IStoreRepository,
  IStockMinimumRepository,
  IProductRepository,
  IProductStoreAssignmentRepository,
} from '../domain/interfaces/repositories';
import { InventoryLevel } from '../domain/enums';

const DAY_NAMES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  0: 'Domingo',
  7: 'Domingo',
};

export class ProductionPlanningService {
  constructor(
    private weeklyPlanRepo: IWeeklyProductionPlanRepository,
    private productionRecipeRepo: IProductionRecipeRepository,
    private demandRepo: IDemandEstimateRepository,
    private recipeRepo: IRecipeRepository,
    private inventoryRepo: IInventoryRepository,
    private supplyRepo: ISupplyRepository,
    private storeRepo: IStoreRepository,
    private stockMinimumRepo: IStockMinimumRepository,
    private productRepo: IProductRepository,
    private productStoreAssignmentRepo: IProductStoreAssignmentRepository,
  ) {}

  /**
   * Calcula el Plan Maestro de Producción y Compras Semanal agregando la demanda
   * de todos los locales, descontando stock de planta y distribuyendo cronograma.
   */
  async calculateWeeklyPlan(weekStartDate: string): Promise<WeeklyPlanCalculationResult> {
    const allStores = await this.storeRepo.getAll();
    const cpStore = allStores.find((s) => s.isProductionCenter);
    const localStores = allStores.filter((s) => !s.isProductionCenter);

    if (!cpStore) {
      throw new Error('No se encontró una sede configurada como Centro de Producción.');
    }

    const [
      productionRecipes,
      allSupplies,
      allProducts,
      cpProcessedStock,
      cpRawStock,
      cpMinimums,
    ] = await Promise.all([
      this.productionRecipeRepo.getActive(),
      this.supplyRepo.getAll(),
      this.productRepo.getAll(),
      this.inventoryRepo.getByStore(cpStore.id, InventoryLevel.PROCESSED),
      this.inventoryRepo.getByStore(cpStore.id, InventoryLevel.RAW),
      this.stockMinimumRepo.getByStoreAndLevel(cpStore.id, InventoryLevel.PROCESSED),
    ]);

    const activeSuppliesMap = new Map<string, Supply>(
      allSupplies.filter((s) => s.isActive !== false).map((s) => [s.id, s])
    );
    const globallyActiveProductIds = new Set(allProducts.filter((p) => p.isActive).map((p) => p.id));

    const cpProcessedStockMap = new Map<string, number>(
      cpProcessedStock.map((item) => [item.supplyId, item.quantityGrams])
    );
    const cpRawStockMap = new Map<string, number>(
      cpRawStock.map((item) => [item.supplyId, item.quantityGrams])
    );
    const cpMinMap = new Map<string, number>(
      cpMinimums.map((m) => [m.supplyId, m.minimumGrams])
    );

    // 1. Calcular demanda semanal agregada de insumos procesados (Días 1 a 7)
    // Map: supplyId -> gramos totales requeridos por todos los locales
    const weeklyProcessedDemandMap = new Map<string, number>();
    // Map: dayOfWeek -> Map: supplyId -> gramos requeridos ese día
    const dailyProcessedDemandMap = new Map<number, Map<string, number>>();
    let totalDemandedPortions = 0;

    for (let day = 0; day <= 6; day++) {
      dailyProcessedDemandMap.set(day, new Map<string, number>());
    }

    for (const store of localStores) {
      const assignedProductIds = new Set(
        await this.productStoreAssignmentRepo.getProductIdsByStore(store.id)
      );

      for (let day = 0; day <= 6; day++) {
        const estimates = await this.demandRepo.getByStoreAndDay(store.id, day);
        const dayDemand = dailyProcessedDemandMap.get(day)!;

        for (const est of estimates) {
          if (!globallyActiveProductIds.has(est.productId) || !assignedProductIds.has(est.productId)) {
            continue;
          }
          if (est.estimatedPortions <= 0) continue;

          totalDemandedPortions += est.estimatedPortions;
          const salesRecipe = await this.recipeRepo.getByProductId(est.productId);
          if (!salesRecipe) continue;

          for (const ingredient of salesRecipe.ingredients) {
            const grams = ingredient.gramsPerPortion * est.estimatedPortions;
            // Sumar a la semana
            weeklyProcessedDemandMap.set(
              ingredient.supplyId,
              (weeklyProcessedDemandMap.get(ingredient.supplyId) ?? 0) + grams
            );
            // Sumar al día
            dayDemand.set(
              ingredient.supplyId,
              (dayDemand.get(ingredient.supplyId) ?? 0) + grams
            );
          }
        }
      }
    }

    // 2. Calcular lotes necesarios por receta de producción (MPS)
    const plannedRecipes: PlannedRecipeRequirement[] = [];
    const plannedBatchesPerRecipe = new Map<string, number>();
    let totalEstimatedMinutes = 0;

    for (const pr of productionRecipes) {
      const supply = activeSuppliesMap.get(pr.supplyId);
      const supplyName = supply?.name || pr.name;
      const demandedGrams = weeklyProcessedDemandMap.get(pr.supplyId) ?? 0;
      const minGrams = cpMinMap.get(pr.supplyId) ?? 0;
      const currentStock = cpProcessedStockMap.get(pr.supplyId) ?? 0;

      const totalNeeded = demandedGrams + minGrams;
      const targetNetGrams = Math.max(0, totalNeeded - currentStock);

      const outputGrams = pr.outputGrams > 0 ? pr.outputGrams : 1000;
      const outputBags = pr.outputBags > 0 ? pr.outputBags : 1;
      const prepTime = pr.prepTimeMinutes && pr.prepTimeMinutes > 0 ? pr.prepTimeMinutes : 30;
      const shelfLife = pr.shelfLifeDays && pr.shelfLifeDays > 0 ? pr.shelfLifeDays : 3;

      let batches = 0;
      let bags = 0;

      if (targetNetGrams > 0) {
        batches = Math.ceil((targetNetGrams / outputGrams) * 10) / 10;
        // Si es muy pequeño pero hay demanda, al menos 1 lote
        if (batches < 1 && targetNetGrams > 0) batches = 1;
        bags = Math.ceil(batches * outputBags);
      }

      plannedBatchesPerRecipe.set(pr.id, batches);
      const estMins = Math.round(batches * prepTime);
      totalEstimatedMinutes += estMins;

      // Sugerencia inteligente de días de producción basada en perecibilidad
      let suggestedDays: number[] = [1, 4]; // Default: Lunes y Jueves
      if (shelfLife >= 5) {
        // Larga vida útil: producir al inicio de semana
        suggestedDays = [1, 2]; // Lunes o Martes
      } else if (shelfLife >= 3) {
        // Vida media: repartir entre Lunes/Martes y Jueves
        suggestedDays = [2, 4]; // Martes y Jueves
      } else {
        // Muy perecedero (masas frescas, aguacates): producir justo antes de días pico
        suggestedDays = [3, 5]; // Miércoles y Viernes
      }

      plannedRecipes.push({
        recipeId: pr.id,
        recipeName: pr.name,
        supplyId: pr.supplyId,
        supplyName,
        outputGrams,
        outputBags,
        prepTimeMinutes: prepTime,
        shelfLifeDays: shelfLife,
        totalNeededGrams: Math.round(totalNeeded),
        currentStockGrams: Math.round(currentStock),
        targetNetGrams: Math.round(targetNetGrams),
        calculatedBatches: batches,
        calculatedBags: bags,
        totalEstMinutes: estMins,
        suggestedDays,
      });
    }

    // 3. Calcular Requerimientos de Compra de Materia Prima (RAW MRP)
    const requiredRawGramsMap = new Map<string, number>();

    for (const pr of productionRecipes) {
      const batches = plannedBatchesPerRecipe.get(pr.id) ?? 0;
      if (batches <= 0) continue;

      for (const input of pr.inputs) {
        const rawGrams = input.gramsRequired * batches;
        requiredRawGramsMap.set(
          input.supplyId,
          (requiredRawGramsMap.get(input.supplyId) ?? 0) + rawGrams
        );
      }
    }

    const rawPurchases: RawPurchaseRequirement[] = [];

    for (const [rawSupplyId, requiredGrams] of requiredRawGramsMap.entries()) {
      const supply = activeSuppliesMap.get(rawSupplyId);
      if (!supply) continue;

      const currentRawStock = cpRawStockMap.get(rawSupplyId) ?? 0;
      const toPurchaseGrams = Math.max(0, requiredGrams - currentRawStock);
      const gpb = supply.gramsPerBag > 0 ? supply.gramsPerBag : 1000;
      const toPurchaseUnits = toPurchaseGrams > 0 ? Math.ceil(toPurchaseGrams / gpb) : 0;

      rawPurchases.push({
        supplyId: rawSupplyId,
        supplyName: supply.name,
        unit: supply.unit || 'g',
        requiredGrams: Math.round(requiredGrams),
        currentRawStockGrams: Math.round(currentRawStock),
        toPurchaseGrams: Math.round(toPurchaseGrams),
        toPurchaseUnits,
        presentationGrams: gpb,
      });
    }

    // Ordenar compras por mayor necesidad
    rawPurchases.sort((a, b) => b.toPurchaseGrams - a.toPurchaseGrams);

    // 4. Generar Resumen por Día de la Semana (Cronograma estimado)
    const dayMinutesMap = new Map<number, { minutes: number; count: number }>();
    for (let day = 0; day <= 6; day++) {
      dayMinutesMap.set(day, { minutes: 0, count: 0 });
    }

    for (const item of plannedRecipes) {
      if (item.calculatedBatches <= 0) continue;
      // Dividir los lotes entre sus días sugeridos
      const days = item.suggestedDays.length > 0 ? item.suggestedDays : [1];
      const minsPerDay = Math.round(item.totalEstMinutes / days.length);

      for (const d of days) {
        const current = dayMinutesMap.get(d) || { minutes: 0, count: 0 };
        current.minutes += minsPerDay;
        current.count += 1;
        dayMinutesMap.set(d, current);
      }
    }

    // Ordenar resumen de Lunes (1) a Domingo (0)
    const orderedDays = [1, 2, 3, 4, 5, 6, 0];
    const daySummaries = orderedDays.map((d) => {
      const data = dayMinutesMap.get(d) || { minutes: 0, count: 0 };
      return {
        dayOfWeek: d,
        dayName: DAY_NAMES[d] || 'Día',
        totalMinutes: data.minutes,
        totalHours: Math.round((data.minutes / 60) * 10) / 10,
        itemsCount: data.count,
      };
    });

    return {
      weekStartDate,
      totalDemandedPortions,
      totalEstimatedMinutes,
      totalEstimatedHours: Math.round((totalEstimatedMinutes / 60) * 10) / 10,
      plannedRecipes,
      rawPurchases,
      daySummaries,
    };
  }

  /**
   * Obtiene el plan semanal guardado o nulo.
   */
  async getSavedPlan(storeId: string, weekStartDate: string): Promise<WeeklyProductionPlan | null> {
    return this.weeklyPlanRepo.getByWeek(storeId, weekStartDate);
  }

  /**
   * Guarda o actualiza un plan de producción semanal.
   */
  async savePlan(plan: Omit<WeeklyProductionPlan, 'id' | 'createdAt'>): Promise<WeeklyProductionPlan> {
    return this.weeklyPlanRepo.savePlan(plan);
  }

  /**
   * Marca una tarea o lote del cronograma como completada.
   */
  async toggleItemCompletion(itemId: string, isCompleted: boolean): Promise<WeeklyProductionPlanItem> {
    return this.weeklyPlanRepo.updateItemCompletion(itemId, isCompleted);
  }
}
