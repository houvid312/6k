import { Transfer } from '../../entities/Transfer';
import { TransferStatus } from '../../enums/TransferStatus';

export interface ITransferRepository {
  getAll(): Promise<Transfer[]>;
  getByStore(storeId: string): Promise<Transfer[]>;
  getReceivedByDestination(toStoreId: string, fromDate: string, toDate: string): Promise<Transfer[]>;
  create(transfer: Omit<Transfer, 'id'>): Promise<Transfer>;
  updateStatus(id: string, status: TransferStatus): Promise<Transfer>;
}
