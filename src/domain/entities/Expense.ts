import { PaymentMethod } from '../enums/PaymentMethod';

export interface Expense {
  id: string;
  date: string;
  storeId: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
}
