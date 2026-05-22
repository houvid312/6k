export type PeriodType = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
export type PeriodStatus = 'BORRADOR' | 'CERRADA' | 'PAGADA';

export interface PayrollPeriod {
  id: string;
  storeId?: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  closedAt?: string;
  paidAt?: string;
  expenseId?: string;
  notes?: string;
  createdAt?: string;
}
