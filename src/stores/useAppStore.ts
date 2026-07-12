import { create } from 'zustand';
import { Store } from '../domain/entities';
import { UserRole } from '../domain/enums';
import { supabase } from '../lib/supabase';

interface AppState {
  selectedStoreId: string;
  stores: Store[];
  storeIds: string[];
  userRole: UserRole;
  userName: string;
  userId: string;
  isAuthenticated: boolean;
  storesLoaded: boolean;
  setSelectedStore: (storeId: string) => void;
  login: (userId: string, name: string, role: UserRole, storeIds?: string[]) => void;
  logout: () => void;
  loadStores: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  selectedStoreId: '',
  stores: [],
  storeIds: [],
  userRole: UserRole.VENDEDOR,
  userName: '',
  userId: '',
  isAuthenticated: false,
  storesLoaded: false,
  setSelectedStore: (storeId: string) => set({ selectedStoreId: storeId }),
  login: (userId: string, name: string, role: UserRole, storeIds?: string[]) =>
    set({ userId, userName: name, userRole: role, storeIds: storeIds ?? [], isAuthenticated: true }),
  logout: () =>
    set({ userId: '', userName: '', userRole: UserRole.VENDEDOR, storeIds: [], isAuthenticated: false, selectedStoreId: '' }),
  loadStores: async () => {
    if (get().storesLoaded && get().selectedStoreId) return;
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true);

    if (error || !data) return;

    let storesList: Store[] = data.map((s) => ({
      id: s.id,
      name: s.name,
      isProductionCenter: s.is_production_center,
      address: s.address ?? undefined,
      isActive: s.is_active,
    }));

    const role = get().userRole;
    const assignedIds = get().storeIds;

    // Filtrado de tiendas asignadas si el rol es local
    if ([UserRole.ADMIN_LOCAL, UserRole.VENDEDOR, UserRole.RODY].includes(role) && assignedIds.length > 0) {
      storesList = storesList.filter((s) => assignedIds.includes(s.id));
    }

    const isGlobalRole = [UserRole.GERENTE, UserRole.PREPARADOR].includes(role);
    const defaultStore = isGlobalRole
      ? (storesList.find((s) => s.isProductionCenter) ?? storesList[0])
      : (storesList.find((s) => !s.isProductionCenter) ?? storesList[0]);

    set({
      stores: storesList,
      storesLoaded: true,
      selectedStoreId: get().selectedStoreId || defaultStore?.id || '',
    });
  },
}));
