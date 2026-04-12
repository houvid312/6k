import { InventoryLevel } from '../enums/InventoryLevel';
import { WriteoffStatus } from '../enums/WriteoffStatus';
import { WriteoffReason } from '../enums/WriteoffReason';

export interface InventoryWriteoff {
  id: string;
  storeId: string;
  supplyId: string;
  productId?: string;   // V8: optional product for prepared-portion writeoffs
  level: InventoryLevel;
  quantityGrams: number;
  reason: WriteoffReason;
  notes: string;
  status: WriteoffStatus;
  requestedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
