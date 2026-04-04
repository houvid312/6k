import { create } from 'zustand';
import { Product, Supply, Worker } from '../domain/entities';
import { container } from '../di/container';

interface MasterDataState {
  supplies: Supply[];
  products: Product[];
  workers: Worker[];
  loaded: boolean;
  loading: boolean;
  lastLoadedAt: number | null;

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

  loadMasterData: async () => {
    if (get().loaded) return;
    const state = get();
    if (state.loading) return;
    set({ loading: true });
    try {
      const [supplies, products, workers] = await Promise.all([
        container.supplyRepo.getAll(),
        container.productRepo.getAll(),
        container.workerRepo.getAll(),
      ]);
      set({ supplies, products, workers, loaded: true, lastLoadedAt: Date.now() });
    } finally {
      set({ loading: false });
    }
  },

  refreshMasterData: async () => {
    set({ loading: true });
    try {
      const [supplies, products, workers] = await Promise.all([
        container.supplyRepo.getAll(),
        container.productRepo.getAll(),
        container.workerRepo.getAll(),
      ]);
      set({ supplies, products, workers, loaded: true, lastLoadedAt: Date.now() });
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
