import { AdditionCatalogItem } from '../../entities/Addition';

export interface IAdditionCatalogRepository {
  getByFormatId(formatId: string): Promise<AdditionCatalogItem[]>;
  getByFormatIds(formatIds: string[]): Promise<AdditionCatalogItem[]>;
  create(data: Omit<AdditionCatalogItem, 'id'>): Promise<AdditionCatalogItem>;
  update(id: string, updates: Partial<Omit<AdditionCatalogItem, 'id'>>): Promise<void>;
  delete(id: string): Promise<void>;
}
