import { PizzaSize } from '../enums/PizzaSize';

export interface SaleItem {
  id: string;
  productId: string;
  size: PizzaSize;
  quantity: number;
  portions: number;
  unitPrice: number;
  subtotal: number;
}
