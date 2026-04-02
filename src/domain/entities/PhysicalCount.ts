export interface PhysicalCountItem {
  supplyId: string;
  bags: number;
  looseGrams: number;
  totalGrams: number;
}

export interface PhysicalCount {
  id: string;
  timestamp: string;
  storeId: string;
  items: PhysicalCountItem[];
}
