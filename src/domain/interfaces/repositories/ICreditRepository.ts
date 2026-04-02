import { CreditEntry } from '../../entities/CreditEntry';

export interface ICreditRepository {
  getAll(): Promise<CreditEntry[]>;
  getByDebtor(debtorName: string): Promise<CreditEntry[]>;
  create(entry: Omit<CreditEntry, 'id'>): Promise<CreditEntry>;
  markAsPaid(id: string): Promise<CreditEntry>;
  getActiveByWorker(workerId: string): Promise<CreditEntry[]>;
}
