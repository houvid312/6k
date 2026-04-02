import { TransferStatus } from '../enums/TransferStatus';

export interface TransferItem {
  supplyId: string;
  targetGrams: number;
  currentInventoryGrams: number;
  bagsToSend: number;
}

export interface Transfer {
  id: string;
  orderDate: string;
  shippingDate: string;
  fromStoreId: string;
  toStoreId: string;
  status: TransferStatus;
  items: TransferItem[];
}
