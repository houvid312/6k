export interface ProductionRecordItem {
  supplyId: string;
  gramsConsumed: number;
}

export interface ProductionRecord {
  id: string;
  storeId: string;
  workerId: string;
  productionRecipeId: string;
  batches: number;
  totalGramsProduced: number;
  notes: string;
  timestamp: string;
  items: ProductionRecordItem[];
}
