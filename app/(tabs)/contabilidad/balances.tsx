import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Divider, SegmentedButtons, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { formatCOP } from '../../../src/utils/currency';
import { toISODate, formatDate } from '../../../src/utils/dates';

type BalancePeriod = 'SEMANA' | 'MES' | 'TRIMESTRE';

function getPeriodDates(period: BalancePeriod): { start: string; end: string } {
  const now = new Date();
  const end = toISODate(now);
  let start: Date;

  if (period === 'SEMANA') {
    start = new Date(now);
    start.setDate(now.getDate() - 7);
  } else if (period === 'MES') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  }

  return { start: toISODate(start), end };
}

export default function BalancesScreen() {
  const theme = useTheme();
  const { saleService, expenseRepo } = useDI();
  const { selectedStoreId, stores } = useAppStore();

  const [period, setPeriod] = useState<BalancePeriod>('MES');
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [advancesTotal, setAdvancesTotal] = useState(0);
  const [expensesByCategory, setExpensesByCategory] = useState<Record<string, number>>({});
  const [useAllStores, setUseAllStores] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period);
      const storeIds = useAllStores
        ? stores.filter((s) => s.isActive).map((s) => s.id)
        : [selectedStoreId];

      let totalRev = 0;
      let totalExp = 0;
      let totalAdv = 0;
      const catMap: Record<string, number> = {};

      for (const storeId of storeIds) {
        const sales = await saleService.getSalesByDateRange(storeId, start, end);
        totalRev += sales.reduce((s, sale) => s + sale.totalAmount, 0);

        const exps = await expenseRepo.getByDateRange(storeId, start, end + 'T23:59:59');
        for (const e of exps) {
          if (e.category === 'Adelanto') {
            totalAdv += e.amount;
          } else {
            totalExp += e.amount;
            catMap[e.category] = (catMap[e.category] ?? 0) + e.amount;
          }
        }
      }

      setRevenue(totalRev);
      setExpenses(totalExp);
      setAdvancesTotal(totalAdv);
      setExpensesByCategory(catMap);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [period, selectedStoreId, stores, useAllStores, saleService, expenseRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const margin = revenue - expenses;
  const { start, end } = getPeriodDates(period);

  return (
    <ScreenContainer>
      <StoreSelector />

      <SegmentedButtons
        value={period}
        onValueChange={(v) => setPeriod(v as BalancePeriod)}
        buttons={[
          { value: 'SEMANA', label: 'Semana' },
          { value: 'MES', label: 'Mes' },
          { value: 'TRIMESTRE', label: 'Trimestre' },
        ]}
        density="small"
        style={{ marginVertical: 12 }}
      />

      <SegmentedButtons
        value={useAllStores ? 'all' : 'one'}
        onValueChange={(v) => setUseAllStores(v === 'all')}
        buttons={[
          { value: 'one', label: 'Esta Sede' },
          { value: 'all', label: 'Consolidado' },
        ]}
        density="small"
        style={{ marginBottom: 16 }}
      />

      {loading ? (
        <LoadingIndicator />
      ) : (
        <>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12, textAlign: 'center' }}>
            {formatDate(start)} — {formatDate(end)}
          </Text>

          <Card style={styles.card} mode="elevated">
            <Card.Content>
              <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 12 }}>
                Resumen Financiero
              </Text>
              <View style={styles.row}>
                <Text variant="bodyMedium">Ingresos Totales</Text>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{formatCOP(revenue)}</Text>
              </View>
              <View style={styles.row}>
                <Text variant="bodyMedium">Gastos Operativos</Text>
                <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#D32F2F' }}>{formatCOP(expenses)}</Text>
              </View>
              {advancesTotal > 0 && (
                <View style={styles.row}>
                  <Text variant="bodySmall" style={{ color: '#F57C00' }}>Adelantos nómina (Cartera)</Text>
                  <Text variant="bodySmall" style={{ fontWeight: '600', color: '#F57C00' }}>{formatCOP(advancesTotal)}</Text>
                </View>
              )}
              <Divider style={{ marginVertical: 8 }} />
              <View style={styles.row}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Utilidad Neta</Text>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: margin >= 0 ? '#388E3C' : '#D32F2F' }}>
                  {formatCOP(margin)}
                </Text>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card} mode="elevated">
            <Card.Content>
              <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
                Desglose de Gastos
              </Text>
              {Object.entries(expensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => (
                  <View key={cat} style={styles.row}>
                    <Text variant="bodySmall">{cat}</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(amount)}</Text>
                  </View>
                ))}
              {Object.keys(expensesByCategory).length === 0 && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Sin gastos en este periodo</Text>
              )}
            </Card.Content>
          </Card>
        </>
      )}

      <View style={{ height: 80 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
});
