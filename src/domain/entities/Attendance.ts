export interface Attendance {
  id: string;
  date: string;
  workerId: string;
  storeId: string;
  scheduleId?: string;
  scheduledHours: number;
  actualHours: number;
  hourlyRate: number;
  subtotal: number;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
  isUnplanned: boolean;
  source: 'MANUAL' | 'CLOSING' | 'SYSTEM';
  status: 'DRAFT' | 'RECORDED' | 'VERIFIED';
}
