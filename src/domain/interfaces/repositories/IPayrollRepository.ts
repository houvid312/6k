import { PayrollEntry, PayrollPeriod, PeriodStatus, PeriodType } from '../../entities';

export interface SavePayrollPeriodInput {
  storeId: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  notes?: string;
}

export interface IPayrollRepository {
  getPeriod(storeId: string, periodType: PeriodType, startDate: string, endDate: string): Promise<PayrollPeriod | null>;
  getPeriodById(periodId: string): Promise<PayrollPeriod | null>;
  getEntries(periodId: string): Promise<PayrollEntry[]>;
  savePeriod(input: SavePayrollPeriodInput, entries: Omit<PayrollEntry, 'id'>[]): Promise<PayrollPeriod>;
  markPaid(periodId: string, expenseId?: string): Promise<PayrollPeriod>;
}
