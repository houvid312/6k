import { supabase } from '../../lib/supabase';
import { ChecklistItem, ChecklistEntry } from '../../domain/entities/ChecklistItem';
import { IChecklistRepository } from '../../domain/interfaces/repositories/IChecklistRepository';

interface ChecklistItemRow {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

interface ChecklistEntryRow {
  id: string;
  cash_closing_id: string;
  checklist_item_id: string;
  status: string;
  notes: string;
}

function toItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function toEntry(row: ChecklistEntryRow): ChecklistEntry {
  return {
    id: row.id,
    cashClosingId: row.cash_closing_id,
    checklistItemId: row.checklist_item_id,
    status: row.status as ChecklistEntry['status'],
    notes: row.notes,
  };
}

export class SupabaseChecklistRepository implements IChecklistRepository {
  async getActiveItems(): Promise<ChecklistItem[]> {
    const { data, error } = await supabase
      .from('closing_checklist_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return (data as ChecklistItemRow[]).map(toItem);
  }

  async getEntriesByClosingId(cashClosingId: string): Promise<ChecklistEntry[]> {
    const { data, error } = await supabase
      .from('closing_checklist_entries')
      .select('*')
      .eq('cash_closing_id', cashClosingId);
    if (error) throw error;
    return (data as ChecklistEntryRow[]).map(toEntry);
  }

  async saveEntries(entries: Omit<ChecklistEntry, 'id'>[]): Promise<void> {
    if (entries.length === 0) return;
    const rows = entries.map((e) => ({
      cash_closing_id: e.cashClosingId,
      checklist_item_id: e.checklistItemId,
      status: e.status,
      notes: e.notes,
    }));
    const { error } = await supabase
      .from('closing_checklist_entries')
      .upsert(rows, { onConflict: 'cash_closing_id,checklist_item_id' });
    if (error) throw error;
  }
}
