export interface Schedule {
  id: string;
  workerId: string;
  storeId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  hours: number;
}
