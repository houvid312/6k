import { create } from 'zustand';
import { Store } from '../domain/entities';
import { UserRole } from '../domain/enums';
import { supabase } from '../lib/supabase';

interface AppState {
  selectedStoreId: string;
  stores: Store[];
  userRole: UserRole;
  userName: string;
  userId: string;
  isAuthenticated: boolean;
  storesLoaded: boolean;
  setSelectedStore: (storeId: string) => void;
  login: (userId: string, name: string, role: UserRole) => void;
  logout: () => void;
  loadStores: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  selectedStoreId: '',
  stores: [],
  userRole: UserRole.COLABORADOR,
  userName: '',
  userId: '',
  isAuthenticated: false,
  storesLoaded: false,
  setSelectedStore: (storeId: string) => set({ selectedStoreId: storeId }),
  login: (userId: string, name: string, role: UserRole) =>
    set({ userId, userName: name, userRole: role, isAuthenticated: true }),
  logout: () =>
    set({ userId: '', userName: '', userRole: UserRole.COLABORADOR, isAuthenticated: false, selectedStoreId: '' }),
  loadStores: async () => {
    if (get().storesLoaded && get().selectedStoreId) return;
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true);

    if (error || !data) return;

    const stores: Store[] = data.map((s) => ({
      id: s.id,
      name: s.name,
      isProductionCenter: s.is_production_center,
      address: s.address ?? undefined,
      isActive: s.is_active,
    }));

    const defaultStore = stores.find((s) => !s.isProductionCenter) ?? stores[0];
    set({
      stores,
      storesLoaded: true,
      selectedStoreId: get().selectedStoreId || defaultStore?.id || '',
    });
  },
}));
