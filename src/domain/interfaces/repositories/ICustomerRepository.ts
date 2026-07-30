import { Customer } from '../../entities/Customer';

export interface ICustomerRepository {
  getAll(): Promise<Customer[]>;
  getById(id: string): Promise<Customer | null>;
  create(customer: Omit<Customer, 'id' | 'isActive'>): Promise<Customer>;
  update(customer: Customer): Promise<Customer>;
}
