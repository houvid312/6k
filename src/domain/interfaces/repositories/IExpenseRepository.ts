import { Expense } from '../../entities/Expense';

export interface IExpenseRepository {
  getAll(storeId?: string): Promise<Expense[]>;
  create(expense: Omit<Expense, 'id'>): Promise<Expense>;
  getByDateRange(storeId: string, from: string, to: string): Promise<Expense[]>;
}
