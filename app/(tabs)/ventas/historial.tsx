import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Button, Card, Text, Chip, Divider, Snackbar, useTheme, Searchbar } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { Sale } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { formatDateTime, toISODate, todayColombia } from '../../../src/utils/dates';

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  [PaymentMethod.EFECTIVO]: 'cash',
  [PaymentMethod.TRANSFERENCIA]: 'bank-transfer',
  [PaymentMethod.MIXTO]: 'swap-horizontal',
};


export default function HistorialScreen() {
  const theme = useTheme();
  const { saleService } = useDI();
  const { selectedStoreId } = useAppStore();
  const { products } = useMasterDataStore();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'hoy' | 'ayer' | 'semana' | 'mes'>('hoy');

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const today = todayColombia(); // YYYY-MM-DD in Colombia timezone
      let startDate: string;
      let endDate: string;

      if (filter === 'hoy') {
        startDate = `${today}T00:00:00`;
        endDate = `${today}T23:59:59`;
      } else if (filter === 'ayer') {
        const yesterday = new Date(today + 'T12:00:00');
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = toISODate(yesterday);
        startDate = `${yStr}T00:00:00`;
        endDate = `${yStr}T23:59:59`;
      } else if (filter === 'semana') {
        const weekAgo = new Date(today + 'T12:00:00');
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = toISODate(weekAgo);
        endDate = `${today}T23:59:59`;
      } else {
        const monthAgo = new Date(today + 'T12:00:00');
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = toISODate(monthAgo);
        endDate = `${today}T23:59:59`;
      }

      const data = await saleService.getSalesByDateRange(
        selectedStoreId,
        startDate,
        endDate,
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

  const handleMarkAsDispatched = useCallback(async (sale: Sale) => {
    try {
      await saleService.markAsDispatched(sale.id);
      setSales((prev) => prev.map((s) => s.id === sale.id ? { ...s, isDispatched: true } : s));
      setSnackbar({ visible: true, success: true, message: `Venta de ${formatCOP(sale.totalAmount)} marcada como despachada` });
    } catch {
      setSnackbar({ visible: true, success: false, message: 'Error al marcar como despachada' });
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
                {si.formatName}
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
          <View style={styles.actionButtons}>
            {item.isPaid ? (
              <Chip compact icon="check-circle" textStyle={{ fontSize: 11, color: '#66BB6A' }} style={{ backgroundColor: '#1C3D2A' }}>
                Pagado
              </Chip>
            ) : (
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
            {item.isDispatched ? (
              <Chip compact icon="check-circle" textStyle={{ fontSize: 11, color: '#64B5F6' }} style={{ backgroundColor: '#1A3A5C' }}>
                Despachado
              </Chip>
            ) : (
              <Button
                mode="contained"
                compact
                onPress={() => handleMarkAsDispatched(item)}
                buttonColor="#1565C0"
                textColor="#FFFFFF"
                icon="truck-delivery"
                labelStyle={{ fontSize: 12 }}
              >
                Despachar
              </Button>
            )}
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Button
          mode="text"
          icon="arrow-left"
          compact
          onPress={() => router.replace('/(tabs)/ventas')}
          style={{ alignSelf: 'flex-start' }}
        >
          Ventas
        </Button>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['hoy', 'ayer', 'semana', 'mes'] as const).map((f) => (
          <Chip
            key={f}
            selected={filter === f}
            onPress={() => setFilter(f)}
            mode={filter === f ? 'flat' : 'outlined'}
            style={filter === f ? { backgroundColor: theme.colors.primaryContainer } : undefined}
          >
            {f === 'hoy' ? 'Hoy' : f === 'ayer' ? 'Ayer' : f === 'semana' ? 'Semana' : 'Mes'}
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
    flexWrap: 'wrap',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
});
