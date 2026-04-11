import { supabase } from '../../lib/supabase';
import { Sale, SaleItem } from '../../domain/entities';
import { ISaleRepository, DailySummary } from '../../domain/interfaces/repositories';
import { PaymentMethod } from '../../domain/enums';

interface SaleRow {
  id: string;
  created_at: string;
  store_id: string;
  worker_id: string | null;
  total_portions: number;
  total_amount: number;
  cash_amount: number;
  bank_amount: number;
  payment_method: string;
  observations: string | null;
  is_paid: boolean;
  is_dispatched: boolean;
  customer_note: string | null;
  packaging_supply_id: string | null;
  workers?: { name: string } | null;
}

const LEGACY_SIZE_LABELS: Record<string, string> = {
  INDIVIDUAL: 'Individual',
  DIAMANTE: 'Diamante',
  MEDIANA: 'Mediana',
  FAMILIAR: 'Familiar',
};

interface SaleItemRow {
  id: string;
  sale_id: string;
  product_id: string;
  size: string | null;
  format_id: string | null;
  format_name: string | null;
  quantity: number;
  portions: number;
  unit_price: number;
  subtotal: number;
}

function saleItemRowToEntity(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    productId: row.product_id,
    size: row.size ? (row.size as SaleItem['size']) : undefined,
    formatId: row.format_id ?? undefined,
    formatName: row.format_name ?? (row.size ? (LEGACY_SIZE_LABELS[row.size] ?? row.size) : ''),
    quantity: row.quantity,
    portions: row.portions,
    unitPrice: row.unit_price,
    subtotal: row.subtotal,
  };
}

function saleRowToEntity(row: SaleRow, items: SaleItem[]): Sale {
  return {
    id: row.id,
    timestamp: row.created_at,
    storeId: row.store_id,
    items,
    totalPortions: row.total_portions,
    totalAmount: row.total_amount,
    cashAmount: row.cash_amount,
    bankAmount: row.bank_amount,
    paymentMethod: row.payment_method as PaymentMethod,
    observations: row.observations ?? undefined,
    isPaid: row.is_paid ?? true,
    isDispatched: row.is_dispatched ?? false,
    customerNote: row.customer_note ?? undefined,
    workerName: row.workers?.name ?? undefined,
    packagingSupplyId: row.packaging_supply_id ?? undefined,
  };
}

export class SupabaseSaleRepository implements ISaleRepository {
  async getAll(storeId?: string): Promise<Sale[]> {
    let query = supabase.from('sales').select('*');
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return this.hydrateSales(data as SaleRow[]);
  }

  async getById(id: string): Promise<Sale | null> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    const row = data as SaleRow;
    const items = await this.fetchSaleItems(row.id);
    return saleRowToEntity(row, items);
  }

  async getByDateRange(storeId: string, from: string, to: string): Promise<Sale[]> {
    // Append time boundaries if only date strings (YYYY-MM-DD) are passed
    const fromTs = from.includes('T') ? from : `${from}T00:00:00`;
    const toTs = to.includes('T') ? to : `${to}T23:59:59`;

    const { data, error } = await supabase
      .from('sales')
      .select('*, workers(name)')
      .eq('store_id', storeId)
      .gte('created_at', fromTs)
      .lte('created_at', toTs)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return this.hydrateSales(data as SaleRow[]);
  }

  async getUnpaid(storeId: string): Promise<Sale[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*, workers(name)')
      .eq('store_id', storeId)
      .eq('is_paid', false)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return this.hydrateSales(data as SaleRow[]);
  }

  async markAsPaid(saleId: string): Promise<void> {
    const { data, error, count } = await supabase
      .from('sales')
      .update({ is_paid: true })
      .eq('id', saleId)
      .select('id, is_paid');

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        `No se pudo actualizar la venta ${saleId}. Verifica permisos RLS o que el registro exista.`
      );
    }
  }

  async markAsDispatched(saleId: string): Promise<void> {
    const { data, error } = await supabase
      .from('sales')
      .update({ is_dispatched: true })
      .eq('id', saleId)
      .select('id, is_dispatched');

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        `No se pudo actualizar la venta ${saleId}. Verifica permisos RLS o que el registro exista.`
      );
    }
  }

  async delete(saleId: string): Promise<void> {
    // sale_items are deleted by CASCADE
    const { error } = await supabase.from('sales').delete().eq('id', saleId);
    if (error) throw error;
  }

  async create(sale: Omit<Sale, 'id'>): Promise<Sale> {
    // Get current worker_id from auth session
    let workerId: string | null = null;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .single();
      if (worker) workerId = worker.id;
    }

    const { data, error } = await supabase
      .from('sales')
      .insert({
        store_id: sale.storeId,
        worker_id: workerId,
        payment_method: sale.paymentMethod,
        total_portions: sale.totalPortions,
        total_amount: sale.totalAmount,
        cash_amount: sale.cashAmount,
        bank_amount: sale.bankAmount,
        observations: sale.observations ?? null,
        is_paid: sale.isPaid ?? true,
        is_dispatched: sale.isDispatched ?? false,
        customer_note: sale.customerNote ?? null,
        packaging_supply_id: sale.packagingSupplyId ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    const saleRow = data as SaleRow;

    const itemRows = sale.items.map((item) => ({
      sale_id: saleRow.id,
      product_id: item.productId,
      size: item.size ?? null,
      format_id: item.formatId ?? null,
      format_name: item.formatName ?? null,
      quantity: item.quantity,
      portions: item.portions,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
    }));

    const { error: itemsError } = await supabase.from('sale_items').insert(itemRows);
    if (itemsError) throw itemsError;

    // Descontar inventario ahora que los sale_items ya existen
    const { error: deductError } = await supabase.rpc('deduct_inventory_for_sale', {
      p_sale_id: saleRow.id,
    });
    if (deductError) {
      console.error('Error descontando inventario:', deductError);
      // No lanzar error para no bloquear la venta si falla el descuento
    }

    return this.getById(saleRow.id) as Promise<Sale>;
  }

  async getDailySummary(storeId: string, date: string): Promise<DailySummary> {
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const { data, error } = await supabase
      .from('sales')
      .select('total_portions, total_amount, cash_amount, bank_amount')
      .eq('store_id', storeId)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);
    if (error) throw error;

    const rows = data as Pick<SaleRow, 'total_portions' | 'total_amount' | 'cash_amount' | 'bank_amount'>[];
    return {
      totalPortions: rows.reduce((sum, r) => sum + r.total_portions, 0),
      totalAmount: rows.reduce((sum, r) => sum + r.total_amount, 0),
      totalCashAmount: rows.reduce((sum, r) => sum + r.cash_amount, 0),
      totalBankAmount: rows.reduce((sum, r) => sum + r.bank_amount, 0),
      salesCount: rows.length,
    };
  }

  private async fetchSaleItems(saleId: string): Promise<SaleItem[]> {
    const { data, error } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId);
    if (error) throw error;
    return (data as SaleItemRow[]).map(saleItemRowToEntity);
  }

  private async hydrateSales(rows: SaleRow[]): Promise<Sale[]> {
    if (rows.length === 0) return [];

    const saleIds = rows.map((r) => r.id);
    const { data: itemData, error: itemError } = await supabase
      .from('sale_items')
      .select('*')
      .in('sale_id', saleIds);
    if (itemError) throw itemError;

    const itemsBySale = new Map<string, SaleItem[]>();
    for (const row of itemData as SaleItemRow[]) {
      const items = itemsBySale.get(row.sale_id) ?? [];
      items.push(saleItemRowToEntity(row));
      itemsBySale.set(row.sale_id, items);
    }

    return rows.map((r) => saleRowToEntity(r, itemsBySale.get(r.id) ?? []));
  }
}
