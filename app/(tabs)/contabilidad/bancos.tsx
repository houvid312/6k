import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Divider, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Sale } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { formatDateTime, toISODate } from '../../../src/utils/dates';

export default function BancosScreen() {
  const theme = useTheme();
  const { saleService } = useDI();
  const { selectedStoreId } = useAppStore();

  const [bankSales, setBankSales] = useState<Sale[]>([]);
  const [totalBank, setTotalBank] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const all = await saleService.getSalesByStore(selectedStoreId);
        const withBank = all.filter(
          (s) => s.paymentMethod === PaymentMethod.TRANSFERENCIA || s.paymentMethod === PaymentMethod.MIXTO,
        );
        setBankSales(withBank.slice(-10).reverse());
        setTotalBank(withBank.reduce((sum, s) => sum + s.bankAmount, 0));
      } catch {
        setBankSales([]);
      }
    })();
  }, [selectedStoreId, saleService]);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      <KpiCard
        icon="bank"
        label="Total en Banco"
        value={formatCOP(totalBank)}
        color="#1976D2"
      />

      <Divider style={styles.divider} />

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Movimientos Bancarios
      </Text>

      {bankSales.length === 0 ? (
        <EmptyState
          icon="bank-off"
          title="Sin movimientos"
          subtitle="No hay ventas por transferencia"
        />
      ) : (
        bankSales.map((sale) => (
          <Card key={sale.id} style={styles.txCard} mode="elevated">
            <Card.Content style={styles.txRow}>
              <View>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                  Venta - {sale.paymentMethod}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {formatDateTime(sale.timestamp)}
                </Text>
              </View>
              <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#1976D2' }}>
                {formatCOP(sale.bankAmount)}
              </Text>
            </Card.Content>
          </Card>
        ))
      )}

      <View style={{ height: 80 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  divider: {
    marginVertical: 16,
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
