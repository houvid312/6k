import { Purchase } from '../../entities/Purchase';

export interface IPurchaseRepository {
  getAll(storeId?: string): Promise<Purchase[]>;
  create(purchase: Omit<Purchase, 'id'>): Promise<Purchase>;
  getByDateRange(from: string, to: string): Promise<Purchase[]>;
}
