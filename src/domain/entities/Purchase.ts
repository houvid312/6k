import { PaymentMethod } from '../enums/PaymentMethod';

export interface Purchase {
  id: string;
  timestamp: string;
  supplyId: string;
  quantityGrams: number;
  priceCOP: number;
  supplier: string;
  paymentMethod: PaymentMethod;
}
