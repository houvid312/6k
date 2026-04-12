import { DenominationCount } from './CashClosing';

export interface CashOpening {
  id: string;
  storeId: string;
  date: string;
  denominations: DenominationCount;
  total: number;
  openedBy?: string;
  createdAt?: string;
}
