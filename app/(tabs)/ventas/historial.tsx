import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Button, Card, Text, Chip, Divider, Snackbar, useTheme, Searchbar } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Sale, Product } from '../../../src/domain/entities';
import { PaymentMethod, PizzaSize } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { formatDateTime, toISODate } from '../../../src/utils/dates';

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  [PaymentMethod.EFECTIVO]: 'cash',
  [PaymentMethod.TRANSFERENCIA]: 'bank-transfer',
  [PaymentMethod.MIXTO]: 'swap-horizontal',
};

const SIZE_SHORT: Record<PizzaSize, string> = {
  [PizzaSize.INDIVIDUAL]: 'Ind.',
  [PizzaSize.DIAMANTE]: 'Diam.',
  [PizzaSize.MEDIANA]: 'Med.',
  [PizzaSize.FAMILIAR]: 'Fam.',
};

export default function HistorialScreen() {
  const theme = useTheme();
  const { saleService, productRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'hoy' | 'semana' | 'mes'>('hoy');

  useEffect(() => {
    productRepo.getAll().then(setProducts).catch(() => {});
  }, [productRepo]);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate: string;
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      if (filter === 'hoy') {
        startDate = toISODate(now);
      } else if (filter === 'semana') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = toISODate(weekAgo);
      } else {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = toISODate(monthAgo);
      }

      const data = await saleService.getSalesByDateRange(
        selectedStoreId,
        startDate,
        endDate.toISOString(),
      );
      setSales(data.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, filter, saleService]);

  const [snackbar, setSnackbar] = useState<{ visible: boolean; success: boolean; message: string }>({
    visible: false,
    success: true,
    message: '',
  });

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const handleMarkAsPaid = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsPaid(sale.id);
      setSales((prev) => prev.map((s) => s.id === sale.id ? { ...s, isPaid: true } : s));
      setSnackbar({ visible: true, success: true, message: `Venta de ${formatCOP(sale.totalAmount)} marcada como pagada` });
    } catch {
      setSnackbar({ visible: true, success: false, message: 'Error al marcar como pagada' });
    }
  }, [saleService]);

  const getProductName = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? productId;

  const renderSale = ({ item }: { item: Sale }) => (
    <Card style={styles.saleCard} mode="elevated">
      <Card.Content>
        {/* Header: fecha + chips */}
        <View style={styles.saleHeader}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {formatDateTime(item.timestamp)}
          </Text>
          <View style={styles.chipsRow}>
            <Chip
              compact
              textStyle={{ fontSize: 11 }}
              style={{
                backgroundColor: item.isPaid
                  ? '#1C3D2A'
                  : theme.colors.errorContainer,
              }}
            >
              {item.isPaid ? 'Pagado' : 'Pendiente'}
            </Chip>
            <Chip
              icon={PAYMENT_ICONS[item.paymentMethod]}
              compact
              textStyle={{ fontSize: 11 }}
            >
              {item.paymentMethod}
            </Chip>
          </View>
        </View>

        {/* Items detail */}
        <View style={styles.itemsList}>
          {item.items.map((si) => (
            <View key={si.id} style={styles.itemRow}>
              <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurface }}>
                {getProductName(si.productId)}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, minWidth: 40 }}>
                {SIZE_SHORT[si.size]}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, minWidth: 20, textAlign: 'center' }}>
                x{si.quantity}
              </Text>
              <Text variant="bodySmall" style={{ fontWeight: '600', minWidth: 65, textAlign: 'right' }}>
                {formatCOP(si.subtotal)}
              </Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        {(item.customerNote || item.observations) ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', marginTop: 4 }} numberOfLines={2}>
            {[item.customerNote, item.observations].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        {/* Worker */}
        {item.workerName ? (
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.6, fontSize: 10, marginTop: 2 }}>
            {item.workerName}
          </Text>
        ) : null}

        <Divider style={{ marginVertical: 8 }} />

        {/* Footer: total + action */}
        <View style={styles.saleFooter}>
          <View>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {formatCOP(item.totalAmount)}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.totalPortions} porciones
            </Text>
          </View>
          {!item.isPaid && (
            <Button
              mode="contained"
              compact
              onPress={() => handleMarkAsPaid(item)}
              buttonColor="#388E3C"
              textColor="#FFFFFF"
              icon="check"
              labelStyle={{ fontSize: 12 }}
            >
              Ya pago
            </Button>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['hoy', 'semana', 'mes'] as const).map((f) => (
          <Chip
            key={f}
            selected={filter === f}
            onPress={() => setFilter(f)}
            mode={filter === f ? 'flat' : 'outlined'}
            style={filter === f ? { backgroundColor: theme.colors.primaryContainer } : undefined}
          >
            {f === 'hoy' ? 'Hoy' : f === 'semana' ? 'Semana' : 'Mes'}
          </Chip>
        ))}
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando ventas..." />
      ) : sales.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Sin ventas"
          subtitle="No hay ventas registradas para este periodo"
        />
      ) : (
        <FlatList
          data={sales}
          renderItem={renderSale}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={3000}
        style={{
          backgroundColor: snackbar.success ? '#4CAF50' : '#B71C1C',
        }}
      >
        <Text style={{ color: '#FFFFFF' }}>
          {snackbar.message}
        </Text>
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  list: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 80,
  },
  saleCard: {
    marginBottom: 8,
    borderRadius: 12,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemsList: {
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
});
