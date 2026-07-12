import { WorkerRole } from '../enums/WorkerRole';
import { UserRole } from '../enums/UserRole';

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  userRole?: UserRole;
  hourlyRate: number;
  isActive: boolean;
  phone?: string;
  pin?: string;
  username?: string;
  storeIds?: string[];
}
