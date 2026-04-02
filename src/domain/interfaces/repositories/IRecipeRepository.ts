import { Recipe } from '../../entities/Recipe';

export interface IRecipeRepository {
  getAll(): Promise<Recipe[]>;
  getByProductId(productId: string): Promise<Recipe | null>;
}
