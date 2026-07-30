import { supabase } from '../../lib/supabase';
import { Customer } from '../../domain/entities';
import { ICustomerRepository } from '../../domain/interfaces/repositories';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

function toEntity(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    isActive: row.is_active,
  };
}

function toRow(customer: Omit<Customer, 'id' | 'isActive'>): Record<string, unknown> {
  return {
    name: customer.name,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
  };
}

export class SupabaseCustomerRepository implements ICustomerRepository {
  async getAll(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data as CustomerRow[]).map(toEntity);
  }

  async getById(id: string): Promise<Customer | null> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toEntity(data as CustomerRow);
  }

  async create(customer: Omit<Customer, 'id' | 'isActive'>): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .insert(toRow(customer))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CustomerRow);
  }

  async update(customer: Customer): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .update({
        name: customer.name,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        is_active: customer.isActive,
      })
      .eq('id', customer.id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as CustomerRow);
  }
}
