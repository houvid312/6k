import { supabase } from '../../lib/supabase';
import { Transfer, TransferItem } from '../../domain/entities';
import { ITransferRepository } from '../../domain/interfaces/repositories';
import { TransferStatus } from '../../domain/enums';

// --- Row types ---

interface TransferRow {
  id: string;
  order_date: string;
  shipping_date: string;
  from_store_id: string;
  to_store_id: string;
  status: string;
}

interface TransferItemRow {
  id: string;
  transfer_id: string;
  supply_id: string;
  target_grams: number;
  current_inventory_grams: number;
  bags_to_send: number;
}

// --- Mappers ---

function transferItemRowToEntity(row: TransferItemRow): TransferItem {
  return {
    supplyId: row.supply_id,
    targetGrams: row.target_grams,
    currentInventoryGrams: row.current_inventory_grams,
    bagsToSend: row.bags_to_send,
  };
}

function transferRowToEntity(row: TransferRow, items: TransferItem[]): Transfer {
  return {
    id: row.id,
    orderDate: row.order_date,
    shippingDate: row.shipping_date,
    fromStoreId: row.from_store_id,
    toStoreId: row.to_store_id,
    status: row.status as TransferStatus,
    items,
  };
}

// --- Repository ---

export class SupabaseTransferRepository implements ITransferRepository {
  async getAll(): Promise<Transfer[]> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .order('order_date', { ascending: false });
    if (error) throw error;
    return this.hydrateTransfers(data as TransferRow[]);
  }

  async getByStore(storeId: string): Promise<Transfer[]> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .or(`from_store_id.eq.${storeId},to_store_id.eq.${storeId}`)
      .order('order_date', { ascending: false });
    if (error) throw error;
    return this.hydrateTransfers(data as TransferRow[]);
  }

  async getReceivedByDestination(
    toStoreId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Transfer[]> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('to_store_id', toStoreId)
      .eq('status', 'RECEIVED')
      .gte('order_date', fromDate)
      .lte('order_date', toDate + 'T23:59:59');
    if (error) throw error;
    return this.hydrateTransfers(data as TransferRow[]);
  }

  async create(transfer: Omit<Transfer, 'id'>): Promise<Transfer> {
    const { data, error } = await supabase
      .from('transfers')
      .insert({
        order_date: transfer.orderDate,
        shipping_date: transfer.shippingDate || null,
        from_store_id: transfer.fromStoreId,
        to_store_id: transfer.toStoreId,
        status: transfer.status,
      })
      .select()
      .single();
    if (error) throw error;

    const row = data as TransferRow;

    const itemRows = transfer.items.map((item) => ({
      transfer_id: row.id,
      supply_id: item.supplyId,
      target_grams: item.targetGrams,
      current_inventory_grams: item.currentInventoryGrams,
      bags_to_send: item.bagsToSend,
    }));

    const { error: itemsError } = await supabase
      .from('transfer_items')
      .insert(itemRows);
    if (itemsError) throw itemsError;

    return this.getById(row.id) as Promise<Transfer>;
  }

  async updateStatus(id: string, status: TransferStatus): Promise<Transfer> {
    const { data, error } = await supabase
      .from('transfers')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    const row = data as TransferRow;
    const items = await this.fetchTransferItems(row.id);
    return transferRowToEntity(row, items);
  }

  // --- Private helpers ---

  private async getById(id: string): Promise<Transfer | null> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    const row = data as TransferRow;
    const items = await this.fetchTransferItems(row.id);
    return transferRowToEntity(row, items);
  }

  private async fetchTransferItems(transferId: string): Promise<TransferItem[]> {
    const { data, error } = await supabase
      .from('transfer_items')
      .select('*')
      .eq('transfer_id', transferId);
    if (error) throw error;
    return (data as TransferItemRow[]).map(transferItemRowToEntity);
  }

  private async hydrateTransfers(rows: TransferRow[]): Promise<Transfer[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const { data: itemData, error: itemError } = await supabase
      .from('transfer_items')
      .select('*')
      .in('transfer_id', ids);
    if (itemError) throw itemError;

    const itemsByTransfer = new Map<string, TransferItem[]>();
    for (const row of itemData as TransferItemRow[]) {
      const list = itemsByTransfer.get(row.transfer_id) ?? [];
      list.push(transferItemRowToEntity(row));
      itemsByTransfer.set(row.transfer_id, list);
    }

    return rows.map((r) =>
      transferRowToEntity(r, itemsByTransfer.get(r.id) ?? []),
    );
  }
}
