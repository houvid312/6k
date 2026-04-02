import { supabase } from '../../lib/supabase';
import { Expense } from '../../domain/entities';
import { IExpenseRepository } from '../../domain/interfaces/repositories';
import { PaymentMethod } from '../../domain/enums';

// --- Row type ---

interface ExpenseRow {
  id: string;
  date: string;
  store_id: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
}

// --- Mappers ---

function toEntity(row: ExpenseRow): Expense {
  return {
    id: row.id,
    date: row.date,
    storeId: row.store_id,
    category: row.category,
    description: row.description,
    amount: row.amount,
    paymentMethod: row.payment_method as PaymentMethod,
  };
}

function toRow(expense: Omit<Expense, 'id'>): Record<string, unknown> {
  return {
    date: expense.date,
    store_id: expense.storeId,
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    payment_method: expense.paymentMethod,
  };
}

// --- Repository ---

export class SupabaseExpenseRepository implements IExpenseRepository {
  async getAll(storeId?: string): Promise<Expense[]> {
    let query = supabase.from('expenses').select('*');
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return (data as ExpenseRow[]).map(toEntity);
  }

  async create(expense: Omit<Expense, 'id'>): Promise<Expense> {
    const { data, error } = await supabase
      .from('expenses')
      .insert(toRow(expense))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as ExpenseRow);
  }

  async getByDateRange(
    storeId: string,
    from: string,
    to: string,
  ): Promise<Expense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data as ExpenseRow[]).map(toEntity);
  }
}
