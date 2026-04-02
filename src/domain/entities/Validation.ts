export type AlertType = 'LOSS' | 'SURPLUS' | 'OK';

export interface Validation {
  id: string;
  date: string;
  storeId: string;
  supplyId: string;
  theoreticalGrams: number;
  realGrams: number;
  differenceGrams: number;
  alertPercentage: number;
  alertType: AlertType;
}
