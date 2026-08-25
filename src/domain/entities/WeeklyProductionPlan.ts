export interface WeeklyProductionPlanItem {
  id: string;
  planId: string;
  recipeId: string;
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sabado
  plannedBatches: number;
  plannedBags: number;
  estMinutes: number;
  isCompleted: boolean;
  completedAt?: string;
  notes?: string;
  // Propiedades enriquecidas para UI
  recipeName?: string;
  supplyName?: string;
  outputGrams?: number;
  gramsPerBag?: number;
}

export interface WeeklyProductionPlan {
  id: string;
  storeId: string;
  weekStartDate: string; // YYYY-MM-DD (Lunes de la semana)
  status: 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED';
  totalPlannedMinutes: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  items: WeeklyProductionPlanItem[];
}

export interface PlannedRecipeRequirement {
  recipeId: string;
  recipeName: string;
  supplyId: string;
  supplyName: string;
  outputGrams: number;
  outputBags: number;
  prepTimeMinutes: number;
  shelfLifeDays: number;
  weeklyDemandedGrams: number; // Demanda neta de los locales para la semana
  totalNeededGrams: number; // Demanda + Stock Mínimo
  currentStockGrams: number;
  targetNetGrams: number;
  calculatedBatches: number;
  calculatedBags: number;
  totalEstMinutes: number;
  suggestedDays: number[]; // Días de la semana recomendados para producir
}

export interface RawPurchaseRequirement {
  supplyId: string;
  supplyName: string;
  unit: string;
  requiredGrams: number;
  currentRawStockGrams: number;
  toPurchaseGrams: number;
  toPurchaseUnits: number;
  presentationGrams: number;
  unitCostCop: number; // Costo por unidad/presentación (COP)
  estimatedCostCop: number; // toPurchaseUnits * unitCostCop
  requiredDays?: number[]; // Días de la semana en que se requiere este insumo crudo (ej. [1, 4])
  dailyRequirements?: Record<number, number>; // dayOfWeek -> gramos brutos de uso ese día
  dailyUnitsToPurchase?: Record<number, number>; // dayOfWeek -> unidades netas a comprar ese día
  dailyGramsToPurchase?: Record<number, number>; // dayOfWeek -> gramos netos a comprar ese día
  dailyCostCop?: Record<number, number>; // dayOfWeek -> costo neto estimado ese día en COP
}

export interface WeeklyPlanCalculationResult {
  weekStartDate: string;
  totalDemandedPortions: number;
  totalEstimatedMinutes: number;
  totalEstimatedHours: number;
  plannedRecipes: PlannedRecipeRequirement[];
  rawPurchases: RawPurchaseRequirement[];
  daySummaries: {
    dayOfWeek: number;
    dayName: string;
    totalMinutes: number;
    totalHours: number;
    itemsCount: number;
  }[];
}
