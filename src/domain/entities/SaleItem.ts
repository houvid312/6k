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
}
