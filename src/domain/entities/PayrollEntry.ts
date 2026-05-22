export interface PayrollEntry {
  id: string;
  periodId?: string;
  periodStart: string;
  periodEnd: string;
  workerId: string;
  storeId?: string;
  totalHours: number;
  hourlyRate: number;
  grossPay: number;
  activeDebt: number;
  debtDeduction: number;
  debtCreditIds: string[];
  attendanceIds: string[];
  deductions: number;
  netPay: number;
  notes?: string;
}
