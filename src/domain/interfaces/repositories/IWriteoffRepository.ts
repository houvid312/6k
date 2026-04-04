import { InventoryWriteoff } from '../../entities/InventoryWriteoff';
import { WriteoffStatus } from '../../enums/WriteoffStatus';

export interface IWriteoffRepository {
  create(writeoff: Omit<InventoryWriteoff, 'id' | 'reviewedBy' | 'reviewedAt' | 'createdAt'>): Promise<InventoryWriteoff>;
  getByStore(storeId: string): Promise<InventoryWriteoff[]>;
  getAll(): Promise<InventoryWriteoff[]>;
  getPending(): Promise<InventoryWriteoff[]>;
  getPendingByStore(storeId: string): Promise<InventoryWriteoff[]>;
  updateStatus(id: string, status: WriteoffStatus, reviewedBy: string): Promise<InventoryWriteoff>;
  getApprovedByStoreAndDateRange(storeId: string, startDate: string, endDate: string): Promise<InventoryWriteoff[]>;
}
