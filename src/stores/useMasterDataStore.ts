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

async function loadMasterDataSlices(role: UserRole, current: MasterDataState): Promise<Partial<MasterDataState>> {
  const [suppliesResult, productsResult, workersResult] = await Promise.allSettled([
    container.supplyRepo.getAll(role === UserRole.ADMIN),
    container.productRepo.getAll(),
    container.workerRepo.getAll(),
  ]);

  if (__DEV__) {
    const results = [
      { name: 'insumos', result: suppliesResult },
      { name: 'productos', result: productsResult },
      { name: 'trabajadores', result: workersResult },
    ];

    for (const { name, result } of results) {
      if (result.status === 'rejected') {
        console.warn(`Error cargando ${name}:`, result.reason);
      }
    }
  }

  const hasCatalogData =
    suppliesResult.status === 'fulfilled' &&
    productsResult.status === 'fulfilled';
  const hasAnyData =
    suppliesResult.status === 'fulfilled' ||
    productsResult.status === 'fulfilled' ||
    workersResult.status === 'fulfilled';

  return {
    supplies: suppliesResult.status === 'fulfilled' ? suppliesResult.value : current.supplies,
    products: productsResult.status === 'fulfilled' ? productsResult.value : current.products,
    workers: workersResult.status === 'fulfilled' ? workersResult.value : current.workers,
    loaded: hasCatalogData,
    loadedForRole: role,
    lastLoadedAt: hasAnyData ? Date.now() : current.lastLoadedAt,
  };
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
      set(await loadMasterDataSlices(role, state));
    } finally {
      set({ loading: false });
    }
  },

  refreshMasterData: async () => {
    const role = useAppStore.getState().userRole;
    set({ loading: true });
    try {
      set(await loadMasterDataSlices(role, get()));
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
