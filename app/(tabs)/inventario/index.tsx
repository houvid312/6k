import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet, ScrollView } from 'react-native';
import { SegmentedButtons, Text, Button, Divider, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { InventoryLevelCard } from '../../../src/components/inventario/InventoryLevelCard';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { InventoryLevel } from '../../../src/domain/enums';
import { InventorySummaryItem } from '../../../src/services/InventoryService';

const LEVEL_BUTTONS = [
  { value: String(InventoryLevel.RAW), label: 'Mat. Prima' },
  { value: String(InventoryLevel.PROCESSED), label: 'Procesado' },
  { value: String(InventoryLevel.STORE), label: 'Local' },
];

export default function InventarioScreen() {
  const theme = useTheme();
  const { inventoryService, stockMinimumRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const [level, setLevel] = useState<string>(String(InventoryLevel.STORE));
  const [items, setItems] = useState<InventorySummaryItem[]>([]);
  const [minimums, setMinimums] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const { loadStores } = useAppStore();

  const currentLevel = Number(level) as InventoryLevel;

  const loadInventory = useCallback(async () => {
    if (!selectedStoreId) {
      await loadStores();
      return;
    }
    setLoading(true);
    try {
      const summary = await inventoryService.getInventorySummary(selectedStoreId, currentLevel);
      setItems(summary);

      // Load minimums separately so it doesn't break inventory loading
      try {
        const mins = await stockMinimumRepo.getByStoreAndLevel(selectedStoreId, currentLevel);
        const minMap: Record<string, number> = {};
        for (const m of mins) {
          minMap[m.supplyId] = m.minimumGrams;
        }
        setMinimums(minMap);
      } catch {
        setMinimums({});
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, currentLevel, inventoryService, stockMinimumRepo, loadStores]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleSetMinimum = useCallback(async (supplyId: string, grams: number) => {
    if (!selectedStoreId) return;
    try {
      await stockMinimumRepo.upsert(selectedStoreId, supplyId, currentLevel, grams);
      setMinimums((prev) => ({ ...prev, [supplyId]: grams }));
    } catch {
      // silently fail
    }
  }, [selectedStoreId, currentLevel, stockMinimumRepo]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topSection}>
        <View style={styles.headerRow}>
          <StoreSelector />
        </View>

        <SegmentedButtons
          value={level}
          onValueChange={setLevel}
          buttons={LEVEL_BUTTONS}
          style={styles.segments}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navScroll}>
          <View style={styles.navRow}>
            <Button mode="outlined" compact icon="cart" onPress={() => router.push('/(tabs)/inventario/compras')}>
              Compras
            </Button>
            <Button mode="outlined" compact icon="truck" onPress={() => router.push('/(tabs)/inventario/traslados')}>
              Traslados
            </Button>
            <Button mode="outlined" compact icon="clipboard-check" onPress={() => router.push('/(tabs)/inventario/cierre-fisico')}>
              Cierre
            </Button>
            <Button mode="outlined" compact icon="alert" onPress={() => router.push('/(tabs)/inventario/validaciones')}>
              Alertas
            </Button>
          </View>
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navScroll}>
          <View style={styles.navRow}>
            <Button mode="outlined" compact icon="factory" onPress={() => router.push('/(tabs)/inventario/produccion')}>
              Produccion
            </Button>
            <Button mode="outlined" compact icon="book-open-variant" onPress={() => router.push('/(tabs)/inventario/recetas')}>
              Recetas
            </Button>
            <Button mode="outlined" compact icon="book-cog" onPress={() => router.push('/(tabs)/inventario/recetas-produccion')}>
              Rec. Prod.
            </Button>
            <Button mode="outlined" compact icon="calculator" onPress={() => router.push('/(tabs)/inventario/sugerencia-envio')}>
              Sugerencia
            </Button>
            <Button mode="outlined" compact icon="chart-bar" onPress={() => router.push('/(tabs)/inventario/demanda')}>
              Demanda
            </Button>
            <Button mode="outlined" compact icon="package-variant" onPress={() => router.push('/(tabs)/inventario/insumos')}>
              Insumos
            </Button>
          </View>
        </ScrollView>
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando inventario..." />
      ) : items.length === 0 ? (
        <EmptyState icon="package-variant" title="Sin inventario" subtitle="No hay items en este nivel" />
      ) : (
        <FlatList
          data={items}
          renderItem={({ item }) => (
            <InventoryLevelCard
              item={item}
              minimumGrams={minimums[item.supplyId] ?? 0}
              onSetMinimum={handleSetMinimum}
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
    padding: 16,
    paddingBottom: 0,
  },
  headerRow: {
    marginBottom: 12,
  },
  segments: {
    marginBottom: 12,
  },
  navScroll: {
    marginBottom: 8,
    flexGrow: 0,
  },
  navRow: {
    flexDirection: 'row',
    gap: 6,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
});
