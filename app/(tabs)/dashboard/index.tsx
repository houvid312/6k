import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Divider, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SalesChart } from '../../../src/components/dashboard/SalesChart';
import { PortionBreakdown } from '../../../src/components/dashboard/PortionBreakdown';
import { FoodCostGauge } from '../../../src/components/dashboard/FoodCostGauge';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { formatCOP } from '../../../src/utils/currency';
import { toISODate, formatDate } from '../../../src/utils/dates';

const PRODUCT_COLORS = ['#D32F2F', '#FFC107', '#388E3C', '#1976D2', '#7B1FA2', '#F57C00', '#00897B'];

export default function DashboardScreen() {
  const theme = useTheme();
  const { dashboardService, productRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);
  const [totalPortions, setTotalPortions] = useState(0);
  const [averageTicket, setAverageTicket] = useState(0);
  const [foodCost, setFoodCost] = useState(0);
  const [topProducts, setTopProducts] = useState<{ label: string; value: number }[]>([]);
  const [salesTrend, setSalesTrend] = useState<{ label: string; value: number }[]>([]);
  const [portionSegments, setPortionSegments] = useState<{ label: string; value: number; color: string }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const endDate = toISODate(now);
      const startDate = toISODate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const today = toISODate(now);

      // Get daily summary for KPIs
      const summary = await dashboardService.getDailySummary(selectedStoreId, today);
      setTotalSales(summary.totalRevenue);
      const salesCount = summary.totalSales;
      setAverageTicket(salesCount > 0 ? Math.round(summary.totalRevenue / salesCount) : 0);

      // Food cost
      const fc = await dashboardService.getFoodCostPercentage(startDate, endDate, selectedStoreId);
      setFoodCost(fc);

      // Top products
      const products = await productRepo.getAll();
      const productMap = new Map(products.map((p) => [p.id, p.name]));

      const top = await dashboardService.getTopProducts(selectedStoreId, startDate, endDate, 5);
      setTopProducts(
        top.map((t) => ({
          label: productMap.get(t.productId) ?? t.productId,
          value: t.totalRevenue,
        })),
      );

      // Portion breakdown from top products
      setPortionSegments(
        top.map((t, i) => ({
          label: productMap.get(t.productId) ?? t.productId,
          value: t.totalQuantity,
          color: PRODUCT_COLORS[i % PRODUCT_COLORS.length],
        })),
      );

      // Calculate total portions from all top products
      const tp = top.reduce((sum, t) => sum + t.totalQuantity, 0);
      setTotalPortions(tp);

      // Sales trend
      const trend = await dashboardService.getSalesTrend(selectedStoreId, startDate, endDate);
      setSalesTrend(
        trend.map((t) => ({
          label: t.date.slice(5),
          value: t.revenue,
        })),
      );
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, dashboardService, productRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingIndicator message="Cargando dashboard..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDate(new Date())}
        </Text>
      </View>

      {/* KPI Cards Row 1 */}
      <View style={styles.kpiRow}>
        <KpiCard
          icon="cash"
          label="Ventas Hoy"
          value={formatCOP(totalSales)}
          color="#388E3C"
        />
        <KpiCard
          icon="pizza"
          label="Porciones"
          value={String(totalPortions)}
          color="#F57C00"
        />
      </View>

      {/* KPI Cards Row 2 */}
      <View style={styles.kpiRow}>
        <KpiCard
          icon="receipt"
          label="Ticket Promedio"
          value={formatCOP(averageTicket)}
          color="#1976D2"
        />
      </View>

      {/* Food Cost Gauge */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <FoodCostGauge percentage={foodCost} />
        </Card.Content>
      </Card>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <SalesChart data={topProducts} title="Top Productos (Semana)" />
          </Card.Content>
        </Card>
      )}

      {/* Portion Breakdown */}
      {portionSegments.length > 0 && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <PortionBreakdown segments={portionSegments} title="Distribucion de Porciones" />
          </Card.Content>
        </Card>
      )}

      {/* Sales Trend */}
      {salesTrend.length > 0 && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <SalesChart data={salesTrend} title="Tendencia Diaria (Semana)" />
          </Card.Content>
        </Card>
      )}

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
});
