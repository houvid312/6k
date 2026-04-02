export interface PayrollEntry {
  id: string;
  periodStart: string;
  periodEnd: string;
  workerId: string;
  totalHours: number;
  grossPay: number;
  deductions: number;
  netPay: number;
}
