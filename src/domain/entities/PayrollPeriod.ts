export type PeriodType = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
export type PeriodStatus = 'ABIERTO' | 'CERRADO' | 'PAGADO';

export interface PayrollPeriod {
  id: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  createdAt?: string;
}
