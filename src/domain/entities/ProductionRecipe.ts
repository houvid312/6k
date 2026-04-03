export interface ProductionRecipeInput {
  supplyId: string;
  gramsRequired: number;
}

export interface ProductionRecipe {
  id: string;
  supplyId: string;
  name: string;
  outputGrams: number;
  outputBags: number;
  isActive: boolean;
  inputs: ProductionRecipeInput[];
}
