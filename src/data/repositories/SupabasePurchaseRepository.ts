import { supabase } from '../../lib/supabase';
import { Purchase } from '../../domain/entities';
import { IPurchaseRepository } from '../../domain/interfaces/repositories';
import { PaymentMethod } from '../../domain/enums';

interface PurchaseRow {
  id: string;
  created_at: string;
  supply_id: string;
  quantity_grams: number;
  price_cop: number;
  supplier: string;
  payment_method: string;
}

function toEntity(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    timestamp: row.created_at,
    supplyId: row.supply_id,
    quantityGrams: row.quantity_grams,
    priceCOP: row.price_cop,
    supplier: row.supplier,
    paymentMethod: row.payment_method as PaymentMethod,
  };
}

function toRow(purchase: Omit<Purchase, 'id'>): Record<string, unknown> {
  return {
    supply_id: purchase.supplyId,
    quantity_grams: purchase.quantityGrams,
    price_cop: purchase.priceCOP,
    supplier: purchase.supplier,
    payment_method: purchase.paymentMethod,
  };
}

export class SupabasePurchaseRepository implements IPurchaseRepository {
  async getAll(storeId?: string): Promise<Purchase[]> {
    let query = supabase.from('purchases').select('*');
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return (data as PurchaseRow[]).map(toEntity);
  }

  async create(purchase: Omit<Purchase, 'id'>): Promise<Purchase> {
    const { data, error } = await supabase
      .from('purchases')
      .insert(toRow(purchase))
      .select()
      .single();
    if (error) throw error;
    return toEntity(data as PurchaseRow);
  }

  async getByDateRange(from: string, to: string): Promise<Purchase[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as PurchaseRow[]).map(toEntity);
  }
}
