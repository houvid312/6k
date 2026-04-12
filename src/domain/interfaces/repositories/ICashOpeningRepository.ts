import { CashOpening } from '../../entities/CashOpening';

export interface ICashOpeningRepository {
  getByDate(storeId: string, date: string): Promise<CashOpening | null>;
  create(opening: Omit<CashOpening, 'id' | 'createdAt'>): Promise<CashOpening>;
}
