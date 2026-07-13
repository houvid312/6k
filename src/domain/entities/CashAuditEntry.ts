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
  bills100k: number;
  bills50k: number;
  bills20k: number;
  bills10k: number;
  bills5k: number;
  bills2k: number;
  coins: number;
  bankTotal: number;
  createdAt?: string;
  updatedAt?: string;
}
