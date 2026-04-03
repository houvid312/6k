import { ProductionRecipe, ProductionRecipeInput } from '../../entities/ProductionRecipe';

export interface IProductionRecipeRepository {
  getAll(): Promise<ProductionRecipe[]>;
  getActive(): Promise<ProductionRecipe[]>;
  getById(id: string): Promise<ProductionRecipe | null>;
  create(recipe: Omit<ProductionRecipe, 'id'>): Promise<ProductionRecipe>;
  update(id: string, data: Partial<Pick<ProductionRecipe, 'name' | 'outputGrams' | 'outputBags' | 'isActive'>>): Promise<ProductionRecipe>;
  updateInputs(recipeId: string, inputs: ProductionRecipeInput[]): Promise<void>;
}
