export interface RecipeIngredient {
  supplyId: string;
  gramsPerPortion: number;
}

export interface Recipe {
  id: string;
  productId: string;
  ingredients: RecipeIngredient[];
}
