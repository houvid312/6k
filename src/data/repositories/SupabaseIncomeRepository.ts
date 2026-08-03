import { supabase } from '../../lib/supabase';
import { Income } from '../../domain/entities';
import { IIncomeRepository } from '../../domain/interfaces/repositories';
import { PaymentMethod } from '../../domain/enums';

import { colombiaDateRangeToUtc, toISODateTZ } from '../../utils/dates';

// --- Row type ---

interface IncomeRow {
  id: string;
  date: string;
  store_id: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  created_at: string;
}

// --- Mappers ---

function toEntity(row: IncomeRow): Income {
  return {
    id: row.id,
    date: row.date,
    storeId: row.store_id,
    category: row.category,
    description: row.description,
    amount: row.amount,
    paymentMethod: row.payment_method as PaymentMethod,
    createdAt: row.created_at,
  };
}

function toRow(income: Omit<Income, 'id'>): Record<string, unknown> {
  return {
    date: income.date,
    store_id: income.storeId,
    category: income.category,
    description: income.description,
    amount: income.amount,
    payment_method: income.paymentMethod,
  };
}

// --- Repository ---

export class SupabaseIncomeRepository implements IIncomeRepository {
  async getAll(storeId?: string): Promise<Income[]> {
    let query = supabase.from('incomes').select('*');
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return (data as IncomeRow[]).map(toEntity);
  }

  async create(income: Omit<Income, 'id'>): Promise<Income> {
    const { data, error } = await supabase
      .from('incomes')
      .insert(toRow(income))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as IncomeRow);
  }

  async delete(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('incomes')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No se eliminó el ingreso. Puede que no tengas permisos para borrar este registro.');
    }
  }

  async update(id: string, income: Partial<Omit<Income, 'id'>>): Promise<Income> {
    const row: Record<string, unknown> = {};
    if (income.category !== undefined) row.category = income.category;
    if (income.description !== undefined) row.description = income.description;
    if (income.amount !== undefined) row.amount = income.amount;
    if (income.paymentMethod !== undefined) row.payment_method = income.paymentMethod;
    if (income.date !== undefined) row.date = income.date;

    const { data, error } = await supabase
      .from('incomes')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as IncomeRow);
  }

  async getByDateRange(
    storeId: string,
    from: string,
    to: string,
  ): Promise<Income[]> {
    const cleanFrom = from.slice(0, 10);
    const cleanTo = to.slice(0, 10);
    const { fromUtc, toUtc } = colombiaDateRangeToUtc(cleanFrom, cleanTo);

    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('store_id', storeId)
      .or(`and(date.gte.${fromUtc},date.lte.${toUtc}),and(date.gte.${cleanFrom},date.lte.${cleanTo})`)
      .order('date', { ascending: false });

    if (error) throw error;
    const entities = (data as IncomeRow[]).map(toEntity);

    return entities.filter((inc) => {
      if (!inc.date) return false;
      const d = new Date(inc.date);
      if (isNaN(d.getTime())) {
        const datePart = inc.date.slice(0, 10);
        return datePart >= cleanFrom && datePart <= cleanTo;
      }
      const colDate = toISODateTZ(d);
      return colDate >= cleanFrom && colDate <= cleanTo;
    });
  }

  async getById(id: string): Promise<Income | null> {
    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toEntity(data as IncomeRow) : null;
  }
}
