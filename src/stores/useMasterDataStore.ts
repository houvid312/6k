import { create } from 'zustand';
import { Product, Supply, Worker } from '../domain/entities';
import { UserRole } from '../domain/enums';
import { container } from '../di/container';
import { useAppStore } from './useAppStore';

interface MasterDataState {
  supplies: Supply[];
  products: Product[];
  workers: Worker[];
  loaded: boolean;
  loading: boolean;
  lastLoadedAt: number | null;
  loadedForRole: UserRole | null;

  loadMasterData: () => Promise<void>;
  refreshMasterData: () => Promise<void>;
  getSupplyName: (id: string) => string;
  getWorkerName: (id: string) => string;
  getProductName: (id: string) => string;
}

export const useMasterDataStore = create<MasterDataState>((set, get) => ({
  supplies: [],
  products: [],
  workers: [],
  loaded: false,
  loading: false,
  lastLoadedAt: null,
  loadedForRole: null,

  loadMasterData: async () => {
    const role = useAppStore.getState().userRole;
    if (get().loaded && get().loadedForRole === role) return;
    const state = get();
    if (state.loading) return;
    set({ loading: true });
    try {
      const [supplies, products, workers] = await Promise.all([
        container.supplyRepo.getAll(role === UserRole.ADMIN),
        container.productRepo.getAll(),
        container.workerRepo.getAll(),
      ]);
      set({ supplies, products, workers, loaded: true, loadedForRole: role, lastLoadedAt: Date.now() });
    } finally {
      set({ loading: false });
    }
  },

  refreshMasterData: async () => {
    const role = useAppStore.getState().userRole;
    set({ loading: true });
    try {
      const [supplies, products, workers] = await Promise.all([
        container.supplyRepo.getAll(role === UserRole.ADMIN),
        container.productRepo.getAll(),
        container.workerRepo.getAll(),
      ]);
      set({ supplies, products, workers, loaded: true, loadedForRole: role, lastLoadedAt: Date.now() });
    } finally {
      set({ loading: false });
    }
  },

  getSupplyName: (id: string) => {
    return get().supplies.find((s) => s.id === id)?.name ?? 'Desconocido';
  },

  getWorkerName: (id: string) => {
    return get().workers.find((w) => w.id === id)?.name ?? '—';
  },

  getProductName: (id: string) => {
    return get().products.find((p) => p.id === id)?.name ?? 'Desconocido';
  },
}));
