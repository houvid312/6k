import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Button, Card, Text, Chip, Snackbar, useTheme, Searchbar } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Sale } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { formatDateTime, toISODate } from '../../../src/utils/dates';

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  [PaymentMethod.EFECTIVO]: 'cash',
  [PaymentMethod.TRANSFERENCIA]: 'bank-transfer',
  [PaymentMethod.MIXTO]: 'swap-horizontal',
};

export default function HistorialScreen() {
  const theme = useTheme();
  const { saleService } = useDI();
  const { selectedStoreId } = useAppStore();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'hoy' | 'semana' | 'mes'>('hoy');

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

  const renderSale = ({ item }: { item: Sale }) => (
    <Card style={styles.saleCard} mode="elevated">
      <Card.Content>
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
                  ? theme.colors.primaryContainer
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
        {item.customerNote ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            {item.customerNote}
          </Text>
        ) : null}
        <View style={styles.saleDetails}>
          <View>
            <Text variant="bodyMedium">
              {item.items.length} producto{item.items.length !== 1 ? 's' : ''}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.totalPortions} porciones
            </Text>
          </View>
          <View style={styles.saleRight}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {formatCOP(item.totalAmount)}
            </Text>
            {!item.isPaid && (
              <Button
                mode="contained-tonal"
                compact
                onPress={() => handleMarkAsPaid(item)}
                style={styles.paidBtn}
              >
                Marcar pagado
              </Button>
            )}
          </View>
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
          backgroundColor: snackbar.success
            ? theme.colors.primaryContainer
            : theme.colors.errorContainer,
        }}
      >
        <Text
          style={{
            color: snackbar.success
              ? theme.colors.onPrimaryContainer
              : theme.colors.onErrorContainer,
          }}
        >
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
  saleDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paidBtn: {
    marginTop: 2,
  },
});
