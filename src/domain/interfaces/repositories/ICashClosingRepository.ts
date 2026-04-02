import { CashClosing } from '../../entities/CashClosing';

export interface ICashClosingRepository {
  getByDate(storeId: string, date: string): Promise<CashClosing | null>;
  create(closing: Omit<CashClosing, 'id'>): Promise<CashClosing>;
  getByDateRange(storeId: string, from: string, to: string): Promise<CashClosing[]>;
}
