import { Store } from '../../entities/Store';

export interface IStoreRepository {
  getAll(): Promise<Store[]>;
  getAllIncludeInactive(): Promise<Store[]>;
  getById(id: string): Promise<Store | null>;
  getProductionCenter(): Promise<Store | null>;
  create(store: Omit<Store, 'id'>): Promise<Store>;
  update(id: string, store: Partial<Store>): Promise<Store>;
  setActive(id: string, isActive: boolean): Promise<void>;
}
