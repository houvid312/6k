import { PaymentMethod } from '../enums/PaymentMethod';
import { SaleItem } from './SaleItem';

export interface Sale {
  id: string;
  timestamp: string;
  storeId: string;
  items: SaleItem[];
  totalPortions: number;
  totalAmount: number;
  cashAmount: number;
  bankAmount: number;
  paymentMethod: PaymentMethod;
  observations?: string;
  isPaid: boolean;
  isDispatched: boolean;
  customerNote?: string;
  workerName?: string;
  packagingSupplyId?: string;
}
