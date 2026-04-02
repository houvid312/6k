import { PhysicalCount } from '../../entities/PhysicalCount';

export interface IPhysicalCountRepository {
  create(count: Omit<PhysicalCount, 'id' | 'timestamp'>): Promise<PhysicalCount>;
  getByStore(storeId: string): Promise<PhysicalCount[]>;
  getLatest(storeId: string): Promise<PhysicalCount | null>;
}
