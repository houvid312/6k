import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Divider, Text, TextInput, useTheme } from 'react-native-paper';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { useDI } from '../../../src/di/providers';
import { Purchase, Supply } from '../../../src/domain/entities';
import { PaymentMethod, UserRole } from '../../../src/domain/enums';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { formatCOP } from '../../../src/utils/currency';
import { formatDateTime } from '../../../src/utils/dates';

type PaymentFilter = 'TODOS' | PaymentMethod;

const PAYMENT_FILTERS: Array<{ value: PaymentFilter; label: string; icon: string }> = [
  { value: 'TODOS', label: 'Todos', icon: 'check' },
  { value: PaymentMethod.EFECTIVO, label: 'Efectivo', icon: 'cash' },
  { value: PaymentMethod.TRANSFERENCIA, label: 'Transfer.', icon: 'bank-transfer' },
  { value: PaymentMethod.MIXTO, label: 'Mixto', icon: 'swap-horizontal' },
];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.EFECTIVO]: 'Efectivo',
  [PaymentMethod.TRANSFERENCIA]: 'Transferencia',
  [PaymentMethod.MIXTO]: 'Mixto',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatQuantity(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg`;
  }
  return `${Math.round(grams).toLocaleString('es-CO')} g`;
}

function calculateCostPerGram(purchase: Purchase): number {
  return purchase.quantityGrams > 0 ? purchase.priceCOP / purchase.quantityGrams : 0;
}

function getCostPerBag(purchase: Purchase, supply?: Supply): number {
  const gramsPerBag = supply?.gramsPerBag ?? 0;
  if (gramsPerBag <= 0) return 0;
  return calculateCostPerGram(purchase) * gramsPerBag;
}

export default function HistorialComprasScreen() {
  const theme = useTheme();
  const { purchaseRepo } = useDI();
  const { selectedStoreId, stores, storesLoaded, userRole, loadStores } = useAppStore();
  const { supplies, loadMasterData } = useMasterDataStore();

  const productionCenter = stores.find((s) => s.isProductionCenter);
  const productionCenterId = productionCenter?.id ?? '';
  const canViewHistory = userRole === UserRole.ADMIN && selectedStoreId === productionCenterId;

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('TODOS');

  const loadPurchases = useCallback(async () => {
    if (!productionCenterId || !canViewHistory) {
      setPurchases([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await purchaseRepo.getAll(productionCenterId);
      setPurchases(data);
    } catch {
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [canViewHistory, productionCenterId, purchaseRepo]);

  useEffect(() => {
    loadStores();
    loadMasterData();
  }, [loadMasterData, loadStores]);

  useEffect(() => {
    if (!storesLoaded) return;
    loadPurchases();
  }, [loadPurchases, storesLoaded]);

  const supplyById = useMemo(() => {
    const map = new Map<string, Supply>();
    supplies.forEach((supply) => map.set(supply.id, supply));
    return map;
  }, [supplies]);

  const filteredPurchases = useMemo(() => {
    const query = normalizeText(searchQuery);

    return purchases.filter((purchase) => {
      if (paymentFilter !== 'TODOS' && purchase.paymentMethod !== paymentFilter) {
        return false;
      }

      if (!query) return true;

      const supply = supplyById.get(purchase.supplyId);
      const searchable = [
        supply?.name ?? '',
        purchase.supplier,
        PAYMENT_LABELS[purchase.paymentMethod],
        formatDateTime(purchase.timestamp),
      ].map(normalizeText);

      return searchable.some((value) => value.includes(query));
    });
  }, [paymentFilter, purchases, searchQuery, supplyById]);

  const summary = useMemo(() => {
    const totalCost = filteredPurchases.reduce((sum, purchase) => sum + purchase.priceCOP, 0);
    const totalGrams = filteredPurchases.reduce((sum, purchase) => sum + purchase.quantityGrams, 0);
    return {
      totalCost,
      totalGrams,
      count: filteredPurchases.length,
    };
  }, [filteredPurchases]);

  if (!storesLoaded || loading) {
    return <LoadingIndicator message="Cargando historial de compras..." />;
  }

  if (!canViewHistory) {
    return (
      <ScreenContainer>
        <View style={styles.blockedContainer}>
          <Text variant="headlineMedium" style={styles.centerText}>
            Historial no disponible
          </Text>
          <Text variant="bodyLarge" style={[styles.centerText, { color: theme.colors.onSurfaceVariant }]}>
            Los valores de costo de compras solo se consultan desde el Centro de Produccion.
          </Text>
          <Text variant="bodyMedium" style={[styles.centerText, { color: theme.colors.outline }]}>
            Cambia al Centro de Produccion en el selector de local para visualizar el historial.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text variant="titleMedium" style={styles.title}>
            Historial de Compras
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Detalle de costos pagados por insumo en materia prima.
          </Text>
        </View>
        <Button mode="outlined" icon="refresh" compact onPress={loadPurchases}>
          Actualizar
        </Button>
      </View>

      <View style={styles.summaryGrid}>
        <View style={[styles.summaryTile, { backgroundColor: '#1E1E1E' }]}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Total compras
          </Text>
          <Text variant="titleLarge" style={styles.summaryValue}>
            {formatCOP(summary.totalCost)}
          </Text>
        </View>
        <View style={[styles.summaryTile, { backgroundColor: '#1E1E1E' }]}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Registros
          </Text>
          <Text variant="titleLarge" style={styles.summaryValue}>
            {summary.count}
          </Text>
        </View>
        <View style={[styles.summaryTile, { backgroundColor: '#1E1E1E' }]}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Cantidad
          </Text>
          <Text variant="titleLarge" style={styles.summaryValue}>
            {formatQuantity(summary.totalGrams)}
          </Text>
        </View>
      </View>

      <TextInput
        placeholder="Buscar por insumo, proveedor o metodo..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        mode="outlined"
        dense
        style={styles.searchInput}
        left={<TextInput.Icon icon="magnify" />}
        right={searchQuery ? <TextInput.Icon icon="close" onPress={() => setSearchQuery('')} /> : undefined}
      />

      <View style={styles.filterRow}>
        {PAYMENT_FILTERS.map((filter) => (
          <Chip
            key={filter.value}
            selected={paymentFilter === filter.value}
            onPress={() => setPaymentFilter(filter.value)}
            mode={paymentFilter === filter.value ? 'flat' : 'outlined'}
            compact
            icon={filter.icon}
            style={[
              styles.filterChip,
              paymentFilter === filter.value && { backgroundColor: theme.colors.primary },
            ]}
            textStyle={paymentFilter === filter.value ? styles.activeChipText : undefined}
            showSelectedOverlay={false}
          >
            {filter.label}
          </Chip>
        ))}
      </View>

      {filteredPurchases.length === 0 ? (
        <EmptyState
          icon={searchQuery ? 'magnify' : 'cart-off'}
          title={searchQuery ? 'Sin resultados' : 'Sin compras registradas'}
          subtitle={searchQuery ? `No hay compras para "${searchQuery}"` : 'Registra compras para empezar a ver costos historicos'}
        />
      ) : (
        <View style={styles.list}>
          {filteredPurchases.map((purchase) => {
            const supply = supplyById.get(purchase.supplyId);
            const costPerKg = calculateCostPerGram(purchase) * 1000;
            const costPerBag = getCostPerBag(purchase, supply);

            return (
              <Card key={purchase.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]} mode="elevated">
                <Card.Content>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleBlock}>
                      <Text variant="titleSmall" style={styles.cardTitle} numberOfLines={2}>
                        {supply?.name ?? 'Insumo desconocido'}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {formatDateTime(purchase.timestamp)}
                      </Text>
                    </View>
                    <View style={styles.amountBlock}>
                      <Text variant="titleMedium" style={styles.amount}>
                        {formatCOP(purchase.priceCOP)}
                      </Text>
                      <Chip compact mode="outlined" style={styles.paymentChip}>
                        {PAYMENT_LABELS[purchase.paymentMethod]}
                      </Chip>
                    </View>
                  </View>

                  <Divider style={styles.divider} />

                  <View style={styles.metricGrid}>
                    <View style={styles.metric}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Cantidad
                      </Text>
                      <Text variant="bodyMedium" style={styles.metricValue}>
                        {formatQuantity(purchase.quantityGrams)}
                      </Text>
                    </View>
                    <View style={styles.metric}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Costo/kg
                      </Text>
                      <Text variant="bodyMedium" style={styles.metricValue}>
                        {formatCOP(costPerKg)}
                      </Text>
                    </View>
                    <View style={styles.metric}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Costo/bolsa
                      </Text>
                      <Text variant="bodyMedium" style={styles.metricValue}>
                        {costPerBag > 0 ? formatCOP(costPerBag) : 'N/A'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.footerRow}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Proveedor
                    </Text>
                    <Text variant="bodyMedium" style={styles.supplierText} numberOfLines={1}>
                      {purchase.supplier || 'Proveedor'}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  centerText: {
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
    minWidth: 180,
  },
  title: {
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  summaryTile: {
    flex: 1,
    flexBasis: 150,
    minWidth: 150,
    borderRadius: 12,
    padding: 12,
    minHeight: 76,
    justifyContent: 'space-between',
  },
  summaryValue: {
    fontWeight: '800',
  },
  searchInput: {
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    borderRadius: 16,
  },
  activeChipText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  amountBlock: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amount: {
    color: '#E63946',
    fontWeight: '800',
  },
  paymentChip: {
    maxWidth: 136,
  },
  divider: {
    marginVertical: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metric: {
    flex: 1,
    flexBasis: 120,
    minWidth: 120,
    backgroundColor: '#161616',
    borderRadius: 10,
    padding: 10,
    minHeight: 62,
  },
  metricValue: {
    fontWeight: '700',
    marginTop: 3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  supplierText: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
  },
});
