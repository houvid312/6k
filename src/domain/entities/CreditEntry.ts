export type DebtorType = 'CLIENTE' | 'TRABAJADOR' | 'LOCAL';

export interface CreditEntry {
  id: string;
  date: string;
  debtorName: string;
  debtorType: DebtorType;
  workerId?: string;
  storeId?: string;
  transferId?: string;
  concept: string;
  amount: number;
  balance: number;
  isPaid: boolean;
  paidDate?: string;
}
