export type ProductCategory = 'PIZZA' | 'BEBIDA' | 'OTRO';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  isActive: boolean;
  hasRecipe: boolean;
}
