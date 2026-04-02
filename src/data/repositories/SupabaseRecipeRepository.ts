import { supabase } from '../../lib/supabase';
import { Recipe, RecipeIngredient } from '../../domain/entities';
import { IRecipeRepository } from '../../domain/interfaces/repositories';

// --- Row types ---

interface RecipeRow {
  id: string;
  product_id: string;
}

interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  supply_id: string;
  grams_per_portion: number;
}

// --- Mappers ---

function ingredientRowToEntity(row: RecipeIngredientRow): RecipeIngredient {
  return {
    supplyId: row.supply_id,
    gramsPerPortion: row.grams_per_portion,
  };
}

function recipeRowToEntity(row: RecipeRow, ingredients: RecipeIngredient[]): Recipe {
  return {
    id: row.id,
    productId: row.product_id,
    ingredients,
  };
}

// --- Repository ---

export class SupabaseRecipeRepository implements IRecipeRepository {
  async getAll(): Promise<Recipe[]> {
    const { data, error } = await supabase
      .from('recipes')
      .select('*');
    if (error) throw error;

    const rows = data as RecipeRow[];
    if (rows.length === 0) return [];

    const recipeIds = rows.map((r) => r.id);
    const { data: ingredientData, error: ingredientError } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .in('recipe_id', recipeIds);
    if (ingredientError) throw ingredientError;

    const ingredientsByRecipe = new Map<string, RecipeIngredient[]>();
    for (const row of ingredientData as RecipeIngredientRow[]) {
      const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
      list.push(ingredientRowToEntity(row));
      ingredientsByRecipe.set(row.recipe_id, list);
    }

    return rows.map((r) =>
      recipeRowToEntity(r, ingredientsByRecipe.get(r.id) ?? []),
    );
  }

  async getByProductId(productId: string): Promise<Recipe | null> {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('product_id', productId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    const row = data as RecipeRow;
    const { data: ingredientData, error: ingredientError } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', row.id);
    if (ingredientError) throw ingredientError;

    const ingredients = (ingredientData as RecipeIngredientRow[]).map(ingredientRowToEntity);
    return recipeRowToEntity(row, ingredients);
  }
}
