import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Divider, useTheme, IconButton } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { formatCOP } from '../../../src/utils/currency';
import { toISODate } from '../../../src/utils/dates';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function CierresMensualesScreen() {
  const theme = useTheme();
  const { saleService, expenseRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-indexed
  const [loading, setLoading] = useState(true);

  // KPIs
  const [totalIngresos, setTotalIngresos] = useState(0);
  const [totalEgresos, setTotalEgresos] = useState(0);
  const [totalPortions, setTotalPortions] = useState(0);
  const [totalSaleDays, setTotalSaleDays] = useState(0);

  // Breakdown
  const [topCategories, setTopCategories] = useState<{ category: string; total: number }[]>([]);

  const loadData = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const firstDay = new Date(selectedYear, selectedMonth, 1);
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
      const startDate = toISODate(firstDay);
      const endDate = toISODate(lastDay);

      const [sales, expenses] = await Promise.all([
        saleService.getSalesByDateRange(selectedStoreId, startDate, endDate),
        expenseRepo.getByDateRange(selectedStoreId, startDate, endDate + 'T23:59:59'),
      ]);

      const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
      const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
      const portions = sales.reduce((sum, s) => sum + s.totalPortions, 0);

      // Count unique sale days
      const uniqueDays = new Set(sales.map((s) => s.timestamp.slice(0, 10)));

      setTotalIngresos(revenue);
      setTotalEgresos(expenseTotal);
      setTotalPortions(portions);
      setTotalSaleDays(uniqueDays.size);

      // Top 5 expense categories
      const categoryMap: Record<string, number> = {};
      for (const e of expenses) {
        categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
      }
      const sorted = Object.entries(categoryMap)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setTopCategories(sorted);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, selectedYear, selectedMonth, saleService, expenseRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const utilidad = totalIngresos - totalEgresos;
  const dailyAvg = totalSaleDays > 0 ? totalIngresos / totalSaleDays : 0;

  // Prevent navigating to future months
  const isCurrentOrFuture =
    selectedYear > now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth());

  if (loading) {
    return <LoadingIndicator message="Cargando cierre mensual..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      {/* Month Selector */}
      <View style={styles.monthSelector}>
        <IconButton icon="chevron-left" onPress={goToPreviousMonth} />
        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#F5F0EB' }}>
          {MONTH_NAMES[selectedMonth]} {selectedYear}
        </Text>
        <IconButton
          icon="chevron-right"
          onPress={goToNextMonth}
          disabled={isCurrentOrFuture}
        />
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <KpiCard icon="arrow-down-circle" label="Total Ingresos" value={formatCOP(totalIngresos)} color="#388E3C" />
        <KpiCard icon="arrow-up-circle" label="Total Egresos" value={formatCOP(totalEgresos)} color="#D32F2F" />
      </View>
      <View style={styles.kpiRow}>
        <KpiCard
          icon="chart-line"
          label="Utilidad Neta"
          value={formatCOP(utilidad)}
          color={utilidad >= 0 ? '#388E3C' : '#D32F2F'}
        />
      </View>

      {/* Breakdown */}
      <Card style={styles.breakdownCard} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: '600', color: '#F5F0EB', marginBottom: 12 }}>
            Resumen del Mes
          </Text>

          <View style={styles.statRow}>
            <Text variant="bodyMedium" style={{ color: '#F5F0EB' }}>Porciones vendidas</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '700', color: '#F5F0EB' }}>{totalPortions}</Text>
          </View>

          <View style={styles.statRow}>
            <Text variant="bodyMedium" style={{ color: '#F5F0EB' }}>Dias con ventas</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '700', color: '#F5F0EB' }}>{totalSaleDays}</Text>
          </View>

          <View style={styles.statRow}>
            <Text variant="bodyMedium" style={{ color: '#F5F0EB' }}>Promedio diario ventas</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '700', color: '#F5F0EB' }}>{formatCOP(dailyAvg)}</Text>
          </View>

          {topCategories.length > 0 && (
            <>
              <Divider style={styles.divider} />
              <Text variant="titleSmall" style={{ fontWeight: '600', color: '#F5F0EB', marginBottom: 8 }}>
                Top Categorias de Gasto
              </Text>
              {topCategories.map((cat) => (
                <View key={cat.category} style={styles.statRow}>
                  <Text variant="bodyMedium" style={{ color: '#F5F0EB', flex: 1 }} numberOfLines={1}>
                    {cat.category}
                  </Text>
                  <Text variant="bodyMedium" style={{ fontWeight: '700', color: '#D32F2F' }}>
                    {formatCOP(cat.total)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </Card.Content>
      </Card>

      <View style={{ height: 100 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  breakdownCard: {
    borderRadius: 12,
    marginTop: 4,
    backgroundColor: '#1E1E1E',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  divider: {
    marginVertical: 12,
  },
});
