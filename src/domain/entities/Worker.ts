import { WorkerRole } from '../enums/WorkerRole';

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  hourlyRate: number;
  isActive: boolean;
  phone?: string;
  pin?: string;
}
