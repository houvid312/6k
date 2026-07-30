import { Income } from '../../entities/Income';

export interface IIncomeRepository {
  getAll(storeId?: string): Promise<Income[]>;
  create(income: Omit<Income, 'id'>): Promise<Income>;
  getByDateRange(storeId: string, from: string, to: string): Promise<Income[]>;
  delete(id: string): Promise<void>;
  update(id: string, income: Partial<Omit<Income, 'id'>>): Promise<Income>;
  getById(id: string): Promise<Income | null>;
}
