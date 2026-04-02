export interface DenominationCount {
  bills100k: number;
  bills50k: number;
  bills20k: number;
  bills10k: number;
  bills5k: number;
  bills2k: number;
  coins: number;
}

export interface CashClosing {
  id: string;
  date: string;
  storeId: string;
  denominations: DenominationCount;
  bankTotal: number;
  expectedTotal: number;
  actualTotal: number;
  discrepancy: number;
  expenses: number;
}
