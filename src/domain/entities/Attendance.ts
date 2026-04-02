export interface Attendance {
  id: string;
  date: string;
  workerId: string;
  storeId: string;
  scheduledHours: number;
  actualHours: number;
  hourlyRate: number;
  subtotal: number;
}
