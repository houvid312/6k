import { TransferStatus } from '../enums/TransferStatus';

export interface TransferItem {
  supplyId: string;
  targetGrams: number;
  currentInventoryGrams: number;
  bagsToSend: number;
  gramsPerBagSnapshot?: number;
  unitCostCopSnapshot?: number;
  unitPriceCopSnapshot?: number;
  totalCostCopSnapshot?: number;
  totalPriceCopSnapshot?: number;
}

export interface Transfer {
  id: string;
  orderDate: string;
  createdAt?: string;
  shippingDate: string;
  receivedAt?: string;
  billedAt?: string;
  creditEntryId?: string;
  fromStoreId: string;
  toStoreId: string;
  status: TransferStatus;
  totalCostCop?: number;
  totalPriceCop?: number;
  items: TransferItem[];
}
