export interface CreditPayment {
  id: string;
  creditEntryId: string;
  workerId?: string;
  storeId?: string;
  payrollPeriodId?: string;
  payrollEntryId?: string;
  amount: number;
  date: string;
  source: 'PAYROLL' | 'MANUAL';
  notes?: string;
  createdAt?: string;
}
