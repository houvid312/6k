export type DebtorType = 'CLIENTE' | 'TRABAJADOR' | 'LOCAL';

export interface CreditEntry {
  id: string;
  date: string;
  debtorName: string;
  debtorType: DebtorType;
  workerId?: string;
  customerId?: string;
  storeId?: string;
  transferId?: string;
  saleId?: string;
  expenseId?: string;
  concept: string;
  amount: number;
  balance: number;
  isPaid: boolean;
  paidDate?: string;
}
