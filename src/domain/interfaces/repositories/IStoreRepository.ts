import { Store } from '../../entities/Store';

export interface IStoreRepository {
  getAll(): Promise<Store[]>;
  getById(id: string): Promise<Store | null>;
  getProductionCenter(): Promise<Store | null>;
}
