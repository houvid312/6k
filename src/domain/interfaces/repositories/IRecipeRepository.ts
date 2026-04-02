import { Recipe } from '../../entities/Recipe';

export interface IRecipeRepository {
  getAll(): Promise<Recipe[]>;
  getByProductId(productId: string): Promise<Recipe | null>;
  updateIngredients(recipeId: string, ingredients: { supplyId: string; gramsPerPortion: number }[]): Promise<void>;
}
