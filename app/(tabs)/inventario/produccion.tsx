import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, TextInput, Button, Divider, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { ProductionRecipe } from '../../../src/domain/entities';
import { Worker } from '../../../src/domain/entities';

interface RecipeEntry {
  recipe: ProductionRecipe;
  batches: string;
}

export default function ProduccionScreen() {
  const theme = useTheme();
  const { productionService, workerRepo } = useDI();
  const { selectedStoreId } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [entries, setEntries] = useState<RecipeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [allWorkers, recipes] = await Promise.all([
          workerRepo.getAll(),
          productionService.getRecipes(),
        ]);
        setWorkers(allWorkers.filter((w) => w.isActive));
        setEntries(recipes.map((r) => ({ recipe: r, batches: '0' })));
      } catch {
        showError('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    })();
  }, [workerRepo, productionService]);

  const handleBatchChange = useCallback((recipeId: string, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.recipe.id === recipeId ? { ...e, batches: value } : e)),
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedWorkerId) {
      showError('Selecciona un trabajador');
      return;
    }
    if (!selectedStoreId) {
      showError('Selecciona un local');
      return;
    }

    const toProcess = entries.filter((e) => {
      const b = parseInt(e.batches, 10);
      return !isNaN(b) && b > 0;
    });

    if (toProcess.length === 0) {
      showError('Ingresa al menos 1 lote en alguna receta');
      return;
    }

    setSubmitting(true);
    try {
      let totalProduced = 0;
      for (const entry of toProcess) {
        const batches = parseInt(entry.batches, 10);
        await productionService.registerProduction(
          selectedStoreId,
          selectedWorkerId,
          entry.recipe.id,
          batches,
        );
        totalProduced += entry.recipe.outputGrams * batches;
      }

      showSuccess(`Produccion registrada: ${Math.round(totalProduced)}g en ${toProcess.length} receta(s)`);
      setEntries((prev) => prev.map((e) => ({ ...e, batches: '0' })));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al registrar produccion');
    } finally {
      setSubmitting(false);
    }
  }, [selectedWorkerId, selectedStoreId, entries, productionService, showSuccess, showError]);

  if (loading) {
    return <LoadingIndicator message="Cargando recetas de produccion..." />;
  }

  return (
    <ScreenContainer scrollable padded>
      <StoreSelector />

      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Registro de Produccion
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Selecciona las recetas y numero de lotes producidos
      </Text>

      <SearchableSelect
        options={workers.map((w) => ({ value: w.id, label: w.name, subtitle: w.role }))}
        selectedValue={selectedWorkerId}
        placeholder="Seleccionar trabajador"
        icon="account"
        onSelect={setSelectedWorkerId}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="book-open-variant"
          title="Sin recetas"
          subtitle="Crea recetas de produccion primero"
        />
      ) : (
        entries.map((entry, index) => (
          <Card key={entry.recipe.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
            <Card.Content>
              <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                {entry.recipe.name}
              </Text>
              <Text variant="bodySmall" style={{ color: '#999', marginTop: 4 }}>
                Produce: {entry.recipe.outputBags} bolsa(s) de{' '}
                {Math.round(entry.recipe.outputGrams / entry.recipe.outputBags)}g por lote
              </Text>
              <View style={styles.batchRow}>
                <Text variant="bodyMedium" style={{ color: '#F5F0EB', flex: 1 }}>
                  Lotes:
                </Text>
                <TextInput
                  mode="outlined"
                  dense
                  keyboardType="numeric"
                  value={entry.batches}
                  onChangeText={(v) => handleBatchChange(entry.recipe.id, v)}
                  style={styles.batchInput}
                  outlineColor="#333"
                  activeOutlineColor="#E63946"
                  textColor="#F5F0EB"
                />
              </View>
              {parseInt(entry.batches, 10) > 0 && (
                <Text variant="bodySmall" style={{ color: '#4CAF50', marginTop: 4 }}>
                  = {Math.round(entry.recipe.outputGrams * parseInt(entry.batches, 10))}g producidos
                </Text>
              )}
            </Card.Content>
          </Card>
        ))
      )}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitBtn}
        icon="factory"
        buttonColor="#E63946"
      >
        Registrar Produccion
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
  title: {
    marginTop: 16,
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  workerBtn: {
    marginBottom: 16,
  },
  menu: {
    width: 300,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  batchInput: {
    width: 80,
    backgroundColor: '#111111',
  },
  submitBtn: {
    marginTop: 24,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
