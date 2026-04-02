import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Card, Divider, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { BagCounter } from '../../../src/components/inventario/BagCounter';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Supply } from '../../../src/domain/entities';
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
  const { supplyRepo, inventoryRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [counts, setCounts] = useState<CountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await supplyRepo.getAll();
        setSupplies(all);
        setCounts(
          all.map((s) => ({
            supplyId: s.id,
            supplyName: s.name,
            gramsPerBag: s.gramsPerBag,
            bags: 0,
            looseGrams: 0,
          })),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [supplyRepo]);

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

      // In a real implementation this would call a physicalCountService
      // For now we just show confirmation
      Alert.alert(
        'Cierre Fisico Registrado',
        `Se registraron ${items.length} insumos.\nTotal: ${items.reduce((s, i) => s + i.totalGrams, 0)}g`,
      );
    } catch {
      Alert.alert('Error', 'No se pudo registrar el cierre fisico');
    } finally {
      setSubmitting(false);
    }
  }, [counts]);

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
        style={styles.submitBtn}
        icon="clipboard-check"
      >
        Registrar Cierre Fisico
      </Button>

      <View style={{ height: 32 }} />
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
