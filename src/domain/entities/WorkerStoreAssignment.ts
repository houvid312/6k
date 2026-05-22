export interface WorkerStoreAssignment {
  id: string;
  workerId: string;
  storeId: string;
  isPrimary: boolean;
  createdAt?: string;
}
