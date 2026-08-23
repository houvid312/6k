import { WeeklyProductionPlan, WeeklyProductionPlanItem } from '../../entities/WeeklyProductionPlan';

export interface IWeeklyProductionPlanRepository {
  getByWeek(storeId: string, weekStartDate: string): Promise<WeeklyProductionPlan | null>;
  savePlan(plan: Omit<WeeklyProductionPlan, 'id' | 'createdAt'>): Promise<WeeklyProductionPlan>;
  updateItemCompletion(itemId: string, isCompleted: boolean): Promise<WeeklyProductionPlanItem>;
  deletePlan(id: string): Promise<void>;
}
