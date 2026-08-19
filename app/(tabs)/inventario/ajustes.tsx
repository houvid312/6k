import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, FlatList } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Divider,
  Portal,
  Snackbar,
  SegmentedButtons,
  Chip,
  useTheme,
  Searchbar,
} from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { InventoryLevel, UserRole } from '../../../src/domain/enums';
import { InventoryAdjustment, Supply } from '../../../src/domain/entities';
import { formatDate } from '../../../src/utils/dates';

interface AdjustmentFormState {
  bags: string;
  looseGrams: string;
  reason: string;
}

export default function AjustesInventarioScreen() {
  const theme = useTheme();
  const { inventoryRepo, inventoryAdjustmentRepo } = useDI();
  const { selectedStoreId, stores, userRole, userId } = useAppStore();
  const { supplies: cachedSupplies, refreshMasterData } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const isManager = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL;
  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const isProductionCenter = selectedStore?.isProductionCenter ?? false;

  const [activeTab, setActiveTab] = useState<'adjust' | 'history'>('adjust');
  const [level, setLevel] = useState<InventoryLevel>(isProductionCenter ? InventoryLevel.RAW : InventoryLevel.STORE);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentQuantities, setCurrentQuantities] = useState<Record<string, number>>({});
  const [forms, setForms] = useState<Record<string, AdjustmentFormState>>({});
  const [savingSupplyId, setSavingSupplyId] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<InventoryAdjustment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Synchronize level default when store changes
  useEffect(() => {
    setLevel(isProductionCenter ? InventoryLevel.RAW : InventoryLevel.STORE);
  }, [isProductionCenter]);

  // Load current stock quantities for selected store and level
  const loadStock = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      await refreshMasterData();
      const inventory = await inventoryRepo.getByStore(selectedStoreId, level);
      const qMap: Record<string, number> = {};
      for (const item of inventory) {
        qMap[item.supplyId] = item.quantityGrams;
      }
      setCurrentQuantities(qMap);
    } catch (err) {
      console.error('Error loading stock for adjustment:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, level, inventoryRepo, refreshMasterData]);

  // Load adjustment audit history
  const loadHistory = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoadingHistory(true);
    try {
      const data = await inventoryAdjustmentRepo.getByStore(selectedStoreId, 50);
      setHistory(data);
    } catch (err) {
      console.error('Error loading adjustment history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedStoreId, inventoryAdjustmentRepo]);

  useEffect(() => {
    if (activeTab === 'adjust') {
      loadStock();
    } else {
      loadHistory();
    }
  }, [activeTab, loadStock, loadHistory]);

  // Filter supplies according to store type and level
  const availableSupplies = useMemo(() => {
    const active = cachedSupplies.filter((s) => s.isActive !== false);
    if (isProductionCenter) {
      if (level === InventoryLevel.RAW) {
        return active.filter((s) => s.category === 'RAW');
      } else if (level === InventoryLevel.PROCESSED) {
        return active.filter((s) => s.category === 'PROCESSED' || s.category === 'OPERATIVE');
      }
      return active;
    }
    // Local store: show PROCESSED, OPERATIVE, and only store-authorized RAW supplies (isBillableToStore or allowLocalPurchase)
    return active.filter((s) => {
      if (s.category !== 'RAW') return true;
      const isAllowed = s.isBillableToStore || s.allowLocalPurchase;
      if (!isAllowed) return false;
      return (currentQuantities[s.id] ?? 0) !== 0 || (searchQuery.trim() !== '' && s.name.toLowerCase().includes(searchQuery.toLowerCase().trim()));
    });
  }, [cachedSupplies, isProductionCenter, level, currentQuantities, searchQuery]);

  const filteredSupplies = useMemo(() => {
    let list = [...availableSupplies].sort((a, b) => a.name.localeCompare(b.name));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [availableSupplies, searchQuery]);

  const handleApplyAdjustment = async (supply: Supply) => {
    if (!selectedStoreId) return;
    const formState = forms[supply.id] || { bags: '', looseGrams: '', reason: '' };
    const reason = formState.reason.trim();
    if (!reason) {
      showError('Ingresa el motivo del ajuste (ej. Inicialización de Producción)');
      return;
    }

    const bags = parseFloat(formState.bags) || 0;
    const loose = parseFloat(formState.looseGrams) || 0;
    const newTotalGrams = bags * supply.gramsPerBag + loose;
    const prevGrams = currentQuantities[supply.id] ?? 0;
    const diffGrams = newTotalGrams - prevGrams;

    setSavingSupplyId(supply.id);
    try {
      // 1. Update inventory table to new exact quantity
      await inventoryRepo.setQuantity(selectedStoreId, supply.id, level, newTotalGrams);

      // 2. Log audit trail in inventory_adjustments
      await inventoryAdjustmentRepo.create({
        storeId: selectedStoreId,
        supplyId: supply.id,
        level,
        previousQuantityGrams: prevGrams,
        newQuantityGrams: newTotalGrams,
        differenceGrams: diffGrams,
        reason,
        userId: userId || undefined,
      });

      showSuccess(`Ajuste aplicado a "${supply.name}". Nuevo stock: ${newTotalGrams}g`);

      // 3. Clear form and update state
      setForms((prev) => ({
        ...prev,
        [supply.id]: { bags: '', looseGrams: '', reason: '' },
      }));
      setCurrentQuantities((prev) => ({ ...prev, [supply.id]: newTotalGrams }));
      refreshMasterData();
    } catch (err: any) {
      console.error('Error applying adjustment:', err);
      showError(err?.message ? `Error: ${err.message}` : 'Error al guardar el ajuste de inventario');
    } finally {
      setSavingSupplyId(null);
    }
  };

  if (!isManager) {
    return (
      <ScreenContainer scrollable padded>
        <EmptyState
          icon="shield-lock"
          title="Acceso Restringido"
          subtitle="Solo los administradores y gerentes pueden realizar ajustes e inicialización de inventario."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable padded>
      <View style={styles.header}>
        <Button
          mode="text"
          icon="arrow-left"
          compact
          onPress={() => router.replace('/(tabs)/inventario')}
          style={{ alignSelf: 'flex-start' }}
        >
          Volver a Inventario
        </Button>
        <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
          Ajustes e Inicialización de Inventario
        </Text>
        <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          Herramienta exclusiva de Gerencia para arqueos, correcciones de auditoría y carga inicial.
        </Text>
        <StoreSelector />
      </View>

      <SegmentedButtons
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        buttons={[
          { value: 'adjust', label: '🛠️ Realizar Ajuste', icon: 'pencil-box-multiple-outline' },
          { value: 'history', label: '📋 Historial Auditoría', icon: 'history' },
        ]}
        style={{ marginVertical: 12 }}
        density="small"
      />

      {activeTab === 'adjust' ? (
        <>
          <View style={{ marginBottom: 12 }}>
            <Text variant="bodySmall" style={{ color: '#999', marginBottom: 4 }}>
              Nivel de Inventario:
            </Text>
            {isProductionCenter ? (
              <SegmentedButtons
                value={String(level)}
                onValueChange={(v) => setLevel(Number(v) as InventoryLevel)}
                buttons={[
                  { value: String(InventoryLevel.RAW), label: '🌾 Mat. Prima (RAW)' },
                  { value: String(InventoryLevel.PROCESSED), label: '⚙️ Procesado (PROCESSED)' },
                ]}
                density="small"
              />
            ) : (
              <Chip icon="store" style={{ backgroundColor: '#2A2A2A', alignSelf: 'flex-start' }} textStyle={{ color: '#FFF' }}>
                Local / Tienda (STORE)
              </Chip>
            )}
          </View>

          <Searchbar
            placeholder="Buscar insumo..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchbar}
          />

          {loading ? (
            <LoadingIndicator message="Cargando existencias de la sede..." />
          ) : filteredSupplies.length === 0 ? (
            <EmptyState icon="cube-outline" title="Sin insumos" subtitle="No hay insumos disponibles para este nivel." />
          ) : (
            filteredSupplies.map((supply) => {
              const currentGrams = currentQuantities[supply.id] ?? 0;
              const currentBags = Math.floor(currentGrams / (supply.gramsPerBag || 1));

              const formState = forms[supply.id] || { bags: '', looseGrams: '', reason: '' };
              const inputBags = parseFloat(formState.bags) || 0;
              const inputLoose = parseFloat(formState.looseGrams) || 0;

              const hasEdited = formState.bags !== '' || formState.looseGrams !== '';
              const newTotalGrams = inputBags * supply.gramsPerBag + inputLoose;
              const diffGrams = hasEdited ? newTotalGrams - currentGrams : 0;

              const isSavingThis = savingSupplyId === supply.id;

              return (
                <Card key={supply.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
                  <Card.Content>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '700' }}>
                          {supply.name}
                        </Text>
                        <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                          Presentación: {supply.gramsPerBag}g/bolsa • {supply.unit.toLowerCase()}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', backgroundColor: '#2B2B2B', padding: 6, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, color: '#999' }}>Stock Actual Sistema:</Text>
                        <Text style={{ fontSize: 13, color: '#E63946', fontWeight: '700' }}>
                          {currentBags} bolsas ({Math.round(currentGrams)}g)
                        </Text>
                      </View>
                    </View>

                    <Divider style={{ backgroundColor: '#333', marginVertical: 10 }} />

                    <Text variant="bodySmall" style={{ color: '#E63946', fontWeight: '600', marginBottom: 8 }}>
                      Digitar Nuevo Stock Auditoría / Inicial:
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      <TextInput
                        label="Bolsas Nuevas"
                        value={formState.bags}
                        onChangeText={(v) =>
                          setForms((prev) => ({
                            ...prev,
                            [supply.id]: { ...formState, bags: v },
                          }))
                        }
                        keyboardType="decimal-pad"
                        mode="outlined"
                        dense
                        style={{ flex: 1, backgroundColor: '#111' }}
                        outlineColor="#333"
                        textColor="#FFF"
                      />
                      <TextInput
                        label="Gramos Sueltos"
                        value={formState.looseGrams}
                        onChangeText={(v) =>
                          setForms((prev) => ({
                            ...prev,
                            [supply.id]: { ...formState, looseGrams: v },
                          }))
                        }
                        keyboardType="decimal-pad"
                        mode="outlined"
                        dense
                        style={{ flex: 1, backgroundColor: '#111' }}
                        outlineColor="#333"
                        textColor="#FFF"
                      />
                    </View>

                    {hasEdited && (
                      <View style={{ backgroundColor: '#252525', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                        <Text style={{ fontSize: 11, color: '#FFF' }}>
                          Nuevo Total Real: <Text style={{ fontWeight: '700', color: '#4CAF50' }}>{newTotalGrams}g</Text>
                        </Text>
                        <Text style={{ fontSize: 11, color: diffGrams >= 0 ? '#4CAF50' : '#FF5252' }}>
                          Diferencia a aplicar: <Text style={{ fontWeight: '700' }}>{diffGrams > 0 ? `+${diffGrams}g` : `${diffGrams}g`}</Text>
                        </Text>
                      </View>
                    )}

                    <TextInput
                      label="Motivo del Ajuste (Obligatorio)"
                      value={formState.reason}
                      onChangeText={(v) =>
                        setForms((prev) => ({
                          ...prev,
                          [supply.id]: { ...formState, reason: v },
                        }))
                      }
                      placeholder="Ej. Inicialización de Producción, Ajuste por Auditoría"
                      mode="outlined"
                      dense
                      style={{ marginBottom: 10, backgroundColor: '#111' }}
                      outlineColor="#333"
                      textColor="#FFF"
                    />

                    <Button
                      mode="contained"
                      onPress={() => handleApplyAdjustment(supply)}
                      loading={isSavingThis}
                      disabled={isSavingThis || !hasEdited || !formState.reason.trim()}
                      buttonColor="#E63946"
                      compact
                    >
                      Aplicar Ajuste / Inicializar
                    </Button>
                  </Card.Content>
                </Card>
              );
            })
          )}
        </>
      ) : (
        <>
          <Text variant="titleSmall" style={{ color: '#FFF', fontWeight: '700', marginBottom: 8 }}>
            Historial de Ajustes por Auditoría (Últimos 50)
          </Text>
          {loadingHistory ? (
            <LoadingIndicator message="Cargando historial de auditoría..." />
          ) : history.length === 0 ? (
            <EmptyState icon="history" title="Sin ajustes registrados" subtitle="No hay ajustes manuales registrados para esta sede." />
          ) : (
            history.map((adj) => {
              const supply = cachedSupplies.find((s) => s.id === adj.supplyId);
              const diff = adj.differenceGrams;
              const isPositive = diff >= 0;

              return (
                <Card key={adj.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
                  <Card.Content>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '700' }}>
                        {supply?.name || 'Insumo'}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#999' }}>{formatDate(adj.createdAt)}</Text>
                    </View>
                    <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                      Nivel: <Text style={{ color: '#FFF' }}>{adj.level}</Text>
                    </Text>

                    <Divider style={{ backgroundColor: '#333', marginVertical: 6 }} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: '#AAA' }}>
                        {adj.previousQuantityGrams}g ➔ <Text style={{ color: '#FFF', fontWeight: '700' }}>{adj.newQuantityGrams}g</Text>
                      </Text>
                      <View style={{ backgroundColor: isPositive ? '#1B5E20' : '#B71C1C', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 11, color: '#FFF', fontWeight: '700' }}>
                          {isPositive ? `+${diff}g` : `${diff}g`}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 11, color: '#FFC107', marginTop: 6, fontStyle: 'italic' }}>
                      Motivo: "{adj.reason}"
                    </Text>
                  </Card.Content>
                </Card>
              );
            })
          )}
        </>
      )}

      <View style={{ height: 100 }} />

      <Portal>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={hideSnackbar}
          duration={3000}
          style={{ backgroundColor: snackbar.error ? '#B00020' : '#2E7D32', marginBottom: 80 }}
        >
          {snackbar.message}
        </Snackbar>
      </Portal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 8,
  },
  title: {
    fontWeight: 'bold',
    marginTop: 4,
  },
  subtitle: {
    marginBottom: 12,
  },
  searchbar: {
    marginBottom: 12,
    backgroundColor: '#1E1E1E',
  },
  card: {
    marginBottom: 10,
    borderRadius: 12,
  },
});
