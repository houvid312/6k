import { CashClosing } from '../../entities/CashClosing';
import { ClosingStatus } from '../../enums/ClosingStatus';

export interface ICashClosingRepository {
  getByDate(storeId: string, date: string): Promise<CashClosing | null>;
  create(closing: Omit<CashClosing, 'id'>): Promise<CashClosing>;
  update(id: string, data: Partial<Omit<CashClosing, 'id'>>): Promise<CashClosing>;
  updateStatus(id: string, status: ClosingStatus, workerId?: string): Promise<CashClosing>;
  getByDateRange(storeId: string, from: string, to: string): Promise<CashClosing[]>;
}
