export interface IProductStoreAssignmentRepository {
  getProductIdsByStore(storeId: string): Promise<string[]>;
  setActive(productId: string, storeId: string, isActive: boolean): Promise<void>;
  bulkAssign(productId: string, storeIds: string[]): Promise<void>;
  getAssignmentsByProduct(productId: string): Promise<Array<{ storeId: string; isActive: boolean }>>;
}
