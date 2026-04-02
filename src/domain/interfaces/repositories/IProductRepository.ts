import { Product } from '../../entities/Product';

export interface IProductRepository {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  getByCategory(category: string): Promise<Product[]>;
}
