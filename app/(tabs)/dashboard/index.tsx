import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Chip, Divider, TextInput, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { FlavorDistributionChart, FlavorSegment } from '../../../src/components/dashboard/FlavorDistributionChart';
import { ProductionCenterDashboard } from '../../../src/components/dashboard/ProductionCenterDashboard';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, todayColombia } from '../../../src/utils/dates';

interface MonthRow {
  monthName: string;
  monthIndex: number;
  daysOperated: number;
  totalUnits: number;
  dailyAvgUnits: number;
  totalPesos: number;
  dailyAvgPesos: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const FLAVOR_COLORS: Record<string, string> = {
  'HAWAIANA': '#1E88E5',
  'JAMON TOCI': '#E53935',
  'POLLO CHAMPI': '#FFB300',
  'NAPOLITANA': '#43A047',
  'JAMON': '#FB8C00',
  'PEPERONI': '#8E24AA',
  'MEXICANA': '#00ACC1',
  'MAICITOS': '#E64A19',
  'MARGARITA': '#FDD835',
};

const DEFAULT_COLORS = ['#3949AB', '#D81B60', '#00897B', '#7CB342', '#F4511E', '#5E35B1', '#039BE5'];

export default function DashboardScreen() {
  const theme = useTheme();
  const { saleRepo, productRepo } = useDI();
  const { selectedStoreId, stores } = useAppStore();
  const { products: cachedProducts } = useMasterDataStore();

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const isProductionCenter = selectedStore?.isProductionCenter ?? false;

  const todayStr = todayColombia();
  const LAUNCH_DATE = '2026-08-01'; // Default launch date for 6K Pizza app

  type FilterPreset = 'launch' | 'month' | 'year' | 'custom';
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('launch');
  const [startDateStr, setStartDateStr] = useState<string>(LAUNCH_DATE);
  const [endDateStr, setEndDateStr] = useState<string>(todayStr);

  const [loading, setLoading] = useState(true);
  const [totalDays, setTotalDays] = useState(0);

  // Store Totals
  const [grandTotalUnits, setGrandTotalUnits] = useState(0);
  const [grandDailyAvgUnits, setGrandDailyAvgUnits] = useState(0);
  const [grandTotalPesos, setGrandTotalPesos] = useState(0);
  const [grandDailyAvgPesos, setGrandDailyAvgPesos] = useState(0);

  // Tables & Category Filters
  type CategoryTab = 'PIZZAS' | 'BEBIDAS' | 'ADICIONES_EMPAQUES' | 'TODOS';
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('PIZZAS');

  const [pizzaRows, setPizzaRows] = useState<FlavorSegment[]>([]);
  const [beverageRows, setBeverageRows] = useState<FlavorSegment[]>([]);
  const [addPkgRows, setAddPkgRows] = useState<FlavorSegment[]>([]);
  const [allProductRows, setAllProductRows] = useState<FlavorSegment[]>([]);

  const [catTotals, setCatTotals] = useState({
    pizzaUnits: 0,
    pizzaPesos: 0,
    beverageUnits: 0,
    beveragePesos: 0,
    addPkgUnits: 0,
    addPkgPesos: 0,
  });

  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);

  // Update dates based on filterPreset
  const applyPreset = (preset: FilterPreset) => {
    setFilterPreset(preset);
    const now = new Date();
    if (preset === 'launch') {
      setStartDateStr(LAUNCH_DATE);
      setEndDateStr(todayStr);
    } else if (preset === 'month') {
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      setStartDateStr(monthStart);
      setEndDateStr(todayStr);
    } else if (preset === 'year') {
      setStartDateStr(`${now.getFullYear()}-01-01`);
      setEndDateStr(todayStr);
    }
  };

  const loadDashboardData = useCallback(async () => {
    if (!selectedStoreId || isProductionCenter) {
      setLoading(false);
      return;
    }

    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_REGEX.test(startDateStr) || !DATE_REGEX.test(endDateStr)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Calculate exact operating days between startDateStr and endDateStr
      const startObj = new Date(`${startDateStr}T00:00:00-05:00`);
      const endObj = new Date(`${endDateStr}T23:59:59-05:00`);
      if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
        setLoading(false);
        return;
      }
      const daysCount = Math.max(1, Math.ceil((endObj.getTime() - startObj.getTime()) / (1000 * 3600 * 24)));
      setTotalDays(daysCount);

      // Get all sales for store in date range
      const [sales, dbProducts] = await Promise.all([
        saleRepo.getByDateRange(selectedStoreId, startDateStr, endDateStr),
        cachedProducts.length > 0 ? cachedProducts : productRepo.getAll(),
      ]);

      const fullProductMap = new Map(dbProducts.map((p) => [p.id, p]));

      // 1. Calculate Product breakdowns by category
      const pizzaMap = new Map<string, { units: number; pesos: number }>();
      const beverageMap = new Map<string, { units: number; pesos: number }>();
      const addPkgMap = new Map<string, { units: number; pesos: number }>();
      const allProductMap = new Map<string, { units: number; pesos: number }>();

      let pizzaUnitsSum = 0;
      let pizzaPesosSum = 0;
      let beverageUnitsSum = 0;
      let beveragePesosSum = 0;
      let addPkgUnitsSum = 0;
      let addPkgPesosSum = 0;

      let totalUnitsSum = 0;
      let totalPesosSum = 0;

      for (const sale of sales) {
        totalPesosSum += sale.totalAmount;

        for (const item of sale.items) {
          const prodObj = fullProductMap.get(item.productId);
          const rawName = prodObj?.name ?? item.formatName ?? item.productId;
          const flavorKey = rawName.toUpperCase();
          const itemUnits = item.portions || item.quantity || 1;
          const itemPesos = item.subtotal;

          totalUnitsSum += itemUnits;

          // All products map
          const allExist = allProductMap.get(flavorKey) ?? { units: 0, pesos: 0 };
          allExist.units += itemUnits;
          allExist.pesos += itemPesos;
          allProductMap.set(flavorKey, allExist);

          const upperName = rawName.toUpperCase();
          const category = (prodObj?.category === 'BEBIDA' || upperName.includes('GASEOSA') || upperName.includes('JUGO') || upperName.includes('AGUA') || upperName.includes('BEBIDA') || upperName.includes('CERVEZA') || upperName.includes('COCA') || upperName.includes('POSTOBON'))
            ? 'BEBIDAS'
            : (upperName.includes('CAJA') || upperName.includes('EMPAQUE') || upperName.includes('BOLSA') || upperName.includes('ADICION') || upperName.includes('ADICIÓN'))
              ? 'ADICIONES_EMPAQUES'
              : 'PIZZAS';

          if (category === 'BEBIDAS') {
            const exist = beverageMap.get(flavorKey) ?? { units: 0, pesos: 0 };
            exist.units += itemUnits;
            exist.pesos += itemPesos;
            beverageMap.set(flavorKey, exist);
            beverageUnitsSum += itemUnits;
            beveragePesosSum += itemPesos;
          } else if (category === 'ADICIONES_EMPAQUES') {
            const exist = addPkgMap.get(flavorKey) ?? { units: 0, pesos: 0 };
            exist.units += itemUnits;
            exist.pesos += itemPesos;
            addPkgMap.set(flavorKey, exist);
            addPkgUnitsSum += itemUnits;
            addPkgPesosSum += itemPesos;
          } else {
            const exist = pizzaMap.get(flavorKey) ?? { units: 0, pesos: 0 };
            exist.units += itemUnits;
            exist.pesos += itemPesos;
            pizzaMap.set(flavorKey, exist);
            pizzaUnitsSum += itemUnits;
            pizzaPesosSum += itemPesos;
          }

          // Process item additions
          if (item.additions && item.additions.length > 0) {
            for (const add of item.additions) {
              const addKey = add.name ? `➕ ${add.name.toUpperCase()}` : '➕ ADICIÓN';
              const addUnits = add.quantity || 1;
              const addPesos = (add.price || 0) * addUnits;

              const exist = addPkgMap.get(addKey) ?? { units: 0, pesos: 0 };
              exist.units += addUnits;
              exist.pesos += addPesos;
              addPkgMap.set(addKey, exist);
              addPkgUnitsSum += addUnits;
              addPkgPesosSum += addPesos;
            }
          }

          // Process item packaging
          if (item.packagingLabel && item.packagingQuantity) {
            const pkgKey = `📦 ${item.packagingLabel.toUpperCase()}`;
            const pkgUnits = item.packagingQuantity || 1;
            const pkgPesos = item.packagingTotal || 0;

            const exist = addPkgMap.get(pkgKey) ?? { units: 0, pesos: 0 };
            exist.units += pkgUnits;
            exist.pesos += pkgPesos;
            addPkgMap.set(pkgKey, exist);
            addPkgUnitsSum += pkgUnits;
            addPkgPesosSum += pkgPesos;
          }
        }
      }

      setGrandTotalUnits(totalUnitsSum);
      setGrandTotalPesos(totalPesosSum);

      const dailyAvgU = daysCount > 0 ? totalUnitsSum / daysCount : 0;
      const dailyAvgP = daysCount > 0 ? totalPesosSum / daysCount : 0;
      setGrandDailyAvgUnits(Math.round(dailyAvgU * 10) / 10);
      setGrandDailyAvgPesos(Math.round(dailyAvgP));

      let colorIdx = 0;
      const buildSegments = (map: Map<string, { units: number; pesos: number }>, catTotalUnits: number): FlavorSegment[] => {
        return Array.from(map.entries())
          .map(([name, data]) => {
            const pct = catTotalUnits > 0 ? Math.round((data.units / catTotalUnits) * 1000) / 10 : 0;
            const color = FLAVOR_COLORS[name] ?? DEFAULT_COLORS[colorIdx++ % DEFAULT_COLORS.length];
            return {
              flavorName: name,
              totalUnits: data.units,
              dailyAvgUnits: daysCount > 0 ? Math.round((data.units / daysCount) * 10) / 10 : 0,
              percentage: pct,
              color,
            };
          })
          .sort((a, b) => b.totalUnits - a.totalUnits);
      };

      setPizzaRows(buildSegments(pizzaMap, pizzaUnitsSum));
      setBeverageRows(buildSegments(beverageMap, beverageUnitsSum));
      setAddPkgRows(buildSegments(addPkgMap, addPkgUnitsSum));
      setAllProductRows(buildSegments(allProductMap, totalUnitsSum));

      setCatTotals({
        pizzaUnits: pizzaUnitsSum,
        pizzaPesos: pizzaPesosSum,
        beverageUnits: beverageUnitsSum,
        beveragePesos: beveragePesosSum,
        addPkgUnits: addPkgUnitsSum,
        addPkgPesos: addPkgPesosSum,
      });

      // 2. Calculate Monthly breakdown (Enero to Diciembre)
      const currentYear = new Date(startDateStr).getFullYear();
      const monthBuckets = Array.from({ length: 12 }, (_, idx) => ({
        monthName: MONTH_NAMES[idx],
        monthIndex: idx,
        daysOperated: 0,
        totalUnits: 0,
        dailyAvgUnits: 0,
        totalPesos: 0,
        dailyAvgPesos: 0,
      }));

      // Set days operated for each month in range
      const now = new Date();
      for (let m = 0; m < 12; m++) {
        const daysInM = new Date(currentYear, m + 1, 0).getDate();
        const currentM = now.getMonth();
        if (m < currentM) {
          monthBuckets[m].daysOperated = daysInM;
        } else if (m === currentM) {
          monthBuckets[m].daysOperated = Math.max(1, now.getDate());
        } else {
          monthBuckets[m].daysOperated = 0;
        }
      }

      for (const sale of sales) {
        const sDate = new Date(sale.timestamp);
        const mIdx = sDate.getMonth();
        if (mIdx >= 0 && mIdx < 12) {
          monthBuckets[mIdx].totalUnits += sale.totalPortions;
          monthBuckets[mIdx].totalPesos += sale.totalAmount;
        }
      }

      for (const m of monthBuckets) {
        if (m.daysOperated > 0) {
          m.dailyAvgUnits = Math.round((m.totalUnits / m.daysOperated) * 10) / 10;
          m.dailyAvgPesos = Math.round(m.totalPesos / m.daysOperated);
        }
      }

      setMonthRows(monthBuckets);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [cachedProducts, endDateStr, isProductionCenter, productRepo, saleRepo, selectedStoreId, startDateStr]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const currentCategoryRows =
    categoryTab === 'PIZZAS'
      ? pizzaRows
      : categoryTab === 'BEBIDAS'
        ? beverageRows
        : categoryTab === 'ADICIONES_EMPAQUES'
          ? addPkgRows
          : allProductRows;

  const currentCategoryUnits =
    categoryTab === 'PIZZAS'
      ? catTotals.pizzaUnits
      : categoryTab === 'BEBIDAS'
        ? catTotals.beverageUnits
        : categoryTab === 'ADICIONES_EMPAQUES'
          ? catTotals.addPkgUnits
          : grandTotalUnits;

  const currentCategoryPesos =
    categoryTab === 'PIZZAS'
      ? catTotals.pizzaPesos
      : categoryTab === 'BEBIDAS'
        ? catTotals.beveragePesos
        : categoryTab === 'ADICIONES_EMPAQUES'
          ? catTotals.addPkgPesos
          : grandTotalPesos;

  const currentCategoryAvgUnits = totalDays > 0 ? Math.round((currentCategoryUnits / totalDays) * 10) / 10 : 0;
  const currentCategoryAvgPesos = totalDays > 0 ? Math.round(currentCategoryPesos / totalDays) : 0;

  if (loading) {
    return <LoadingIndicator message="Cargando dashboard de analítica..." />;
  }

  return (
    <ScreenContainer>
      {/* Header Controls */}
      <View style={styles.header}>
        <StoreSelector />
      </View>

      {/* Date Filter Preset Controls */}
      <Card style={styles.filterCard} mode="outlined">
        <Card.Content style={{ paddingVertical: 8 }}>
          <View style={styles.presetContainer}>
            <Chip
              selected={filterPreset === 'launch'}
              onPress={() => applyPreset('launch')}
              mode="flat"
              compact
              style={[styles.filterChip, filterPreset === 'launch' && styles.activeFilterChip]}
              textStyle={{ fontSize: 11, color: filterPreset === 'launch' ? '#FFF' : '#F5F0EB' }}
            >
              🚀 Inicio Op. ({LAUNCH_DATE})
            </Chip>
            <Chip
              selected={filterPreset === 'month'}
              onPress={() => applyPreset('month')}
              mode="flat"
              compact
              style={[styles.filterChip, filterPreset === 'month' && styles.activeFilterChip]}
              textStyle={{ fontSize: 11, color: filterPreset === 'month' ? '#FFF' : '#F5F0EB' }}
            >
              📅 Mes Actual
            </Chip>
            <Chip
              selected={filterPreset === 'year'}
              onPress={() => applyPreset('year')}
              mode="flat"
              compact
              style={[styles.filterChip, filterPreset === 'year' && styles.activeFilterChip]}
              textStyle={{ fontSize: 11, color: filterPreset === 'year' ? '#FFF' : '#F5F0EB' }}
            >
              📆 Año Completo
            </Chip>
            <Chip
              selected={filterPreset === 'custom'}
              onPress={() => setFilterPreset('custom')}
              mode="flat"
              compact
              style={[styles.filterChip, filterPreset === 'custom' && styles.activeFilterChip]}
              textStyle={{ fontSize: 11, color: filterPreset === 'custom' ? '#FFF' : '#F5F0EB' }}
            >
              ✏️ Rango Personalizado
            </Chip>
          </View>

          {/* Custom Date Inputs if custom is selected */}
          {filterPreset === 'custom' && (
            <View style={styles.customDateRow}>
              <TextInput
                label="Desde (AAAA-MM-DD)"
                value={startDateStr}
                onChangeText={setStartDateStr}
                mode="outlined"
                dense
                style={styles.dateInput}
              />
              <TextInput
                label="Hasta (AAAA-MM-DD)"
                value={endDateStr}
                onChangeText={setEndDateStr}
                mode="outlined"
                dense
                style={styles.dateInput}
              />
            </View>
          )}
        </Card.Content>
      </Card>

      {/* STORE MODE (Local 1, Local 2, etc.) */}
      {!isProductionCenter ? (
        <ScrollView style={{ flex: 1 }}>
          {/* 1. Summary KPI Cards Bar */}
          <View style={styles.kpiRow}>
            <KpiCard icon="calendar-range" label="Días Operados" value={`${totalDays} días`} color="#2196F3" />
            <KpiCard icon="pizza" label="Ventas Totales" value={`${grandTotalUnits.toLocaleString()} uds`} color="#FF9800" />
            <KpiCard icon="speedometer" label="Promedio Diario" value={`${grandDailyAvgUnits} / día`} color="#4CAF50" />
          </View>

          <View style={styles.kpiRow}>
            <KpiCard icon="cash-multiple" label="Venta Total COP" value={formatCOP(grandTotalPesos)} color="#9C27B0" />
            <KpiCard icon="chart-line" label="Promedio COP / Día" value={`${formatCOP(grandDailyAvgPesos)} / día`} color="#00BCD4" />
          </View>

          {/* 2. Selector de Categoría (Pizzas vs Bebidas vs Adiciones y Empaques) */}
          <Card style={styles.sectionCard} mode="elevated">
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>
                PROMEDIO Y DISTRIBUCIÓN POR CATEGORÍA DESDE {formatDate(startDateStr)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Filtra el análisis entre Pizzas, Bebidas, Adiciones/Empaques o la vista general acumulada
              </Text>

              {/* Category Selector Chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <Chip
                  selected={categoryTab === 'PIZZAS'}
                  onPress={() => setCategoryTab('PIZZAS')}
                  mode="flat"
                  style={[styles.filterChip, categoryTab === 'PIZZAS' && styles.activeFilterChip]}
                  textStyle={{ color: categoryTab === 'PIZZAS' ? '#FFF' : '#F5F0EB', fontWeight: 'bold' }}
                >
                  🍕 Pizzas ({catTotals.pizzaUnits.toLocaleString()} uds)
                </Chip>
                <Chip
                  selected={categoryTab === 'BEBIDAS'}
                  onPress={() => setCategoryTab('BEBIDAS')}
                  mode="flat"
                  style={[styles.filterChip, categoryTab === 'BEBIDAS' && styles.activeFilterChip]}
                  textStyle={{ color: categoryTab === 'BEBIDAS' ? '#FFF' : '#F5F0EB', fontWeight: 'bold' }}
                >
                  🥤 Bebidas ({catTotals.beverageUnits.toLocaleString()} uds)
                </Chip>
                <Chip
                  selected={categoryTab === 'ADICIONES_EMPAQUES'}
                  onPress={() => setCategoryTab('ADICIONES_EMPAQUES')}
                  mode="flat"
                  style={[styles.filterChip, categoryTab === 'ADICIONES_EMPAQUES' && styles.activeFilterChip]}
                  textStyle={{ color: categoryTab === 'ADICIONES_EMPAQUES' ? '#FFF' : '#F5F0EB', fontWeight: 'bold' }}
                >
                  ➕/📦 Adiciones y Empaques ({catTotals.addPkgUnits.toLocaleString()} uds)
                </Chip>
                <Chip
                  selected={categoryTab === 'TODOS'}
                  onPress={() => setCategoryTab('TODOS')}
                  mode="flat"
                  style={[styles.filterChip, categoryTab === 'TODOS' && styles.activeFilterChip]}
                  textStyle={{ color: categoryTab === 'TODOS' ? '#FFF' : '#F5F0EB', fontWeight: 'bold' }}
                >
                  🌐 Vista General ({grandTotalUnits.toLocaleString()} uds)
                </Chip>
              </View>

              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.colHeader, { flex: 2.2 }]}>PRODUCTO / SABOR</Text>
                <Text style={[styles.colHeader, { flex: 1.5, textAlign: 'right' }]}>UNIDADES</Text>
                <Text style={[styles.colHeader, { flex: 1.5, textAlign: 'right' }]}>PROM. DÍA</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>% CAT.</Text>
              </View>

              {/* Flavor / Product Rows */}
              {currentCategoryRows.length === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center', marginVertical: 12 }}>
                  No se registran ventas para esta categoría en el periodo seleccionado.
                </Text>
              ) : (
                currentCategoryRows.map((row) => (
                  <View key={row.flavorName} style={styles.tableRow}>
                    <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                      <Text style={styles.flavorText}>{row.flavorName}</Text>
                    </View>
                    <Text style={[styles.cellText, { flex: 1.5, textAlign: 'right' }]}>{row.totalUnits.toLocaleString()}</Text>
                    <Text style={[styles.cellText, { flex: 1.5, textAlign: 'right', fontWeight: 'bold', color: '#4CAF50' }]}>
                      {row.dailyAvgUnits.toFixed(1)}
                    </Text>
                    <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', fontWeight: '600' }]}>{row.percentage}%</Text>
                  </View>
                ))
              )}

              {/* Subtotal Row */}
              <Divider style={styles.divider} />
              <View style={styles.subtotalRow}>
                <Text style={[styles.subtotalLabel, { flex: 2.2 }]}>SUBTOTAL UNIDADES</Text>
                <Text style={[styles.subtotalValue, { flex: 1.5, textAlign: 'right' }]}>{currentCategoryUnits.toLocaleString()}</Text>
                <Text style={[styles.subtotalHighlight, { flex: 1.5, textAlign: 'right' }]}>{currentCategoryAvgUnits.toFixed(1)}</Text>
                <Text style={[styles.subtotalMeta, { flex: 1.2, textAlign: 'right' }]}>uds/día</Text>
              </View>

              <View style={styles.subtotalRow}>
                <Text style={[styles.subtotalLabel, { flex: 2.2 }]}>SUBTOTAL PESOS</Text>
                <Text style={[styles.subtotalValue, { flex: 2.2, textAlign: 'right' }]}>{formatCOP(currentCategoryPesos)}</Text>
                <Text style={[styles.subtotalHighlight, { flex: 2.0, textAlign: 'right' }]}>{formatCOP(currentCategoryAvgPesos)}/día</Text>
              </View>
            </Card.Content>
          </Card>

          {/* 3. Gráfico de Distribución Porcentual (%) */}
          <Card style={styles.sectionCard} mode="elevated">
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>
                GRÁFICO DE DISTRIBUCIÓN (
                {categoryTab === 'PIZZAS'
                  ? '🍕 PIZZAS Y SABORES'
                  : categoryTab === 'BEBIDAS'
                    ? '🥤 BEBIDAS'
                    : categoryTab === 'ADICIONES_EMPAQUES'
                      ? '➕/📦 ADICIONES Y EMPAQUES'
                      : '🌐 VISTA GENERAL'}
                )
              </Text>
              <Text variant="bodySmall" style={styles.cardSubtitle}>
                Participación porcentual sobre el volumen de ventas de la categoría
              </Text>

              <FlavorDistributionChart segments={currentCategoryRows} />
            </Card.Content>
          </Card>

          {/* 4. Tabla de Comportamiento Mensual */}
          <Card style={styles.sectionCard} mode="elevated">
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>
                HISTÓRICO Y COMPORTAMIENTO MENSUAL
              </Text>
              <Text variant="bodySmall" style={styles.cardSubtitle}>
                Ventas totales y promedio diario mes a mes
              </Text>

              <View style={styles.tableHeader}>
                <Text style={[styles.colHeader, { flex: 2 }]}>MES / PERIODO</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>DÍAS</Text>
                <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'right' }]}>VENTAS UDS</Text>
                <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'right' }]}>PROMEDIO DÍA</Text>
                <Text style={[styles.colHeader, { flex: 2.2, textAlign: 'right' }]}>VENTAS COP</Text>
              </View>

              {/* General Row (YTD Totals) */}
              <View style={[styles.tableRow, styles.generalRow]}>
                <Text style={[styles.generalText, { flex: 2 }]}>General (Acumulado)</Text>
                <Text style={[styles.generalText, { flex: 1.2, textAlign: 'right' }]}>{totalDays}</Text>
                <Text style={[styles.generalText, { flex: 1.8, textAlign: 'right' }]}>{grandTotalUnits.toLocaleString()}</Text>
                <Text style={[styles.generalHighlight, { flex: 1.8, textAlign: 'right' }]}>{grandDailyAvgUnits.toFixed(1)}</Text>
                <Text style={[styles.generalText, { flex: 2.2, textAlign: 'right' }]}>{formatCOP(grandTotalPesos)}</Text>
              </View>

              {/* Month Rows */}
              {monthRows.map((m) => (
                <View key={m.monthName} style={[styles.tableRow, m.daysOperated === 0 && { opacity: 0.35 }]}>
                  <Text style={[styles.cellText, { flex: 2, fontWeight: '500' }]}>{m.monthName}</Text>
                  <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right' }]}>{m.daysOperated || '-'}</Text>
                  <Text style={[styles.cellText, { flex: 1.8, textAlign: 'right' }]}>
                    {m.daysOperated > 0 ? m.totalUnits.toLocaleString() : '-'}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.8, textAlign: 'right', fontWeight: 'bold', color: '#4CAF50' }]}>
                    {m.daysOperated > 0 ? m.dailyAvgUnits.toFixed(1) : '-'}
                  </Text>
                  <Text style={[styles.cellText, { flex: 2.2, textAlign: 'right' }]}>
                    {m.daysOperated > 0 ? formatCOP(m.totalPesos) : '-'}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>

          <View style={{ height: 80 }} />
        </ScrollView>
      ) : (
        /* PRODUCTION CENTER MODE */
        <ScrollView style={{ flex: 1 }}>
          <ProductionCenterDashboard
            storeId={selectedStoreId}
            startDate={startDateStr}
            endDate={endDateStr}
            totalDays={totalDays}
          />
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterCard: {
    backgroundColor: '#1E1E1E',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 10,
  },
  presetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    backgroundColor: '#2A2A2A',
  },
  activeFilterChip: {
    backgroundColor: '#E63946',
  },
  customDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  dateInput: {
    flex: 1,
    height: 40,
    fontSize: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontWeight: 'bold',
    color: '#F5F0EB',
    marginBottom: 2,
  },
  cardSubtitle: {
    color: 'rgba(245, 240, 235, 0.6)',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  colHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(245, 240, 235, 0.7)',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  generalRow: {
    backgroundColor: 'rgba(230, 57, 70, 0.12)',
    paddingHorizontal: 6,
    borderRadius: 6,
    marginVertical: 4,
  },
  generalText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F5F0EB',
  },
  generalHighlight: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E63946',
  },
  flavorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F5F0EB',
  },
  cellText: {
    fontSize: 12,
    color: '#F5F0EB',
  },
  divider: {
    marginVertical: 8,
    backgroundColor: '#E63946',
    height: 2,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  subtotalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F5F0EB',
  },
  subtotalValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F5F0EB',
  },
  subtotalHighlight: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E63946',
  },
  subtotalMeta: {
    fontSize: 11,
    color: 'rgba(245, 240, 235, 0.6)',
  },
});
