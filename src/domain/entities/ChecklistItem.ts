export interface ChecklistItem {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ChecklistEntry {
  id: string;
  cashClosingId: string;
  checklistItemId: string;
  status: 'OK' | 'BAJO' | 'AGOTADO';
  notes: string;
}
