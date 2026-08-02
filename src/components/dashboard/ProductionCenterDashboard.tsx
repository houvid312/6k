import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Divider, useTheme } from 'react-native-paper';
import { KpiCard } from '../common/KpiCard';
import { LoadingIndicator } from '../common/LoadingIndicator';
import { EmptyState } from '../common/EmptyState';
import { useDI } from '../../di/providers';
import { Store, Supply, Product } from '../../domain/entities';
import { formatCOP } from '../../utils/currency';
import { formatDate } from '../../utils/dates';
import { useMasterDataStore } from '../../stores/useMasterDataStore';

interface Props {
  storeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
}

interface ShipmentSummary {
  storeName: string;
  transferCount: number;
  totalQuantityKg: number;
  totalValueCop: number;
  percentage: number;
}

interface GlobalFlavorSummary {
  flavorName: string;
  totalUnits: number;
  dailyAvgUnits: number;
  totalPesos: number;
  percentage: number;
}

interface ProductionSummary {
  supplyName: string;
  totalGrams: number;
  dailyAvgKg: number;
  totalKg: number;
}

interface WriteoffSummary {
  date: string;
  supplyName: string;
  quantityGrams: number;
  reason: string;
  notes: string;
  valueCop: number;
}

export function ProductionCenterDashboard({ storeId, startDate, endDate, totalDays }: Props) {
  const theme = useTheme();
  const { transferRepo, storeRepo, writeoffRepo, productionRecordRepo, supplyRepo, saleRepo, productRepo } = useDI();
  const { products: cachedProducts } = useMasterDataStore();

  const [loading, setLoading] = useState(true);

  // Global 6K Sales Metrics
  const [globalSalesUnits, setGlobalSalesUnits] = useState(0);
  const [globalDailyAvgUnits, setGlobalDailyAvgUnits] = useState(0);
  const [globalSalesPesos, setGlobalSalesPesos] = useState(0);
  const [globalFlavors, setGlobalFlavors] = useState<GlobalFlavorSummary[]>([]);

  // Shipments (Despachos)
  const [totalProducedKg, setTotalProducedKg] = useState(0);
  const [dailyAvgProducedKg, setDailyAvgProducedKg] = useState(0);
  const [totalShipmentsCount, setTotalShipmentsCount] = useState(0);
  const [totalShipmentKg, setTotalShipmentKg] = useState(0);
  const [totalShipmentValue, setTotalShipmentValue] = useState(0);

  // Writeoffs
  const [totalWriteoffKg, setTotalWriteoffKg] = useState(0);
  const [totalWriteoffValue, setTotalWriteoffValue] = useState(0);

  const [shipmentsByStore, setShipmentsByStore] = useState<ShipmentSummary[]>([]);
  const [productionList, setProductionList] = useState<ProductionSummary[]>([]);
  const [recentWriteoffs, setRecentWriteoffs] = useState<WriteoffSummary[]>([]);

  const loadProductionData = useCallback(async () => {
    if (!storeId) return;
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch Global 6K Sales (Consolidado de todas las sedes)
      const [globalSales, dbProducts, allStores, outgoingTransfers, prodRecords, writeoffs, supplies] = await Promise.all([
        saleRepo.getByDateRange('consolidado', startDate, endDate),
        cachedProducts.length > 0 ? cachedProducts : productRepo.getAll(),
        storeRepo.getAll(),
        transferRepo.getReceivedByOrigin(storeId, startDate, endDate),
        productionRecordRepo.getByDateRange(storeId, startDate, endDate),
        writeoffRepo.getByStore(storeId),
        supplyRepo.getAll(),
      ]);

      const productMap = new Map<string, string>(dbProducts.map((p: Product) => [p.id, p.name]));
      const storeMap = new Map<string, string>(allStores.map((s: Store) => [s.id, s.name]));
      const supplyMap = new Map<string, string>(supplies.map((s: Supply) => [s.id, s.name]));
      const supplyCostMap = new Map<string, number>(supplies.map((s: Supply) => [
        s.id,
        s.gramsPerBag > 0 ? (s.productionCostCop ?? 0) / s.gramsPerBag : 5
      ]));

      // Aggregate Global 6K Sales by Flavor
      let globalUnitsSum = 0;
      let globalPesosSum = 0;
      const flavorMap = new Map<string, { units: number; pesos: number }>();

      for (const sale of globalSales) {
        globalUnitsSum += sale.totalPortions;
        globalPesosSum += sale.totalAmount;

        for (const item of sale.items) {
          const name = (productMap.get(item.productId) ?? item.productId).toUpperCase();
          const existing = flavorMap.get(name) ?? { units: 0, pesos: 0 };
          existing.units += item.quantity || item.portions || 1;
          existing.pesos += item.subtotal;
          flavorMap.set(name, existing);
        }
      }

      setGlobalSalesUnits(globalUnitsSum);
      setGlobalSalesPesos(globalPesosSum);
      setGlobalDailyAvgUnits(totalDays > 0 ? Math.round((globalUnitsSum / totalDays) * 10) / 10 : 0);

      const globalFlavorList: GlobalFlavorSummary[] = Array.from(flavorMap.entries()).map(([flavorName, data]) => ({
        flavorName,
        totalUnits: data.units,
        dailyAvgUnits: totalDays > 0 ? Math.round((data.units / totalDays) * 10) / 10 : 0,
        totalPesos: data.pesos,
        percentage: globalUnitsSum > 0 ? Math.round((data.units / globalUnitsSum) * 1000) / 10 : 0,
      })).sort((a, b) => b.totalUnits - a.totalUnits);

      setGlobalFlavors(globalFlavorList);

      // 2. Calculate Outgoing Shipments by Target Store
      const storeShipmentMap = new Map<string, { count: number; quantityGrams: number; value: number }>();
      let totalShipVal = 0;
      let totalShipCnt = 0;
      let totalShipGramsSum = 0;

      for (const transfer of outgoingTransfers) {
        totalShipCnt += 1;
        const targetId = transfer.toStoreId;
        const existing = storeShipmentMap.get(targetId) ?? { count: 0, quantityGrams: 0, value: 0 };
        existing.count += 1;

        let transferVal = transfer.totalPriceCop ?? transfer.totalCostCop ?? 0;
        let transferGrams = 0;

        for (const item of transfer.items) {
          const itemGrams = item.bagsToSend * (item.gramsPerBagSnapshot ?? 1000);
          transferGrams += itemGrams;
          if (transferVal === 0) {
            const unitCost = supplyCostMap.get(item.supplyId) ?? 5;
            transferVal += itemGrams * unitCost;
          }
        }

        existing.quantityGrams += transferGrams;
        existing.value += transferVal;
        totalShipVal += transferVal;
        totalShipGramsSum += transferGrams;
        storeShipmentMap.set(targetId, existing);
      }

      setTotalShipmentsCount(totalShipCnt);
      setTotalShipmentValue(totalShipVal);
      setTotalShipmentKg(Math.round((totalShipGramsSum / 1000) * 10) / 10);

      const shipmentList: ShipmentSummary[] = Array.from(storeShipmentMap.entries()).map(([targetId, data]) => ({
        storeName: storeMap.get(targetId) ?? 'Sede Desconocida',
        transferCount: data.count,
        totalQuantityKg: Math.round((data.quantityGrams / 1000) * 10) / 10,
        totalValueCop: Math.round(data.value),
        percentage: totalShipVal > 0 ? Math.round((data.value / totalShipVal) * 1000) / 10 : 0,
      })).sort((a, b) => b.totalValueCop - a.totalValueCop);

      setShipmentsByStore(shipmentList);

      // 3. Production Records
      const prodMap = new Map<string, number>();
      let totalProdGrams = 0;

      for (const rec of prodRecords) {
        const recipeId = rec.productionRecipeId;
        const currentGrams = prodMap.get(recipeId) ?? 0;
        prodMap.set(recipeId, currentGrams + rec.totalGramsProduced);
        totalProdGrams += rec.totalGramsProduced;
      }

      const totalProdKgVal = Math.round((totalProdGrams / 1000) * 10) / 10;
      setTotalProducedKg(totalProdKgVal);
      setDailyAvgProducedKg(Math.round((totalProdKgVal / totalDays) * 10) / 10);

      const prodList: ProductionSummary[] = Array.from(prodMap.entries()).map(([recipeId, grams]) => {
        const totalKg = Math.round((grams / 1000) * 10) / 10;
        return {
          supplyName: supplyMap.get(recipeId) ?? 'Masa Producida',
          totalGrams: grams,
          totalKg,
          dailyAvgKg: Math.round((totalKg / totalDays) * 10) / 10,
        };
      }).sort((a, b) => b.totalKg - a.totalKg);

      setProductionList(prodList);

      // 4. Writeoffs in Production Center
      let writeoffGramsSum = 0;
      let writeoffValueSum = 0;
      const writeoffList: WriteoffSummary[] = [];

      for (const w of writeoffs) {
        const wCreated = w.createdAt ?? '';
        const wDate = wCreated.substring(0, 10);
        if (wDate < startDate || wDate > endDate) continue;

        writeoffGramsSum += w.quantityGrams;
        const supId = w.supplyId ?? '';
        const unitCost = supplyCostMap.get(supId) ?? 5;
        const val = w.quantityGrams * unitCost;
        writeoffValueSum += val;

        writeoffList.push({
          date: wCreated,
          supplyName: supplyMap.get(supId) ?? 'Insumo',
          quantityGrams: w.quantityGrams,
          reason: w.reason,
          notes: w.notes ?? '',
          valueCop: Math.round(val),
        });
      }

      setTotalWriteoffKg(Math.round((writeoffGramsSum / 1000) * 10) / 10);
      setTotalWriteoffValue(Math.round(writeoffValueSum));
      setRecentWriteoffs(writeoffList.slice(0, 10));
    } catch (error) {
      console.error('Error loading production dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [cachedProducts, endDate, productRepo, productionRecordRepo, saleRepo, startDate, storeId, storeRepo, supplyRepo, totalDays, transferRepo, writeoffRepo]);

  useEffect(() => {
    loadProductionData();
  }, [loadProductionData]);

  if (loading) {
    return <LoadingIndicator message="Cargando consolidado 6K y despachos de planta..." />;
  }

  return (
    <View style={styles.container}>
      {/* SECTION 1: GLOBAL 6K SALES CONSOLIDATED (Prioridad 1) */}
      <Card style={[styles.sectionCard, styles.priorityCard]} mode="elevated">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={[styles.cardTitle, { color: '#E63946' }]}>
                🌟 CONSOLIDADO DE VENTAS 6K (TODAS LAS SEDES)
              </Text>
              <Text variant="bodySmall" style={styles.cardSubtitle}>
                Consumo global de pizzas en la red 6K para planeación de producción
              </Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <KpiCard icon="pizza" label="Ventas Totales 6K" value={`${globalSalesUnits.toLocaleString()} uds`} color="#FF9800" />
            <KpiCard icon="speedometer" label="Promedio Diario 6K" value={`${globalDailyAvgUnits} uds/día`} color="#4CAF50" />
            <KpiCard icon="cash-multiple" label="Facturación 6K" value={formatCOP(globalSalesPesos)} color="#9C27B0" />
          </View>

          <Divider style={{ marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />

          <Text variant="labelMedium" style={{ fontWeight: 'bold', color: '#F5F0EB', marginBottom: 8 }}>
            DEMANDA GLOBAL POR SABOR EN TODO 6K:
          </Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.colHeader, { flex: 2.5 }]}>SABOR / PRODUCTO</Text>
            <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'right' }]}>UNIDADES 6K</Text>
            <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'right' }]}>PROM. DÍA</Text>
            <Text style={[styles.colHeader, { flex: 2.2, textAlign: 'right' }]}>VENTA COP</Text>
            <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>% RED</Text>
          </View>

          {globalFlavors.length === 0 ? (
            <EmptyState icon="pizza-off" title="Sin ventas consolidadas" subtitle="No hay ventas registradas en la red 6K en el período" />
          ) : (
            globalFlavors.map((row) => (
              <View key={row.flavorName} style={styles.tableRow}>
                <Text style={[styles.cellText, { flex: 2.5, fontWeight: '600' }]}>{row.flavorName}</Text>
                <Text style={[styles.cellText, { flex: 1.8, textAlign: 'right' }]}>{row.totalUnits.toLocaleString()}</Text>
                <Text style={[styles.cellText, { flex: 1.8, textAlign: 'right', fontWeight: 'bold', color: '#4CAF50' }]}>
                  {row.dailyAvgUnits.toFixed(1)}
                </Text>
                <Text style={[styles.cellText, { flex: 2.2, textAlign: 'right' }]}>{formatCOP(row.totalPesos)}</Text>
                <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', fontWeight: 'bold', color: '#E63946' }]}>
                  {row.percentage}%
                </Text>
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      {/* SECTION 2: SHIPMENTS & DISPATCHES FROM PLANT (Prioridad 2 - Alta Relevancia) */}
      <Card style={[styles.sectionCard, styles.shipmentsCard]} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={[styles.cardTitle, { color: '#2196F3' }]}>
            🚚 ENVÍOS Y DESPACHOS DE PLANTA A TIENDAS
          </Text>
          <Text variant="bodySmall" style={styles.cardSubtitle}>
            Consolidado de traslados y abastecimiento despachado hacia los locales
          </Text>

          <View style={styles.kpiRow}>
            <KpiCard icon="truck-delivery" label="Despachos Realizados" value={`${totalShipmentsCount} envíos`} color="#2196F3" />
            <KpiCard icon="weight-kilogram" label="Volumen Enviado" value={`${totalShipmentKg} Kg`} color="#FF9800" />
            <KpiCard icon="cash-check" label="Valor Despachado" value={formatCOP(totalShipmentValue)} color="#4CAF50" />
          </View>

          <Divider style={{ marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />

          <View style={styles.tableHeader}>
            <Text style={[styles.colHeader, { flex: 2.5 }]}>SEDE DESTINO</Text>
            <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>ENVÍOS</Text>
            <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'right' }]}>VOLUMEN (KG)</Text>
            <Text style={[styles.colHeader, { flex: 2.2, textAlign: 'right' }]}>VALOR COP</Text>
            <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>% TOTAL</Text>
          </View>

          {shipmentsByStore.length === 0 ? (
            <EmptyState icon="truck-outline" title="Sin despachos" subtitle="No se registraron envíos en este período" />
          ) : (
            shipmentsByStore.map((s) => (
              <View key={s.storeName} style={styles.tableRow}>
                <Text style={[styles.cellText, { flex: 2.5, fontWeight: '600', color: '#F5F0EB' }]}>{s.storeName}</Text>
                <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right' }]}>{s.transferCount}</Text>
                <Text style={[styles.cellText, { flex: 1.8, textAlign: 'right', fontWeight: 'bold', color: '#2196F3' }]}>
                  {s.totalQuantityKg} Kg
                </Text>
                <Text style={[styles.cellText, { flex: 2.2, textAlign: 'right' }]}>{formatCOP(s.totalValueCop)}</Text>
                <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', fontWeight: 'bold', color: '#4CAF50' }]}>
                  {s.percentage}%
                </Text>
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      {/* SECTION 3: PLANT PRODUCTION & WRITEOFFS */}
      <Card style={styles.sectionCard} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            🏭 PRODUCCIÓN Y RENDIMIENTO EN PLANTA ({totalDays} DÍAS)
          </Text>
          <Text variant="bodySmall" style={styles.cardSubtitle}>
            Masa e insumos preparados en el centro de producción
          </Text>

          <View style={styles.kpiRow}>
            <KpiCard icon="factory" label="Masa Producida" value={`${totalProducedKg} Kg`} color="#2196F3" />
            <KpiCard icon="speedometer" label="Promedio Diario" value={`${dailyAvgProducedKg} Kg/día`} color="#4CAF50" />
            <KpiCard icon="alert-circle-outline" label="Mermas en Planta" value={`${totalWriteoffKg} Kg (${formatCOP(totalWriteoffValue)})`} color="#E63946" />
          </View>

          <Divider style={{ marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.1)' }} />

          <View style={styles.tableHeader}>
            <Text style={[styles.colHeader, { flex: 3 }]}>INSUMO PROCESADO</Text>
            <Text style={[styles.colHeader, { flex: 2, textAlign: 'right' }]}>TOTAL KG</Text>
            <Text style={[styles.colHeader, { flex: 2, textAlign: 'right' }]}>PROM. DIARIO</Text>
          </View>

          {productionList.length === 0 ? (
            <EmptyState icon="factory" title="Sin producciones" subtitle="No se registran órdenes de producción en el período" />
          ) : (
            productionList.map((p) => (
              <View key={p.supplyName} style={styles.tableRow}>
                <Text style={[styles.cellText, { flex: 3, fontWeight: '600' }]}>{p.supplyName}</Text>
                <Text style={[styles.cellText, { flex: 2, textAlign: 'right', fontWeight: 'bold' }]}>{p.totalKg} Kg</Text>
                <Text style={[styles.cellText, { flex: 2, textAlign: 'right', color: '#4CAF50', fontWeight: 'bold' }]}>
                  {p.dailyAvgKg} Kg/día
                </Text>
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      {/* Tabla Mermas */}
      {recentWriteoffs.length > 0 && (
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              CONTROL DE MERMAS Y BAJAS EN PLANTA
            </Text>
            <Text variant="bodySmall" style={styles.cardSubtitle}>
              Pérdidas registradas en el proceso productivo
            </Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.colHeader, { flex: 1.5 }]}>FECHA</Text>
              <Text style={[styles.colHeader, { flex: 2 }]}>INSUMO</Text>
              <Text style={[styles.colHeader, { flex: 1.8 }]}>MOTIVO</Text>
              <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'right' }]}>CANTIDAD</Text>
              <Text style={[styles.colHeader, { flex: 2, textAlign: 'right' }]}>VALOR COP</Text>
            </View>

            {recentWriteoffs.map((w, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.cellText, { flex: 1.5 }]}>{formatDate(w.date.substring(0, 10))}</Text>
                <Text style={[styles.cellText, { flex: 2, fontWeight: '600' }]}>{w.supplyName}</Text>
                <Text style={[styles.cellText, { flex: 1.8 }]}>{w.reason}</Text>
                <Text style={[styles.cellText, { flex: 1.8, textAlign: 'right', color: '#E63946', fontWeight: 'bold' }]}>
                  {(w.quantityGrams / 1000).toFixed(1)} Kg
                </Text>
                <Text style={[styles.cellText, { flex: 2, textAlign: 'right' }]}>{formatCOP(w.valueCop)}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  priorityCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#E63946',
  },
  shipmentsCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
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
    marginBottom: 10,
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
  cellText: {
    fontSize: 12,
    color: '#F5F0EB',
  },
});
