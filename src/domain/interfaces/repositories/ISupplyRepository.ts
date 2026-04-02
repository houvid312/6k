import { Supply } from '../../entities/Supply';

export interface ISupplyRepository {
  getAll(): Promise<Supply[]>;
  getById(id: string): Promise<Supply | null>;
}
