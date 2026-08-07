export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  storeId?: string;
  isActive: boolean;
}
