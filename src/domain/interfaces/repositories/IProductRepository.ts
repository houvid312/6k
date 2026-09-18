import { Product, ProductCategory } from '../../entities/Product';

export interface IProductRepository {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  getByCategory(category: string): Promise<Product[]>;
  create(data: { name: string; category: ProductCategory; hasRecipe: boolean; icon?: string }): Promise<Product>;
  update(id: string, updates: Partial<Pick<Product, 'name' | 'category' | 'hasRecipe' | 'isActive' | 'icon'>>): Promise<void>;
}
