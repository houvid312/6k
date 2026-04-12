import { ChecklistItem, ChecklistEntry } from '../../entities/ChecklistItem';

export interface IChecklistRepository {
  getActiveItems(): Promise<ChecklistItem[]>;
  getEntriesByClosingId(cashClosingId: string): Promise<ChecklistEntry[]>;
  saveEntries(entries: Omit<ChecklistEntry, 'id'>[]): Promise<void>;
}
