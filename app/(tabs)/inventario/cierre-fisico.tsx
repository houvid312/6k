import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card, Divider, Portal, Snackbar, SegmentedButtons, TextInput, useTheme, Searchbar } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { BagCounter } from '../../../src/components/inventario/BagCounter';
import { ConfirmDialog } from '../../../src/components/common/ConfirmDialog';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { PhysicalCountItem, ChecklistItem } from '../../../src/domain/entities';
import { PACKAGING_SUPPLY_IDS } from '../../../src/domain/enums';

interface CountEntry {
  supplyId: string;
  supplyName: string;
  gramsPerBag: number;
  unit: 'GRAMOS' | 'MILILITROS' | 'UNIDAD';
  bags: number;
  looseGrams: number;
}

export default function CierreFisicoScreen() {
  const theme = useTheme();
  const { physicalCountService, recipeRepo, checklistRepo } = useDI();
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

  // Checklist de implementos de aseo
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistStatuses, setChecklistStatuses] = useState<Record<string, 'OK' | 'BAJO' | 'AGOTADO'>>({});
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>({});

  const filteredCounts = useMemo(() => {
    if (!searchQuery.trim()) return counts;
    const query = searchQuery.toLowerCase().trim();
    return counts.filter((c) => c.supplyName.toLowerCase().includes(query));
  }, [counts, searchQuery]);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const isProductionCenter = selectedStore?.isProductionCenter ?? false;

  useEffect(() => {
    if (cachedSupplies.length === 0 || !selectedStoreId) return;

    const packagingIds = new Set<string>(Object.values(PACKAGING_SUPPLY_IDS));

    if (isProductionCenter) {
      // Centro de producción: mostrar todos los insumos
      setCounts(
        cachedSupplies.map((s) => ({
          supplyId: s.id,
          supplyName: s.name,
          gramsPerBag: s.gramsPerBag,
          unit: s.unit,
          bags: 0,
          looseGrams: 0,
        })),
      );
      setLoading(false);
    } else {
      // Local: solo insumos de recetas + empaques
      setLoading(true);
      recipeRepo.getAll().then((recipes) => {
        const recipeSupplyIds = new Set<string>();
        for (const recipe of recipes) {
          for (const ingredient of recipe.ingredients) {
            recipeSupplyIds.add(ingredient.supplyId);
          }
        }

        setCounts(
          cachedSupplies
            .filter((s) => recipeSupplyIds.has(s.id) || packagingIds.has(s.id))
            .map((s) => ({
              supplyId: s.id,
              supplyName: s.name,
              gramsPerBag: s.gramsPerBag,
              unit: s.unit,
              bags: 0,
              looseGrams: 0,
            })),
        );
        setLoading(false);
      }).catch(() => {
        setCounts(
          cachedSupplies.map((s) => ({
            supplyId: s.id,
            supplyName: s.name,
            gramsPerBag: s.gramsPerBag,
            unit: s.unit,
            bags: 0,
            looseGrams: 0,
          })),
        );
        setLoading(false);
      });
    }
  }, [cachedSupplies, selectedStoreId, isProductionCenter]);

  // Load checklist items
  useEffect(() => {
    checklistRepo.getActiveItems().then((items) => {
      setChecklistItems(items);
      const statuses: Record<string, 'OK' | 'BAJO' | 'AGOTADO'> = {};
      const notes: Record<string, string> = {};
      for (const item of items) {
        statuses[item.id] = 'OK';
        notes[item.id] = '';
      }
      setChecklistStatuses(statuses);
      setChecklistNotes(notes);
    }).catch(() => {});
  }, [checklistRepo]);

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

      const count = await physicalCountService.submitCount(selectedStoreId!, items, selectedWorkerId || undefined);
      showSuccess(`${count.items.length} insumos registrados. Inventario actualizado.`);
      resetForm();
    } catch {
      showError('No se pudo registrar el cierre fisico');
    } finally {
      setSubmitting(false);
      setConfirmVisible(false);
    }
  }, [counts, selectedStoreId, physicalCountService, showSuccess, showError, resetForm]);

  if (loading) {
    return <LoadingIndicator message="Cargando insumos..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

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

      {/* Checklist de implementos de aseo */}
      {checklistItems.length > 0 && (
        <Card style={{ borderRadius: 12, marginTop: 16 }} mode="elevated">
          <Card.Content>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
              Implementos de Aseo
            </Text>
            {checklistItems.map((item) => (
              <View key={item.id} style={{ marginBottom: 12 }}>
                <Text variant="bodyMedium" style={{ marginBottom: 4, fontWeight: '500' }}>
                  {item.name}
                </Text>
                <SegmentedButtons
                  value={checklistStatuses[item.id] ?? 'OK'}
                  onValueChange={(v) => setChecklistStatuses((prev) => ({ ...prev, [item.id]: v as 'OK' | 'BAJO' | 'AGOTADO' }))}
                  buttons={[
                    { value: 'OK', label: 'OK' },
                    { value: 'BAJO', label: 'Bajo' },
                    { value: 'AGOTADO', label: 'Agotado' },
                  ]}
                  density="small"
                  style={{ marginBottom: 4 }}
                />
                {checklistStatuses[item.id] !== 'OK' && (
                  <TextInput
                    label="Nota"
                    value={checklistNotes[item.id] ?? ''}
                    onChangeText={(v) => setChecklistNotes((prev) => ({ ...prev, [item.id]: v }))}
                    mode="outlined"
                    dense
                    style={{ marginTop: 4 }}
                  />
                )}
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

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
