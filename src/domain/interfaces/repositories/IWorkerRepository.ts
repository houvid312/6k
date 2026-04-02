import { Worker } from '../../entities/Worker';
import { WorkerRole } from '../../enums/WorkerRole';

export interface IWorkerRepository {
  getAll(): Promise<Worker[]>;
  getById(id: string): Promise<Worker | null>;
  getByRole(role: WorkerRole): Promise<Worker[]>;
  create(worker: Omit<Worker, 'id'>): Promise<Worker>;
}
