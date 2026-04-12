import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Chip, Divider, SegmentedButtons, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SalesChart } from '../../../src/components/dashboard/SalesChart';
import { PortionBreakdown } from '../../../src/components/dashboard/PortionBreakdown';
import { FoodCostGauge } from '../../../src/components/dashboard/FoodCostGauge';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { formatCOP } from '../../../src/utils/currency';
import { toISODate, formatDate } from '../../../src/utils/dates';
import type { ProductMargin } from '../../../src/services/DashboardService';

const PRODUCT_COLORS = ['#D32F2F', '#FFC107', '#388E3C', '#1976D2', '#7B1FA2', '#F57C00', '#00897B'];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

export default function DashboardScreen() {
  const theme = useTheme();
  const { dashboardService, saleService, expenseRepo } = useDI();
  const { selectedStoreId } = useAppStore();
  const { products: cachedProducts } = useMasterDataStore();

  // D1: Period filter
  type DashPeriod = 'today' | '7d' | '30d';
  const [dashPeriod, setDashPeriod] = useState<DashPeriod>('7d');

  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);
  const [totalPortions, setTotalPortions] = useState(0);
  const [averageTicket, setAverageTicket] = useState(0);
  const [foodCost, setFoodCost] = useState(0);
  const [topProducts, setTopProducts] = useState<{ label: string; value: number }[]>([]);
  const [salesTrend, setSalesTrend] = useState<{ label: string; value: number }[]>([]);
  const [portionSegments, setPortionSegments] = useState<{ label: string; value: number; color: string }[]>([]);

  // Feature 14: Demand by day of week
  const [demandByDay, setDemandByDay] = useState<{ label: string; value: number }[]>([]);
  const [busiestDay, setBusiestDay] = useState('');

  // Feature 15: Product margins and break-even
  const [productMargins, setProductMargins] = useState<ProductMargin[]>([]);
  const [fixedCosts, setFixedCosts] = useState(0);
  const [avgMarginPerPortion, setAvgMarginPerPortion] = useState(0);
  const [avgPricePerPortion, setAvgPricePerPortion] = useState(0);
  const [breakEvenPortions, setBreakEvenPortions] = useState(0);
  const [breakEvenRevenue, setBreakEvenRevenue] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const endDate = toISODate(now);
      const today = toISODate(now);
      // D1: Period-based start date
      const periodDays = dashPeriod === 'today' ? 0 : dashPeriod === '7d' ? 7 : 30;
      const startDate = periodDays === 0 ? today : toISODate(new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000));

      // Get daily summary for KPIs
      const summary = await dashboardService.getDailySummary(selectedStoreId, today);
      setTotalSales(summary.totalRevenue);
      const salesCount = summary.totalSales;
      setAverageTicket(salesCount > 0 ? Math.round(summary.totalRevenue / salesCount) : 0);

      // Food cost
      const fc = await dashboardService.getFoodCostPercentage(startDate, endDate, selectedStoreId);
      setFoodCost(fc);

      // Top products
      const productMap = new Map(cachedProducts.map((p) => [p.id, p.name]));

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

      // Feature 14: Demand by day of week (last 30 days)
      const thirtyDaysAgo = toISODate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      const sales30 = await saleService.getSalesByDateRange(selectedStoreId, thirtyDaysAgo, endDate);

      const dayTotals: number[] = [0, 0, 0, 0, 0, 0, 0];
      const dayCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
      const daysWithSales = new Set<string>();

      for (const sale of sales30) {
        const saleDate = new Date(sale.timestamp);
        const dayIndex = saleDate.getDay();
        const dateKey = sale.timestamp.substring(0, 10);

        dayTotals[dayIndex] += sale.totalPortions;

        if (!daysWithSales.has(`${dayIndex}-${dateKey}`)) {
          daysWithSales.add(`${dayIndex}-${dateKey}`);
          dayCounts[dayIndex] += 1;
        }
      }

      const dayData = DAY_NAMES.map((name, i) => ({
        label: name,
        value: dayCounts[i] > 0 ? Math.round(dayTotals[i] / dayCounts[i]) : 0,
      }));
      setDemandByDay(dayData);

      const maxDayValue = Math.max(...dayData.map((d) => d.value));
      const busiest = dayData.find((d) => d.value === maxDayValue);
      setBusiestDay(busiest?.label ?? '');

      // Feature 15: Product margins
      const margins = await dashboardService.getProductMargins(selectedStoreId, thirtyDaysAgo, endDate);
      setProductMargins(margins);

      // Break-even: get fixed costs (Arriendo + Servicios) for the last 30 days
      const expenses30 = await expenseRepo.getByDateRange(selectedStoreId, thirtyDaysAgo, endDate + 'T23:59:59');
      const fixedCostCategories = ['Arriendo', 'Servicios', 'arriendo', 'servicios'];
      const totalFixed = expenses30
        .filter((e) => fixedCostCategories.includes(e.category))
        .reduce((sum, e) => sum + e.amount, 0);
      setFixedCosts(totalFixed);

      // Average margin and price per portion across all products
      const totalMargin = margins.reduce((sum, m) => sum + m.margin, 0);
      const totalPort = margins.reduce((sum, m) => sum + m.portionsSold, 0);
      const totalRev = margins.reduce((sum, m) => sum + m.revenue, 0);

      const avgMargin = totalPort > 0 ? totalMargin / totalPort : 0;
      const avgPrice = totalPort > 0 ? totalRev / totalPort : 0;
      setAvgMarginPerPortion(Math.round(avgMargin));
      setAvgPricePerPortion(Math.round(avgPrice));

      const bep = avgMargin > 0 ? Math.ceil(totalFixed / avgMargin) : 0;
      setBreakEvenPortions(bep);
      setBreakEvenRevenue(Math.round(bep * avgPrice));
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, dashboardService, cachedProducts, saleService, expenseRepo, dashPeriod]);

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

      {/* D1: Period filter */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        {([
          { value: 'today' as DashPeriod, label: 'Hoy' },
          { value: '7d' as DashPeriod, label: '7 dias' },
          { value: '30d' as DashPeriod, label: '30 dias' },
        ]).map((opt) => (
          <Chip
            key={opt.value}
            selected={dashPeriod === opt.value}
            onPress={() => setDashPeriod(opt.value)}
            mode="flat"
            compact
            style={{
              backgroundColor: dashPeriod === opt.value ? theme.colors.primary : '#2A2A2A',
            }}
            textStyle={{
              color: dashPeriod === opt.value ? '#FFFFFF' : '#999',
              fontWeight: dashPeriod === opt.value ? '600' : '400',
            }}
            showSelectedOverlay={false}
          >
            {opt.label}
          </Chip>
        ))}
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

      {/* Feature 14: Demand by Day of Week */}
      {demandByDay.length > 0 && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
              Demanda por Dia (Ultimos 30 dias)
            </Text>
            {demandByDay.map((item, index) => {
              const maxVal = Math.max(...demandByDay.map((d) => d.value), 1);
              const widthPercent = (item.value / maxVal) * 100;
              const isBusiest = item.label === busiestDay;
              return (
                <View key={index} style={styles.barRow}>
                  <Text
                    variant="labelSmall"
                    style={[
                      styles.dayLabel,
                      { color: isBusiest ? '#E63946' : theme.colors.onSurfaceVariant },
                      isBusiest && { fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${widthPercent}%`,
                          backgroundColor: isBusiest ? '#E63946' : theme.colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    variant="labelSmall"
                    style={[
                      styles.barValue,
                      { fontWeight: isBusiest ? '700' : '600' },
                      isBusiest && { color: '#E63946' },
                    ]}
                  >
                    {item.value}
                  </Text>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      )}

      {/* Feature 15: Product Margins */}
      {productMargins.length > 0 && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
              Margenes por Producto
            </Text>
            {/* Header row */}
            <View style={styles.marginHeader}>
              <Text variant="labelSmall" style={[styles.marginColName, { color: theme.colors.onSurfaceVariant }]}>
                Producto
              </Text>
              <Text variant="labelSmall" style={[styles.marginColNum, { color: theme.colors.onSurfaceVariant }]}>
                Ingreso
              </Text>
              <Text variant="labelSmall" style={[styles.marginColNum, { color: theme.colors.onSurfaceVariant }]}>
                Costo
              </Text>
              <Text variant="labelSmall" style={[styles.marginColNum, { color: theme.colors.onSurfaceVariant }]}>
                Margen
              </Text>
              <Text variant="labelSmall" style={[styles.marginColPct, { color: theme.colors.onSurfaceVariant }]}>
                %
              </Text>
            </View>
            <Divider style={{ marginBottom: 6 }} />
            {productMargins.map((pm) => {
              const marginColor = pm.marginPercent > 40 ? '#388E3C' : pm.marginPercent >= 20 ? '#F57C00' : '#D32F2F';
              return (
                <View key={pm.productId} style={styles.marginRow}>
                  <Text variant="labelSmall" style={styles.marginColName} numberOfLines={1}>
                    {pm.productName}
                  </Text>
                  <Text variant="labelSmall" style={styles.marginColNum}>
                    {formatCOP(pm.revenue)}
                  </Text>
                  <Text variant="labelSmall" style={styles.marginColNum}>
                    {formatCOP(pm.ingredientCost)}
                  </Text>
                  <Text variant="labelSmall" style={[styles.marginColNum, { color: marginColor, fontWeight: '600' }]}>
                    {formatCOP(pm.margin)}
                  </Text>
                  <Text variant="labelSmall" style={[styles.marginColPct, { color: marginColor, fontWeight: '700' }]}>
                    {pm.marginPercent}%
                  </Text>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      )}

      {/* Feature 15: Break-Even Point */}
      {fixedCosts > 0 && avgMarginPerPortion > 0 && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
              Punto de Equilibrio
            </Text>
            <View style={styles.breakEvenRow}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Costos fijos mensuales (Arriendo + Servicios):
              </Text>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                {formatCOP(fixedCosts)}
              </Text>
            </View>
            <View style={styles.breakEvenRow}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Margen promedio por porcion:
              </Text>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                {formatCOP(avgMarginPerPortion)}
              </Text>
            </View>
            <Divider style={{ marginVertical: 10 }} />
            <View style={[styles.breakEvenHighlight, { backgroundColor: '#E6394610' }]}>
              <Text variant="bodyMedium" style={{ fontWeight: '700', color: '#E63946', textAlign: 'center' }}>
                Necesitas vender {breakEvenPortions} porciones ({formatCOP(breakEvenRevenue)}) para cubrir costos fijos
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      <View style={{ height: 80 }} />
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
  // Feature 14: Demand by day
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayLabel: {
    width: 80,
    marginRight: 8,
  },
  barContainer: {
    flex: 1,
    height: 20,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    height: 20,
    borderRadius: 4,
  },
  barValue: {
    width: 40,
    textAlign: 'right',
    marginLeft: 8,
  },
  // Feature 15: Margins table
  marginHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  marginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  marginColName: {
    flex: 2,
    marginRight: 4,
  },
  marginColNum: {
    flex: 1.5,
    textAlign: 'right',
    marginRight: 4,
    fontSize: 11,
  },
  marginColPct: {
    width: 40,
    textAlign: 'right',
  },
  // Feature 15: Break-even
  breakEvenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakEvenHighlight: {
    padding: 12,
    borderRadius: 8,
  },
});
