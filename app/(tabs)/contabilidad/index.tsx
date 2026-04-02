import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Text, Button, Divider, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Sale, Expense } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';
import { formatDateTime, toISODate } from '../../../src/utils/dates';

export default function ContabilidadScreen() {
  const theme = useTheme();
  const { dashboardService, saleService, expenseRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const [ingresos, setIngresos] = useState(0);
  const [egresos, setEgresos] = useState(0);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = toISODate(new Date());
      const summary = await dashboardService.getDailySummary(selectedStoreId, today);
      setIngresos(summary.totalRevenue);
      setEgresos(summary.totalExpenses);

      const sales = await saleService.getSalesByStore(selectedStoreId);
      setRecentSales(sales.slice(-5).reverse());

      const expenses = await expenseRepo.getAll(selectedStoreId);
      setRecentExpenses(expenses.slice(-5).reverse());
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, dashboardService, saleService, expenseRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const utilidad = ingresos - egresos;

  if (loading) {
    return <LoadingIndicator message="Cargando datos contables..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <KpiCard icon="arrow-down-circle" label="Ingresos" value={formatCOP(ingresos)} color="#388E3C" />
        <KpiCard icon="arrow-up-circle" label="Egresos" value={formatCOP(egresos)} color="#D32F2F" />
      </View>
      <View style={styles.kpiRow}>
        <KpiCard
          icon="chart-line"
          label="Utilidad"
          value={formatCOP(utilidad)}
          color={utilidad >= 0 ? '#388E3C' : '#D32F2F'}
        />
      </View>

      {/* Nav buttons */}
      <View style={styles.navRow}>
        <Button
          mode="outlined"
          icon="wallet"
          onPress={() => router.push('/(tabs)/contabilidad/gastos')}
        >
          Gastos
        </Button>
        <Button
          mode="outlined"
          icon="bank"
          onPress={() => router.push('/(tabs)/contabilidad/bancos')}
        >
          Bancos
        </Button>
      </View>

      {/* Recent transactions */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Transacciones Recientes
      </Text>

      {recentSales.map((sale) => (
        <Card key={sale.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Venta</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatDateTime(sale.timestamp)}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#388E3C' }}>
              +{formatCOP(sale.totalAmount)}
            </Text>
          </Card.Content>
        </Card>
      ))}

      {recentExpenses.map((expense) => (
        <Card key={expense.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{expense.category}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {expense.description}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#D32F2F' }}>
              -{formatCOP(expense.amount)}
            </Text>
          </Card.Content>
        </Card>
      ))}

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  navRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  txCard: {
    borderRadius: 8,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
