import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Divider, Portal, Snackbar, useTheme, Searchbar, SegmentedButtons, Card, IconButton } from 'react-native-paper';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { BagCounter } from '../../../src/components/inventario/BagCounter';
import { ConfirmDialog } from '../../../src/components/common/ConfirmDialog';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { PhysicalCount, PhysicalCountItem } from '../../../src/domain/entities';
import { InventoryLevel } from '../../../src/domain/enums';
import { formatDateTime } from '../../../src/utils/dates';

interface CountEntry {
  supplyId: string;
  supplyName: string;
  gramsPerBag: number;
  unit: 'GRAMOS' | 'MILILITROS' | 'UNIDAD';
  bags: number;
  looseGrams: number;
}

const DRAFT_KEY_PREFIX = '@physical_count_draft_';

export default function CierreFisicoScreen() {
  const theme = useTheme();
  const { physicalCountService, recipeRepo, stockMinimumRepo } = useDI();
  const { selectedStoreId, stores } = useAppStore();
  const { supplies: cachedSupplies, workers: cachedWorkers } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const supplies = cachedSupplies;
  const workers = cachedWorkers.filter((w) => w.isActive);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [counts, setCounts] = useState<CountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);

  const [activeTab, setActiveTab] = useState<'NUEVO' | 'HISTORIAL'>('NUEVO');
  const [history, setHistory] = useState<PhysicalCount[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadedStoreIdRef = React.useRef<string | null>(null);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const isProductionCenter = selectedStore?.isProductionCenter ?? false;

  const filteredCounts = useMemo(() => {
    if (!searchQuery.trim()) return counts;
    const query = searchQuery.toLowerCase().trim();
    return counts.filter((c) => c.supplyName.toLowerCase().includes(query));
  }, [counts, searchQuery]);

  const activeSupplies = useMemo(() => cachedSupplies.filter((s) => s.isActive !== false), [cachedSupplies]);

  useEffect(() => {
    if (activeSupplies.length === 0 || !selectedStoreId) return;

    const initializeCounts = async () => {
      setLoading(true);
      try {
        let initialCounts: CountEntry[] = [];

        if (isProductionCenter) {
          initialCounts = activeSupplies.map((s) => ({
            supplyId: s.id,
            supplyName: s.name,
            gramsPerBag: s.gramsPerBag,
            unit: s.unit,
            bags: 0,
            looseGrams: 0,
          }));
        } else {
          const [recipes, minimums] = await Promise.all([
            recipeRepo.getAll(),
            stockMinimumRepo.getByStoreAndLevel(selectedStoreId, InventoryLevel.STORE),
          ]);
          
          const recipeSupplyIds = new Set<string>();
          for (const recipe of recipes) {
            for (const ingredient of recipe.ingredients) {
              recipeSupplyIds.add(ingredient.supplyId);
            }
          }

          const minSupplyIds = new Set<string>(
            minimums.filter((m) => m.minimumGrams > 0).map((m) => m.supplyId),
          );

          initialCounts = activeSupplies
            .filter((s) => s.category !== 'RAW' || ((s.isBillableToStore || s.allowLocalPurchase) && (recipeSupplyIds.has(s.id) || minSupplyIds.has(s.id))))
            .map((s) => ({
              supplyId: s.id,
              supplyName: s.name,
              gramsPerBag: s.gramsPerBag,
              unit: s.unit,
              bags: 0,
              looseGrams: 0,
            }));
        }

        // Try to load draft
        const draftStr = await AsyncStorage.getItem(`${DRAFT_KEY_PREFIX}${selectedStoreId}`);
        if (draftStr) {
          const draft = JSON.parse(draftStr) as { workerId: string; counts: CountEntry[] };
          if (draft.workerId) setSelectedWorkerId(draft.workerId);
          
          const draftMap = new Map(draft.counts.map((c) => [c.supplyId, c]));
          initialCounts = initialCounts.map((c) => {
            const d = draftMap.get(c.supplyId);
            if (d) return { ...c, bags: d.bags, looseGrams: d.looseGrams };
            return c;
          });
        }

        loadedStoreIdRef.current = selectedStoreId;
        setCounts(initialCounts);
      } catch (err) {
        console.error('Error initializing physical count', err);
      } finally {
        setLoading(false);
      }
    };

    initializeCounts();
  }, [activeSupplies, selectedStoreId, isProductionCenter, recipeRepo, stockMinimumRepo]);

  // Save draft whenever counts or selectedWorkerId changes
  useEffect(() => {
    if (loading || !selectedStoreId || counts.length === 0) return;
    if (loadedStoreIdRef.current !== selectedStoreId) return; // Prevent overwriting when switching stores
    
    const draft = { workerId: selectedWorkerId, counts };
    AsyncStorage.setItem(`${DRAFT_KEY_PREFIX}${selectedStoreId}`, JSON.stringify(draft))
      .catch((err) => console.error('Error saving draft', err));
  }, [counts, selectedWorkerId, selectedStoreId, loading]);

  useEffect(() => {
    if (activeTab === 'HISTORIAL' && selectedStoreId) {
      setLoadingHistory(true);
      physicalCountService.getByStore(selectedStoreId)
        .then(setHistory)
        .catch(console.error)
        .finally(() => setLoadingHistory(false));
    }
  }, [activeTab, selectedStoreId, physicalCountService]);

  const updateBags = useCallback((supplyId: string, bags: number) => {
    setCounts((prev) => prev.map((c) => (c.supplyId === supplyId ? { ...c, bags } : c)));
  }, []);

  const updateGrams = useCallback((supplyId: string, looseGrams: number) => {
    setCounts((prev) => prev.map((c) => (c.supplyId === supplyId ? { ...c, looseGrams } : c)));
  }, []);

  const resetForm = useCallback(() => {
    setCounts((prev) => prev.map((c) => ({ ...c, bags: 0, looseGrams: 0 })));
    setSelectedWorkerId('');
    setSearchQuery('');
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const items: PhysicalCountItem[] = counts.map((c) => ({
        supplyId: c.supplyId,
        bags: c.bags,
        looseGrams: c.looseGrams,
        totalGrams: c.bags * c.gramsPerBag + c.looseGrams,
      }));

      const targetLevel = isProductionCenter ? InventoryLevel.RAW : InventoryLevel.STORE;
      const count = await physicalCountService.submitCount(selectedStoreId!, items, selectedWorkerId || undefined, targetLevel);
      
      await AsyncStorage.removeItem(`${DRAFT_KEY_PREFIX}${selectedStoreId}`);
      
      showSuccess(`${count.items.length} insumos registrados. Inventario actualizado.`);
      resetForm();
    } catch (err: any) {
      console.error('Error al registrar cierre físico:', err);
      showError(err?.message || 'No se pudo registrar el cierre físico');
    } finally {
      setSubmitting(false);
      setConfirmVisible(false);
    }
  }, [counts, selectedStoreId, isProductionCenter, physicalCountService, selectedWorkerId, showSuccess, resetForm, showError]);

  if (loading) {
    return <LoadingIndicator message="Cargando insumos..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Button
          mode="text"
          icon="arrow-left"
          compact
          onPress={() => router.replace('/(tabs)/ventas')}
          style={{ alignSelf: 'flex-start', marginBottom: 8 }}
        >
          Volver a Ventas
        </Button>
        <StoreSelector />
      </View>

      <SegmentedButtons
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'NUEVO' | 'HISTORIAL')}
        buttons={[
          { value: 'NUEVO', label: '📝 Nuevo Conteo' },
          { value: 'HISTORIAL', label: '📜 Historial' },
        ]}
        density="small"
        style={{ marginBottom: 16 }}
      />

      {activeTab === 'NUEVO' ? (
        <>
          <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
            Conteo Fisico de Inventario
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Ingresa las bolsas y gramos sueltos de cada insumo
          </Text>

          <SearchableSelect
            options={workers.map((w) => ({ value: w.id, label: w.name, subtitle: w.role }))}
            selectedValue={selectedWorkerId}
            placeholder="Quien hace el conteo?"
            icon="account"
            onSelect={setSelectedWorkerId}
          />

          <Searchbar
            placeholder="Buscar insumo..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchBar}
            inputStyle={styles.searchInput}
            icon="magnify"
          />

          {filteredCounts.length === 0 && searchQuery.trim() !== '' && (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginVertical: 16 }}>
              No se encontraron insumos para "{searchQuery}"
            </Text>
          )}

          {filteredCounts.map((entry, index) => (
            <View key={entry.supplyId}>
              <BagCounter
                label={entry.supplyName}
                bags={entry.bags}
                looseGrams={entry.looseGrams}
                gramsPerBag={entry.gramsPerBag}
                unit={entry.unit}
                onBagsChange={(bags) => updateBags(entry.supplyId, bags)}
                onGramsChange={(grams) => updateGrams(entry.supplyId, grams)}
              />
              {index < filteredCounts.length - 1 && <Divider />}
            </View>
          ))}

          <Button
            mode="contained"
            onPress={() => setConfirmVisible(true)}
            disabled={submitting}
            style={styles.submitBtn}
            icon="clipboard-check"
          >
            Registrar Cierre Fisico
          </Button>

          <View style={{ height: 100 }} />
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
            Auditoria de Conteos
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Historial de cierres registrados en esta caja
          </Text>

          {loadingHistory ? (
            <LoadingIndicator message="Cargando historial..." />
          ) : history.length === 0 ? (
            <EmptyState icon="history" title="Sin historial" subtitle="No hay cierres físicos registrados en esta sede" />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {history.map((count) => {
                const isExpanded = expandedId === count.id;
                const worker = workers.find((w) => w.id === count.workerId);
                const workerName = worker ? worker.name : 'Desconocido';

                return (
                  <Card
                    key={count.id}
                    style={{ marginBottom: 12, backgroundColor: theme.colors.surfaceVariant, elevation: 0 }}
                    onPress={() => setExpandedId(isExpanded ? null : count.id)}
                  >
                    <Card.Title
                      title={formatDateTime(count.timestamp)}
                      subtitle={`Responsable: ${workerName}`}
                      right={(props) => (
                        <IconButton
                          {...props}
                          icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                          onPress={() => setExpandedId(isExpanded ? null : count.id)}
                        />
                      )}
                    />
                    {isExpanded && (
                      <Card.Content>
                        <Divider style={{ marginBottom: 8 }} />
                        <Text variant="labelMedium" style={{ marginBottom: 8, color: theme.colors.primary }}>
                          Detalle del Conteo ({count.items.length} ítems)
                        </Text>
                        {count.items.map((item) => {
                          const supply = supplies.find((s) => s.id === item.supplyId);
                          return (
                            <View key={item.supplyId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                              <Text variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>
                                {supply ? supply.name : 'Insumo'}
                              </Text>
                              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                                {item.bags > 0 ? `${item.bags} bls, ` : ''}{item.looseGrams} gr
                              </Text>
                            </View>
                          );
                        })}
                      </Card.Content>
                    )}
                  </Card>
                );
              })}
              <View style={{ height: 100 }} />
            </ScrollView>
          )}
        </View>
      )}

      <ConfirmDialog
        visible={confirmVisible}
        title="Confirmar Cierre Fisico"
        message="Se registrara el conteo fisico de todos los insumos y se actualizara el inventario. Esta accion no se puede deshacer."
        confirmLabel="Registrar"
        onConfirm={handleSubmit}
        onDismiss={() => setConfirmVisible(false)}
        confirmLoading={submitting}
      />

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
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  searchBar: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 0,
  },
  searchInput: {
    fontSize: 16,
  },
  submitBtn: {
    marginTop: 24,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
