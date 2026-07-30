import { CashAuditEntry } from '../../entities/CashAuditEntry';

export interface ICashAuditRepository {
  getByDate(storeId: string, date: string): Promise<CashAuditEntry | null>;
  getByDateRange(storeId: string, from: string, to: string): Promise<CashAuditEntry[]>;
  getLastAuditBeforeDate(storeId: string, date: string): Promise<CashAuditEntry | null>;
  upsert(entry: Omit<CashAuditEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<CashAuditEntry>;
}
