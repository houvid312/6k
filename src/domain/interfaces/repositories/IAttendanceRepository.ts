import { Attendance } from '../../entities/Attendance';

export interface IAttendanceRepository {
  getByDate(storeId: string, date: string): Promise<Attendance[]>;
  create(attendance: Omit<Attendance, 'id'>): Promise<Attendance>;
  getByWorkerDateRange(workerId: string, from: string, to: string): Promise<Attendance[]>;
  upsert(attendance: Omit<Attendance, 'id'>): Promise<Attendance>;
}
