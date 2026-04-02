import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { SegmentedButtons, Text, Button, useTheme } from 'react-native-paper';
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
  const { inventoryService } = useDI();
  const { selectedStoreId } = useAppStore();

  const [level, setLevel] = useState<string>(String(InventoryLevel.STORE));
  const [items, setItems] = useState<InventorySummaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { loadStores } = useAppStore();

  const loadInventory = useCallback(async () => {
    if (!selectedStoreId) {
      await loadStores();
      return;
    }
    setLoading(true);
    try {
      const summary = await inventoryService.getInventorySummary(
        selectedStoreId,
        Number(level) as InventoryLevel,
      );
      setItems(summary);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, level, inventoryService, loadStores]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

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
            Valid.
          </Button>
          <Button mode="outlined" compact icon="book-open-variant" onPress={() => router.push('/(tabs)/inventario/recetas')}>
            Recetas
          </Button>
        </View>
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando inventario..." />
      ) : items.length === 0 ? (
        <EmptyState icon="package-variant" title="Sin inventario" subtitle="No hay items en este nivel" />
      ) : (
        <FlatList
          data={items}
          renderItem={({ item }) => <InventoryLevelCard item={item} />}
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
  navRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
});
