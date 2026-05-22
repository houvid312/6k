import { CreditEntry, CreditPayment } from '../../entities';

export interface ICreditRepository {
  getAll(): Promise<CreditEntry[]>;
  getByDebtor(debtorName: string): Promise<CreditEntry[]>;
  create(entry: Omit<CreditEntry, 'id'>): Promise<CreditEntry>;
  markAsPaid(id: string): Promise<CreditEntry>;
  updateBalance(id: string, balance: number): Promise<CreditEntry>;
  getActiveByWorker(workerId: string): Promise<CreditEntry[]>;
  applyPayment(input: Omit<CreditPayment, 'id' | 'createdAt'>): Promise<CreditPayment>;
  getPaymentsByStoreDateRange(storeId: string, from: string, to: string): Promise<CreditPayment[]>;
}
