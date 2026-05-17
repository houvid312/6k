export interface CashAuditEntry {
  id: string;
  storeId: string;
  date: string;
  openingBase: number;
  cashSales: number;
  cashExpenses: number;
  theoreticalTotal: number;
  actualTotal: number;
  discrepancy: number;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}
