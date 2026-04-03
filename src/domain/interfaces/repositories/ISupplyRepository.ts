import { Supply } from '../../entities/Supply';

export interface ISupplyRepository {
  getAll(): Promise<Supply[]>;
  getById(id: string): Promise<Supply | null>;
  create(supply: Omit<Supply, 'id'>): Promise<Supply>;
  update(id: string, data: Partial<Omit<Supply, 'id'>>): Promise<Supply>;
}
