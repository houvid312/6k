export interface AdditionCatalogItem {
  id: string;
  supplyId: string;
  formatId: string;
  name: string;
  price: number;
  grams: number;
  isActive: boolean;
  sortOrder: number;
}

export interface SaleItemAddition {
  additionCatalogId: string;
  supplyId: string;
  name: string;
  price: number;
  grams: number;
  quantity: number;
}
