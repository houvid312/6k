import { AlertType } from './Validation';

export interface DailyAlert {
  id: string;
  storeId: string;
  date: string;
  physicalCountId?: string;
  closingWorkerId?: string;
  countWorkerId?: string;
  supplyId: string;
  theoreticalGrams: number;
  realGrams: number;
  differenceGrams: number;
  differencePercent: number;
  alertType: AlertType;
}
