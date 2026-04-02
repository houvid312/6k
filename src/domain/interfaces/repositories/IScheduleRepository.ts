import { Schedule } from '../../entities/Schedule';

export interface IScheduleRepository {
  getByWorker(workerId: string): Promise<Schedule[]>;
  getByStore(storeId: string): Promise<Schedule[]>;
  getWeekSchedule(storeId: string, weekStart: string): Promise<Schedule[]>;
  create(schedule: Omit<Schedule, 'id'>): Promise<Schedule>;
}
