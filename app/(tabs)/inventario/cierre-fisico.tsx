import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card, Divider, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { BagCounter } from '../../../src/components/inventario/BagCounter';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { PhysicalCountItem } from '../../../src/domain/entities';

interface CountEntry {
  supplyId: string;
  supplyName: string;
  gramsPerBag: number;
  bags: number;
  looseGrams: number;
}

export default function CierreFisicoScreen() {
  const theme = useTheme();
  const { physicalCountService } = useDI();
  const { selectedStoreId } = useAppStore();
  const { supplies: cachedSupplies, workers: cachedWorkers } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const supplies = cachedSupplies;
  const workers = cachedWorkers.filter((w) => w.isActive);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [counts, setCounts] = useState<CountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cachedSupplies.length > 0) {
      setCounts(
        cachedSupplies.map((s) => ({
          supplyId: s.id,
          supplyName: s.name,
          gramsPerBag: s.gramsPerBag,
          bags: 0,
          looseGrams: 0,
        })),
      );
      setLoading(false);
    }
  }, [cachedSupplies]);

  const updateBags = useCallback((supplyId: string, bags: number) => {
    setCounts((prev) => prev.map((c) => (c.supplyId === supplyId ? { ...c, bags } : c)));
  }, []);

  const updateGrams = useCallback((supplyId: string, looseGrams: number) => {
    setCounts((prev) => prev.map((c) => (c.supplyId === supplyId ? { ...c, looseGrams } : c)));
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
    } catch {
      showError('No se pudo registrar el cierre fisico');
    } finally {
      setSubmitting(false);
    }
  }, [counts, selectedStoreId, physicalCountService, showSuccess, showError]);

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

      {counts.map((entry, index) => (
        <View key={entry.supplyId}>
          <BagCounter
            label={entry.supplyName}
            bags={entry.bags}
            looseGrams={entry.looseGrams}
            gramsPerBag={entry.gramsPerBag}
            onBagsChange={(bags) => updateBags(entry.supplyId, bags)}
            onGramsChange={(grams) => updateGrams(entry.supplyId, grams)}
          />
          {index < counts.length - 1 && <Divider />}
        </View>
      ))}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitBtn}
        icon="clipboard-check"
      >
        Registrar Cierre Fisico
      </Button>

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
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  submitBtn: {
    marginTop: 24,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
