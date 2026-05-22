import { WorkerStoreAssignment } from '../../entities/WorkerStoreAssignment';

export interface IWorkerStoreAssignmentRepository {
  getAll(): Promise<WorkerStoreAssignment[]>;
  getByWorker(workerId: string): Promise<WorkerStoreAssignment[]>;
  getByStore(storeId: string): Promise<WorkerStoreAssignment[]>;
  setWorkerStores(workerId: string, storeIds: string[], primaryStoreId?: string): Promise<void>;
}
