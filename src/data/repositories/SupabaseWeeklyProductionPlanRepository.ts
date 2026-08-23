import { supabase } from '../../lib/supabase';
import { WeeklyProductionPlan, WeeklyProductionPlanItem } from '../../domain/entities';
import { IWeeklyProductionPlanRepository } from '../../domain/interfaces/repositories';

interface PlanRow {
  id: string;
  store_id: string;
  week_start_date: string;
  status: string;
  total_planned_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PlanItemRow {
  id: string;
  plan_id: string;
  recipe_id: string;
  day_of_week: number;
  planned_batches: number;
  planned_bags: number;
  est_minutes: number;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  production_recipes?: {
    name: string;
    output_grams: number;
    output_bags: number;
    supplies?: {
      name: string;
      grams_per_bag: number;
    } | null;
  } | null;
}

function itemRowToEntity(row: PlanItemRow): WeeklyProductionPlanItem {
  const recipe = row.production_recipes;
  const supply = recipe?.supplies;
  return {
    id: row.id,
    planId: row.plan_id,
    recipeId: row.recipe_id,
    dayOfWeek: row.day_of_week,
    plannedBatches: Number(row.planned_batches),
    plannedBags: Number(row.planned_bags),
    estMinutes: Number(row.est_minutes),
    isCompleted: row.is_completed,
    completedAt: row.completed_at ?? undefined,
    notes: row.notes ?? undefined,
    recipeName: recipe?.name,
    supplyName: supply?.name,
    outputGrams: recipe?.output_grams ? Number(recipe.output_grams) : undefined,
    gramsPerBag: supply?.grams_per_bag ? Number(supply.grams_per_bag) : undefined,
  };
}

function planRowToEntity(row: PlanRow, items: WeeklyProductionPlanItem[]): WeeklyProductionPlan {
  return {
    id: row.id,
    storeId: row.store_id,
    weekStartDate: row.week_start_date,
    status: row.status as WeeklyProductionPlan['status'],
    totalPlannedMinutes: Number(row.total_planned_minutes),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

export class SupabaseWeeklyProductionPlanRepository implements IWeeklyProductionPlanRepository {
  async getByWeek(storeId: string, weekStartDate: string): Promise<WeeklyProductionPlan | null> {
    const { data: planData, error: planError } = await supabase
      .from('weekly_production_plans')
      .select('*')
      .eq('store_id', storeId)
      .eq('week_start_date', weekStartDate)
      .maybeSingle();

    if (planError) throw planError;
    if (!planData) return null;

    const { data: itemsData, error: itemsError } = await supabase
      .from('weekly_production_plan_items')
      .select(`
        *,
        production_recipes (
          name,
          output_grams,
          output_bags,
          supplies (
            name,
            grams_per_bag
          )
        )
      `)
      .eq('plan_id', planData.id)
      .order('day_of_week', { ascending: true });

    if (itemsError) throw itemsError;

    const items = ((itemsData as unknown) as PlanItemRow[]).map(itemRowToEntity);
    return planRowToEntity(planData as PlanRow, items);
  }

  async savePlan(plan: Omit<WeeklyProductionPlan, 'id' | 'createdAt'>): Promise<WeeklyProductionPlan> {
    // 1. Upsert plan header
    const { data: planData, error: planError } = await supabase
      .from('weekly_production_plans')
      .upsert({
        store_id: plan.storeId,
        week_start_date: plan.weekStartDate,
        status: plan.status,
        total_planned_minutes: plan.totalPlannedMinutes,
        notes: plan.notes || '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,week_start_date' })
      .select()
      .single();

    if (planError) throw planError;
    const planRow = planData as PlanRow;

    // 2. Delete old items and insert fresh items
    const { error: deleteError } = await supabase
      .from('weekly_production_plan_items')
      .delete()
      .eq('plan_id', planRow.id);

    if (deleteError) throw deleteError;

    if (plan.items.length > 0) {
      const itemsToInsert = plan.items.map((item) => ({
        plan_id: planRow.id,
        recipe_id: item.recipeId,
        day_of_week: item.dayOfWeek,
        planned_batches: item.plannedBatches,
        planned_bags: item.plannedBags,
        est_minutes: item.estMinutes,
        is_completed: item.isCompleted ?? false,
        notes: item.notes || '',
      }));

      const { error: insertError } = await supabase
        .from('weekly_production_plan_items')
        .insert(itemsToInsert);

      if (insertError) throw insertError;
    }

    return this.getByWeek(plan.storeId, plan.weekStartDate) as Promise<WeeklyProductionPlan>;
  }

  async updateItemCompletion(itemId: string, isCompleted: boolean): Promise<WeeklyProductionPlanItem> {
    const { data, error } = await supabase
      .from('weekly_production_plan_items')
      .update({
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      })
      .eq('id', itemId)
      .select(`
        *,
        production_recipes (
          name,
          output_grams,
          output_bags,
          supplies (
            name,
            grams_per_bag
          )
        )
      `)
      .single();

    if (error) throw error;
    return itemRowToEntity(data as unknown as PlanItemRow);
  }

  async deletePlan(id: string): Promise<void> {
    const { error } = await supabase
      .from('weekly_production_plans')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
