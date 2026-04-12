import { Sale } from '../../entities/Sale';

export interface DailySummary {
  totalPortions: number;
  totalAmount: number;
  totalCashAmount: number;
  totalBankAmount: number;
  salesCount: number;
}

export interface ISaleRepository {
  getAll(storeId?: string): Promise<Sale[]>;
  getById(id: string): Promise<Sale | null>;
  getByDateRange(storeId: string, from: string, to: string): Promise<Sale[]>;
  getUnpaid(storeId: string): Promise<Sale[]>;
  create(sale: Omit<Sale, 'id'>): Promise<Sale>;
  markAsPaid(saleId: string): Promise<void>;
  markAsUnpaid(saleId: string): Promise<void>;
  updatePaymentMethod(saleId: string, paymentMethod: string): Promise<void>;
  markAsDispatched(saleId: string): Promise<void>;
  delete(saleId: string): Promise<void>;
  getDailySummary(storeId: string, date: string): Promise<DailySummary>;
}
