import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FlatList, View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Chip, Text, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { InventoryLevelCard } from '../../../src/components/inventario/InventoryLevelCard';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { InventoryLevel, UserRole } from '../../../src/domain/enums';
import { InventorySummaryItem } from '../../../src/services/InventoryService';

interface NavItem {
  icon: string;
  label: string;
  route: string;
}

const ADMIN_PRODUCTION_NAV: NavItem[] = [
  { icon: 'truck', label: 'Traslados', route: '/(tabs)/inventario/traslados' },
  { icon: 'clipboard-check', label: 'Cierre', route: '/(tabs)/inventario/cierre-fisico' },
  { icon: 'alert', label: 'Alertas', route: '/(tabs)/inventario/validaciones' },
  { icon: 'package-variant-remove', label: 'Bajas', route: '/(tabs)/inventario/bajas' },
  { icon: 'book-open-variant', label: 'Recetas', route: '/(tabs)/inventario/recetas' },
  { icon: 'calculator', label: 'Sugerencia', route: '/(tabs)/inventario/sugerencia-envio' },
  { icon: 'chart-bar', label: 'Demanda', route: '/(tabs)/inventario/demanda' },
  { icon: 'package-variant', label: 'Insumos', route: '/(tabs)/inventario/insumos' },
  { icon: 'tag-multiple', label: 'Productos', route: '/(tabs)/inventario/productos' },
  { icon: 'food', label: 'Consumo', route: '/(tabs)/ventas/consumo-ventas' },
];

const LEVEL_NAV: Record<string, NavItem[]> = {
  [InventoryLevel.RAW]: [
    { icon: 'cart', label: 'Compras', route: '/(tabs)/inventario/compras' },
  ],
  [InventoryLevel.PROCESSED]: [
    { icon: 'factory', label: 'Produccion', route: '/(tabs)/inventario/produccion' },
    { icon: 'book-cog', label: 'Rec. Prod.', route: '/(tabs)/inventario/recetas-produccion' },
  ],
};

const ADMIN_STORE_NAV: NavItem[] = [
  { icon: 'truck', label: 'Traslados', route: '/(tabs)/inventario/traslados' },
  { icon: 'clipboard-check', label: 'Cierre', route: '/(tabs)/inventario/cierre-fisico' },
  { icon: 'alert', label: 'Alertas', route: '/(tabs)/inventario/validaciones' },
  { icon: 'chart-bar', label: 'Demanda', route: '/(tabs)/inventario/demanda' },
  { icon: 'package-variant-remove', label: 'Bajas', route: '/(tabs)/inventario/bajas' },
  { icon: 'tag-multiple', label: 'Productos', route: '/(tabs)/inventario/productos' },
  { icon: 'food', label: 'Consumo', route: '/(tabs)/ventas/consumo-ventas' },
];

const COLABORADOR_NAV: NavItem[] = [
  { icon: 'food', label: 'Consumo', route: '/(tabs)/ventas/consumo-ventas' },
  { icon: 'truck', label: 'Traslados', route: '/(tabs)/inventario/traslados' },
];

const PRODUCTION_LEVEL_OPTIONS = [
  { value: InventoryLevel.RAW, label: 'Mat. Prima', icon: 'cube-outline' },
  { value: InventoryLevel.PROCESSED, label: 'Procesado', icon: 'cog-outline' },
];

const STORE_LEVEL_OPTIONS = [
  { value: InventoryLevel.STORE, label: 'Local', icon: 'store' },
];

export default function InventarioScreen() {
  const theme = useTheme();
  const { inventoryService, stockMinimumRepo } = useDI();
  const { selectedStoreId, stores, userRole } = useAppStore();

  const isAdmin = userRole === UserRole.ADMIN;
  const isProductionCenter = stores.find((s) => s.id === selectedStoreId)?.isProductionCenter ?? false;

  const [level, setLevel] = useState<InventoryLevel>(
    isProductionCenter ? InventoryLevel.RAW : InventoryLevel.STORE
  );
  const [items, setItems] = useState<InventorySummaryItem[]>([]);
  const [minimums, setMinimums] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const loadGenRef = useRef(0);

  const { loadStores } = useAppStore();

  const navItems = !isAdmin
    ? COLABORADOR_NAV
    : isProductionCenter
      ? ADMIN_PRODUCTION_NAV
      : ADMIN_STORE_NAV;

  const levelNavItems = isAdmin && isProductionCenter ? (LEVEL_NAV[level] ?? []) : [];

  const levelOptions = isAdmin && isProductionCenter
    ? PRODUCTION_LEVEL_OPTIONS
    : STORE_LEVEL_OPTIONS;

  const loadInventory = useCallback(async () => {
    if (!selectedStoreId) {
      await loadStores();
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    try {
      const summary = await inventoryService.getInventorySummary(selectedStoreId, level);
      if (gen !== loadGenRef.current) return;
      setItems(summary);

      try {
        const mins = await stockMinimumRepo.getByStoreAndLevel(selectedStoreId, level);
        if (gen !== loadGenRef.current) return;
        const minMap: Record<string, number> = {};
        for (const m of mins) {
          minMap[m.supplyId] = m.minimumGrams;
        }
        setMinimums(minMap);
      } catch {
        setMinimums({});
      }
    } catch {
      if (gen !== loadGenRef.current) return;
      setItems([]);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [selectedStoreId, level, inventoryService, stockMinimumRepo, loadStores]);

  useEffect(() => {
    setLevel(isProductionCenter ? InventoryLevel.RAW : InventoryLevel.STORE);
  }, [isProductionCenter]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.supplyName.localeCompare(b.supplyName));
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase().trim();
    return sorted.filter((item) => item.supplyName.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const handleSetMinimum = useCallback(async (supplyId: string, grams: number) => {
    if (!selectedStoreId) return;
    try {
      await stockMinimumRepo.upsert(selectedStoreId, supplyId, level, grams);
      setMinimums((prev) => ({ ...prev, [supplyId]: grams }));
    } catch {
      // silently fail
    }
  }, [selectedStoreId, level, stockMinimumRepo]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topSection}>
        <StoreSelector />

        {/* Level chips + Nav chips in a single scrollable row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {/* Level selector chips (admin only, production center) */}
          {levelOptions.length > 1 && levelOptions.map((opt) => (
            <Chip
              key={opt.value}
              selected={level === opt.value}
              onPress={() => setLevel(opt.value)}
              mode="flat"
              compact
              icon={opt.icon}
              style={[
                styles.chip,
                level === opt.value && styles.chipActive,
              ]}
              textStyle={[
                styles.chipText,
                level === opt.value && styles.chipTextActive,
              ]}
              showSelectedOverlay={false}
            >
              {opt.label}
            </Chip>
          ))}

          {/* Separator */}
          {levelOptions.length > 1 && (
            <View style={styles.chipSeparator} />
          )}

          {/* Level-specific nav chips */}
          {levelNavItems.map((nav) => (
            <Chip
              key={nav.route}
              onPress={() => router.push(nav.route as any)}
              mode="outlined"
              compact
              icon={nav.icon}
              style={[styles.chipNav, styles.chipNavLevel]}
              textStyle={styles.chipNavText}
            >
              {nav.label}
            </Chip>
          ))}

          {/* General nav chips */}
          {navItems.map((nav) => (
            <Chip
              key={nav.route}
              onPress={() => router.push(nav.route as any)}
              mode="outlined"
              compact
              icon={nav.icon}
              style={styles.chipNav}
              textStyle={styles.chipNavText}
            >
              {nav.label}
            </Chip>
          ))}
        </ScrollView>

        <TextInput
          placeholder="Buscar insumo..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          mode="outlined"
          dense
          style={styles.searchInput}
          left={<TextInput.Icon icon="magnify" />}
          right={searchQuery ? <TextInput.Icon icon="close" onPress={() => setSearchQuery('')} /> : undefined}
        />
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando inventario..." />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={searchQuery ? 'magnify' : 'package-variant'}
          title={searchQuery ? 'Sin resultados' : 'Sin inventario'}
          subtitle={searchQuery ? `No se encontró "${searchQuery}"` : 'No hay items en este nivel'}
        />
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={({ item }) => (
            <InventoryLevelCard
              item={item}
              minimumGrams={minimums[item.supplyId] ?? 0}
              onSetMinimum={isAdmin ? handleSetMinimum : undefined}
            />
          )}
          keyExtractor={(item) => item.supplyId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  chipScroll: {
    marginTop: 10,
    marginBottom: 8,
    flexGrow: 0,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 16,
  },
  chip: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
  },
  chipActive: {
    backgroundColor: '#E63946',
  },
  chipText: {
    color: '#999',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chipSeparator: {
    width: 1,
    height: 20,
    backgroundColor: '#333',
    marginHorizontal: 2,
  },
  chipNav: {
    backgroundColor: 'transparent',
    borderColor: '#333',
    borderRadius: 16,
  },
  chipNavLevel: {
    borderColor: '#E63946',
  },
  chipNavText: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  searchInput: {
    marginBottom: 4,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
});
