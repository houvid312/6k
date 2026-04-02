export interface QueryFilter {
  field: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in';
  value: unknown;
}

export interface IDataSource {
  getAll<T>(collection: string): Promise<T[]>;
  getById<T>(collection: string, id: string): Promise<T | null>;
  query<T>(collection: string, filters: QueryFilter[]): Promise<T[]>;
  create<T extends { id: string }>(collection: string, data: T): Promise<T>;
  update<T extends { id: string }>(collection: string, id: string, data: Partial<T>): Promise<T>;
  delete(collection: string, id: string): Promise<void>;
}
