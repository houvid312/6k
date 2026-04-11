import { ProductFormat } from '../../entities/ProductFormat';

export interface IProductFormatRepository {
  getByProductId(productId: string): Promise<ProductFormat[]>;
  getByProductIds(productIds: string[]): Promise<ProductFormat[]>;
  create(productId: string, data: Omit<ProductFormat, 'id' | 'productId'>): Promise<ProductFormat>;
  update(id: string, updates: Partial<Omit<ProductFormat, 'id' | 'productId'>>): Promise<void>;
  delete(id: string): Promise<void>;
}
