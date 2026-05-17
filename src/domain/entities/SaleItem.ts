import { SaleItemAddition } from './Addition';

export interface SaleItem {
  id: string;
  productId: string;
  /** @deprecated Presente en ventas históricas. Usar formatId/formatName para ventas nuevas. */
  size?: string;
  formatId?: string;
  formatName: string;
  quantity: number;
  portions: number;
  unitPrice: number;
  subtotal: number;
  recipeCostCop?: number;
  additionsCostCop?: number;
  packagingCostCop?: number;
  totalCostCop?: number;
  additions?: SaleItemAddition[];
  additionsTotal?: number;
  packagingSupplyId?: string;
  packagingLabel?: string;
  packagingUnitPrice?: number;
  packagingQuantity?: number;
  packagingTotal?: number;
}
