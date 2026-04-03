import { supabase } from '../../lib/supabase';
import { ProductionRecipe, ProductionRecipeInput } from '../../domain/entities';
import { IProductionRecipeRepository } from '../../domain/interfaces/repositories';

interface RecipeRow {
  id: string;
  supply_id: string;
  name: string;
  output_grams: number;
  output_bags: number;
  is_active: boolean;
  created_at: string;
}

interface InputRow {
  id: string;
  production_recipe_id: string;
  supply_id: string;
  grams_required: number;
}

function toEntity(row: RecipeRow, inputRows: InputRow[]): ProductionRecipe {
  return {
    id: row.id,
    supplyId: row.supply_id,
    name: row.name,
    outputGrams: Number(row.output_grams),
    outputBags: row.output_bags,
    isActive: row.is_active,
    inputs: inputRows.map((r) => ({
      supplyId: r.supply_id,
      gramsRequired: Number(r.grams_required),
    })),
  };
}

export class SupabaseProductionRecipeRepository implements IProductionRecipeRepository {
  private async fetchWithInputs(rows: RecipeRow[]): Promise<ProductionRecipe[]> {
    const recipes: ProductionRecipe[] = [];
    for (const row of rows) {
      const { data: inputs, error } = await supabase
        .from('production_recipe_inputs')
        .select('*')
        .eq('production_recipe_id', row.id);
      if (error) throw error;
      recipes.push(toEntity(row, inputs as InputRow[]));
    }
    return recipes;
  }

  async getAll(): Promise<ProductionRecipe[]> {
    const { data, error } = await supabase
      .from('production_recipes')
      .select('*')
      .order('name');
    if (error) throw error;
    return this.fetchWithInputs(data as RecipeRow[]);
  }

  async getActive(): Promise<ProductionRecipe[]> {
    const { data, error } = await supabase
      .from('production_recipes')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return this.fetchWithInputs(data as RecipeRow[]);
  }

  async getById(id: string): Promise<ProductionRecipe | null> {
    const { data, error } = await supabase
      .from('production_recipes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    const row = data as RecipeRow;
    const { data: inputs, error: inputsError } = await supabase
      .from('production_recipe_inputs')
      .select('*')
      .eq('production_recipe_id', row.id);
    if (inputsError) throw inputsError;
    return toEntity(row, inputs as InputRow[]);
  }

  async create(recipe: Omit<ProductionRecipe, 'id'>): Promise<ProductionRecipe> {
    const { data, error } = await supabase
      .from('production_recipes')
      .insert({
        supply_id: recipe.supplyId,
        name: recipe.name,
        output_grams: recipe.outputGrams,
        output_bags: recipe.outputBags,
        is_active: recipe.isActive,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as RecipeRow;

    if (recipe.inputs.length > 0) {
      const inputRows = recipe.inputs.map((input) => ({
        production_recipe_id: row.id,
        supply_id: input.supplyId,
        grams_required: input.gramsRequired,
      }));
      const { error: inputsError } = await supabase
        .from('production_recipe_inputs')
        .insert(inputRows);
      if (inputsError) throw inputsError;
    }

    return this.getById(row.id) as Promise<ProductionRecipe>;
  }

  async update(
    id: string,
    data: Partial<Pick<ProductionRecipe, 'name' | 'outputGrams' | 'outputBags' | 'isActive'>>,
  ): Promise<ProductionRecipe> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.outputGrams !== undefined) updateData.output_grams = data.outputGrams;
    if (data.outputBags !== undefined) updateData.output_bags = data.outputBags;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;

    const { error } = await supabase
      .from('production_recipes')
      .update(updateData)
      .eq('id', id);
    if (error) throw error;

    return this.getById(id) as Promise<ProductionRecipe>;
  }

  async updateInputs(recipeId: string, inputs: ProductionRecipeInput[]): Promise<void> {
    // Delete existing inputs
    const { error: deleteError } = await supabase
      .from('production_recipe_inputs')
      .delete()
      .eq('production_recipe_id', recipeId);
    if (deleteError) throw deleteError;

    // Insert new inputs
    if (inputs.length > 0) {
      const rows = inputs.map((input) => ({
        production_recipe_id: recipeId,
        supply_id: input.supplyId,
        grams_required: input.gramsRequired,
      }));
      const { error } = await supabase
        .from('production_recipe_inputs')
        .insert(rows);
      if (error) throw error;
    }
  }
}
