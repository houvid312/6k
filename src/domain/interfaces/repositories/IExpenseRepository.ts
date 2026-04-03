import { Expense } from '../../entities/Expense';

export interface IExpenseRepository {
  getAll(storeId?: string): Promise<Expense[]>;
  create(expense: Omit<Expense, 'id'>): Promise<Expense>;
  getByDateRange(storeId: string, from: string, to: string): Promise<Expense[]>;
  delete(id: string): Promise<void>;
  update(id: string, expense: Partial<Omit<Expense, 'id'>>): Promise<Expense>;
}
