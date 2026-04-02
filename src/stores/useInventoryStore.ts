import { create } from 'zustand';
import { InventoryItem } from '../domain/entities';
import { InventoryLevel } from '../domain/enums';
import { container } from '../di/container';

interface InventoryState {
  inventoryItems: InventoryItem[];
  loading: boolean;
  fetchInventory: (storeId: string, level?: InventoryLevel) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set) => ({
  inventoryItems: [],
  loading: false,

  fetchInventory: async (storeId: string, level?: InventoryLevel) => {
    set({ loading: true });
    try {
      const items = await container.inventoryRepo.getByStore(
        storeId,
        level ?? InventoryLevel.STORE,
      );
      set({ inventoryItems: items });
    } finally {
      set({ loading: false });
    }
  },
}));
