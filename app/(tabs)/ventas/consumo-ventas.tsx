import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card, Divider, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { todayColombia } from '../../../src/utils/dates';

interface SupplyConsumption {
  supplyId: string;
  supplyName: string;
  totalGrams: number;
  breakdown: { productName: string; portions: number; gramsPerPortion: number; subtotalGrams: number }[];
}

export default function ConsumoVentasScreen() {
  const theme = useTheme();
  const { saleRepo, recipeRepo } = useDI();
  const { selectedStoreId } = useAppStore();
  const { supplies, products: cachedProducts } = useMasterDataStore();
  const { snackbar, showError, hideSnackbar } = useSnackbar();

  const [date, setDate] = useState(todayColombia());
  const [loading, setLoading] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [consumption, setConsumption] = useState<SupplyConsumption[]>([]);
  const [totalPortions, setTotalPortions] = useState(0);
  const [salesCount, setSalesCount] = useState(0);

  const supplyMap = new Map(supplies.map((s) => [s.id, s]));
  const productMap = new Map(cachedProducts.map((p) => [p.id, p]));

  const handleCalculate = useCallback(async () => {
    if (!selectedStoreId) {
      showError('Selecciona un local');
      return;
    }

    setLoading(true);
    try {
      const dayStart = `${date}T00:00:00`;
      const dayEnd = `${date}T23:59:59`;

      const [sales, recipes] = await Promise.all([
        saleRepo.getByDateRange(selectedStoreId, dayStart, dayEnd),
        recipeRepo.getAll(),
      ]);

      const recipeByProductId = new Map(recipes.map((r) => [r.productId, r]));

      // Accumulate consumption per supply
      const consumptionMap = new Map<string, { totalGrams: number; breakdown: SupplyConsumption['breakdown'] }>();

      let portionsTotal = 0;

      for (const sale of sales) {
        for (const item of sale.items) {
          const recipe = recipeByProductId.get(item.productId);
          if (!recipe) continue;

          portionsTotal += item.portions;

          for (const ing of recipe.ingredients) {
            const gramsConsumed = ing.gramsPerPortion * item.portions;
            const existing = consumptionMap.get(ing.supplyId) ?? { totalGrams: 0, breakdown: [] };
            existing.totalGrams += gramsConsumed;

            // Accumulate per product in breakdown
            const existingBreakdown = existing.breakdown.find((b) => b.productName === (productMap.get(item.productId)?.name ?? item.productId));
            if (existingBreakdown) {
              existingBreakdown.portions += item.portions;
              existingBreakdown.subtotalGrams += gramsConsumed;
            } else {
              existing.breakdown.push({
                productName: productMap.get(item.productId)?.name ?? item.productId,
                portions: item.portions,
                gramsPerPortion: ing.gramsPerPortion,
                subtotalGrams: gramsConsumed,
              });
            }

            consumptionMap.set(ing.supplyId, existing);
          }
        }
      }

      const result: SupplyConsumption[] = Array.from(consumptionMap.entries())
        .map(([supplyId, data]) => ({
          supplyId,
          supplyName: supplyMap.get(supplyId)?.name ?? supplyId,
          totalGrams: data.totalGrams,
          breakdown: data.breakdown.sort((a, b) => b.subtotalGrams - a.subtotalGrams),
        }))
        .sort((a, b) => b.totalGrams - a.totalGrams);

      setConsumption(result);
      setTotalPortions(portionsTotal);
      setSalesCount(sales.length);
      setCalculated(true);
    } catch {
      showError('Error al calcular consumo');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, date, saleRepo, recipeRepo, supplyMap, productMap, showError]);

  const handleDateChange = (offset: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    setDate(d.toISOString().slice(0, 10));
    setCalculated(false);
  };

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Consumo por Ventas
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Insumos descontados del inventario STORE por ventas del dia
      </Text>

      <StoreSelector excludeProductionCenter />

      <View style={styles.dateRow}>
        <Button mode="text" icon="chevron-left" onPress={() => handleDateChange(-1)} textColor="#999" compact>
          {''}
        </Button>
        <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
          {date}
        </Text>
        <Button mode="text" icon="chevron-right" onPress={() => handleDateChange(1)} textColor="#999" compact>
          {''}
        </Button>
      </View>

      <Button
        mode="contained"
        onPress={handleCalculate}
        loading={loading}
        disabled={loading}
        icon="chart-bar"
        style={styles.calcBtn}
        buttonColor="#E63946"
      >
        Calcular Consumo
      </Button>

      {loading && <LoadingIndicator message="Calculando..." />}

      {calculated && !loading && consumption.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Sin ventas"
          subtitle="No hay ventas registradas para este dia"
        />
      ) : calculated && !loading ? (
        <>
          <Card style={[styles.summaryCard, { backgroundColor: '#1E1E1E' }]}>
            <Card.Content style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text variant="headlineSmall" style={{ color: '#E63946', fontWeight: '700' }}>
                  {salesCount}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999' }}>Ventas</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text variant="headlineSmall" style={{ color: '#E63946', fontWeight: '700' }}>
                  {totalPortions}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999' }}>Porciones</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text variant="headlineSmall" style={{ color: '#E63946', fontWeight: '700' }}>
                  {consumption.length}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999' }}>Insumos</Text>
              </View>
            </Card.Content>
          </Card>

          {consumption.map((item) => (
            <Card key={item.supplyId} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600', flex: 1 }}>
                    {item.supplyName}
                  </Text>
                  <Text variant="titleSmall" style={{ color: '#E63946', fontWeight: '700' }}>
                    {Math.round(item.totalGrams)}g
                  </Text>
                </View>

                <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

                {item.breakdown.map((b) => (
                  <View key={b.productName} style={styles.breakdownRow}>
                    <Text variant="bodySmall" style={{ color: '#999', flex: 1 }}>
                      {b.productName}
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#999' }}>
                      {b.portions} porc x {b.gramsPerPortion}g
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#F5F0EB', width: 70, textAlign: 'right' }}>
                      {Math.round(b.subtotalGrams)}g
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          ))}
        </>
      ) : null}

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
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    gap: 8,
  },
  calcBtn: {
    marginBottom: 16,
    borderRadius: 8,
    paddingVertical: 4,
  },
  summaryCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  card: {
    marginBottom: 8,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
});
