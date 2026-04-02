export type DebtorType = 'CLIENTE' | 'TRABAJADOR';

export interface CreditEntry {
  id: string;
  date: string;
  debtorName: string;
  debtorType: DebtorType;
  workerId?: string;
  concept: string;
  amount: number;
  balance: number;
  isPaid: boolean;
  paidDate?: string;
}
