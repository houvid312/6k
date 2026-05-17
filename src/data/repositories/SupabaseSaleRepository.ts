import { supabase } from '../../lib/supabase';
import { Sale, SaleItem, SaleItemAddition } from '../../domain/entities';
import { ISaleRepository, DailySummary } from '../../domain/interfaces/repositories';
import { PaymentMethod } from '../../domain/enums';
import { colombiaDateRangeToUtc } from '../../utils/dates';

interface SaleRow {
  id: string;
  created_at: string;
  store_id: string;
  worker_id: string | null;
  total_portions: number;
  total_amount: number;
  packaging_total: number | null;
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
  additions_total: number;
  packaging_supply_id: string | null;
  packaging_label: string | null;
  packaging_unit_price: number | null;
  packaging_quantity: number | null;
  packaging_total: number | null;
}

interface SaleItemAdditionRow {
  id: string;
  sale_item_id: string;
  addition_catalog_id: string;
  supply_id: string;
  name: string;
  price: number;
  grams: number;
  quantity: number;
}

function saleItemAdditionRowToEntity(row: SaleItemAdditionRow): SaleItemAddition {
  return {
    additionCatalogId: row.addition_catalog_id,
    supplyId: row.supply_id,
    name: row.name,
    price: row.price,
    grams: row.grams,
    quantity: row.quantity,
  };
}

function saleItemRowToEntity(row: SaleItemRow, additions?: SaleItemAddition[]): SaleItem {
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
    additions: additions && additions.length > 0 ? additions : undefined,
    additionsTotal: row.additions_total || undefined,
    packagingSupplyId: row.packaging_supply_id ?? undefined,
    packagingLabel: row.packaging_label ?? undefined,
    packagingUnitPrice: row.packaging_unit_price ?? 0,
    packagingQuantity: row.packaging_quantity ?? 0,
    packagingTotal: row.packaging_total ?? 0,
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
    packagingTotal: row.packaging_total ?? 0,
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
    const { fromUtc, toUtc } = colombiaDateRangeToUtc(from, to);

    const { data, error } = await supabase
      .from('sales')
      .select('*, workers(name)')
      .eq('store_id', storeId)
      .gte('created_at', fromUtc)
      .lte('created_at', toUtc)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return this.hydrateSales(data as SaleRow[]);
  }

  async getUnpaid(storeId: string): Promise<Sale[]> {
    // Get sales that are not fully resolved (unpaid OR not dispatched)
    const { data, error } = await supabase
      .from('sales')
      .select('*, workers(name)')
      .eq('store_id', storeId)
      .or('is_paid.eq.false,is_dispatched.eq.false')
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

  async updatePaymentMethod(saleId: string, paymentMethod: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .update({ payment_method: paymentMethod })
      .eq('id', saleId);
    if (error) throw error;
  }

  async markAsUnpaid(saleId: string): Promise<void> {
    const { data, error } = await supabase
      .from('sales')
      .update({ is_paid: false })
      .eq('id', saleId)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`No se pudo actualizar la venta ${saleId}.`);
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
        packaging_total: sale.packagingTotal ?? 0,
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
      additions_total: item.additionsTotal ?? 0,
      packaging_supply_id: item.packagingSupplyId ?? null,
      packaging_label: item.packagingLabel ?? null,
      packaging_unit_price: item.packagingUnitPrice ?? 0,
      packaging_quantity: item.packagingQuantity ?? 0,
      packaging_total: item.packagingTotal ?? 0,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from('sale_items')
      .insert(itemRows)
      .select('id');
    if (itemsError) throw itemsError;

    // Insertar adiciones por cada sale_item
    if (insertedItems) {
      for (let i = 0; i < insertedItems.length; i++) {
        const additions = sale.items[i].additions ?? [];
        if (additions.length > 0) {
          const additionRows = additions.map((a) => ({
            sale_item_id: insertedItems[i].id,
            addition_catalog_id: a.additionCatalogId,
            supply_id: a.supplyId,
            name: a.name,
            price: a.price,
            grams: a.grams,
            quantity: a.quantity,
          }));
          const { error: addError } = await supabase.from('sale_item_additions').insert(additionRows);
          if (addError) {
            console.error('Error insertando adiciones:', addError);
          }
        }
      }
    }

    // Descontar inventario ahora que los sale_items y adiciones ya existen
    const { error: deductError } = await supabase.rpc('deduct_inventory_for_sale', {
      p_sale_id: saleRow.id,
    });
    if (deductError) {
      console.error('Error descontando inventario:', deductError);
      // No lanzar error para no bloquear la venta si falla el descuento
    }

    return this.getById(saleRow.id) as Promise<Sale>;
  }

  async update(sale: Sale): Promise<Sale> {
    const itemPayload = sale.items.map((item) => ({
      product_id: item.productId,
      size: item.size ?? null,
      format_id: item.formatId ?? null,
      format_name: item.formatName ?? null,
      quantity: item.quantity,
      portions: item.portions,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
      additions_total: item.additionsTotal ?? 0,
      packaging_supply_id: item.packagingSupplyId ?? null,
      packaging_label: item.packagingLabel ?? null,
      packaging_unit_price: item.packagingUnitPrice ?? 0,
      packaging_quantity: item.packagingQuantity ?? 0,
      packaging_total: item.packagingTotal ?? 0,
      additions: (item.additions ?? []).map((addition) => ({
        addition_catalog_id: addition.additionCatalogId,
        supply_id: addition.supplyId,
        name: addition.name,
        price: addition.price,
        grams: addition.grams,
        quantity: addition.quantity,
      })),
    }));

    const { error } = await supabase.rpc('replace_pending_sale_order', {
      p_sale_id: sale.id,
      p_payment_method: sale.paymentMethod,
      p_total_portions: sale.totalPortions,
      p_total_amount: sale.totalAmount,
      p_packaging_total: sale.packagingTotal ?? 0,
      p_cash_amount: sale.cashAmount,
      p_bank_amount: sale.bankAmount,
      p_observations: sale.observations ?? '',
      p_is_paid: sale.isPaid,
      p_customer_note: sale.customerNote ?? '',
      p_packaging_supply_id: sale.packagingSupplyId ?? null,
      p_items: itemPayload,
    });

    if (error) throw error;

    const updated = await this.getById(sale.id);
    if (!updated) {
      throw new Error(`No se pudo cargar la venta actualizada ${sale.id}.`);
    }
    return updated;
  }

  async getDailySummary(storeId: string, date: string): Promise<DailySummary> {
    const { fromUtc, toUtc } = colombiaDateRangeToUtc(date, date);

    const { data, error } = await supabase
      .from('sales')
      .select('total_portions, total_amount, cash_amount, bank_amount')
      .eq('store_id', storeId)
      .gte('created_at', fromUtc)
      .lte('created_at', toUtc);
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

    const itemIds = (data as SaleItemRow[]).map((r) => r.id);
    const additionsByItem = await this.fetchAdditionsForItems(itemIds);

    return (data as SaleItemRow[]).map((row) =>
      saleItemRowToEntity(row, additionsByItem.get(row.id)),
    );
  }

  private async fetchAdditionsForItems(itemIds: string[]): Promise<Map<string, SaleItemAddition[]>> {
    const result = new Map<string, SaleItemAddition[]>();
    if (itemIds.length === 0) return result;

    const { data, error } = await supabase
      .from('sale_item_additions')
      .select('*')
      .in('sale_item_id', itemIds);
    if (error) return result; // No bloquear si falla

    for (const row of data as SaleItemAdditionRow[]) {
      const additions = result.get(row.sale_item_id) ?? [];
      additions.push(saleItemAdditionRowToEntity(row));
      result.set(row.sale_item_id, additions);
    }
    return result;
  }

  private async hydrateSales(rows: SaleRow[]): Promise<Sale[]> {
    if (rows.length === 0) return [];

    const saleIds = rows.map((r) => r.id);
    const { data: itemData, error: itemError } = await supabase
      .from('sale_items')
      .select('*')
      .in('sale_id', saleIds);
    if (itemError) throw itemError;

    const allItemIds = (itemData as SaleItemRow[]).map((r) => r.id);
    const additionsByItem = await this.fetchAdditionsForItems(allItemIds);

    const itemsBySale = new Map<string, SaleItem[]>();
    for (const row of itemData as SaleItemRow[]) {
      const items = itemsBySale.get(row.sale_id) ?? [];
      items.push(saleItemRowToEntity(row, additionsByItem.get(row.id)));
      itemsBySale.set(row.sale_id, items);
    }

    return rows.map((r) => saleRowToEntity(r, itemsBySale.get(r.id) ?? []));
  }
}
