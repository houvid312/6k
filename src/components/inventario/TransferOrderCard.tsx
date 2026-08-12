import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Chip, Text, Button, Divider, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { Transfer } from '../../domain/entities';
import { TransferStatus } from '../../domain/enums';
import { formatDate, formatDateTime } from '../../utils/dates';
import { formatCOP } from '../../utils/currency';

const STATUS_CONFIG: Record<TransferStatus, { label: string; color: string; icon: string }> = {
  [TransferStatus.PENDING]: { label: 'Pendiente', color: '#F57C00', icon: 'clock-outline' },
  [TransferStatus.IN_TRANSIT]: { label: 'En transito', color: '#1976D2', icon: 'truck-delivery' },
  [TransferStatus.RECEIVED]: { label: 'Recibido', color: '#388E3C', icon: 'check-circle' },
  [TransferStatus.CANCELLED]: { label: 'Cancelado', color: '#D32F2F', icon: 'close-circle' },
};

function formatTransferCreatedAt(transfer: Transfer): string {
  const timestamp = transfer.orderDate.includes('T')
    ? transfer.orderDate
    : transfer.createdAt;

  if (timestamp) {
    return formatDateTime(timestamp);
  }

  return formatDate(transfer.orderDate);
}

interface Props {
  transfer: Transfer;
  supplyMap?: Map<string, {
    name: string;
    gramsPerBag: number;
    commercialPriceCop: number;
    isBillableToStore: boolean;
  }>;
  storeMap?: Map<string, string>;
  creditMap?: Map<string, any>;
  onMarkInTransit?: (transfer: Transfer) => void;
  onReceive?: (transfer: Transfer) => void;
  onCancel?: (transfer: Transfer) => void;
  actionLoading?: boolean;
}

export function TransferOrderCard({
  transfer,
  supplyMap,
  storeMap,
  creditMap,
  onMarkInTransit,
  onReceive,
  onCancel,
  actionLoading,
}: Props) {
  const theme = useTheme();
  const config = STATUS_CONFIG[transfer.status];
  const [expanded, setExpanded] = useState(false);

  const totalBags = transfer.items.reduce((sum, i) => sum + i.bagsToSend, 0);
  const isPending = transfer.status === TransferStatus.PENDING;
  const isInTransit = transfer.status === TransferStatus.IN_TRANSIT;
  const isReceived = transfer.status === TransferStatus.RECEIVED;
  const isActive = isPending || isInTransit;

  const fromStoreName = storeMap?.get(transfer.fromStoreId) || 'Origen';
  const toStoreName = storeMap?.get(transfer.toStoreId) || 'Destino';

  const creditEntry = creditMap?.get(transfer.id) || (transfer.creditEntryId ? creditMap?.get(transfer.creditEntryId) : undefined);

  const paymentStatus = React.useMemo(() => {
    if (!isReceived) {
      return { label: 'Por Recibir', color: '#757575', icon: 'clock-outline' };
    }
    if (creditEntry) {
      if (creditEntry.isPaid || creditEntry.balance <= 0) {
        return { label: 'Pagado', color: '#2E7D32', icon: 'cash-check' };
      }
      return { label: `Pendiente de Pago (${formatCOP(creditEntry.balance)})`, color: '#E65100', icon: 'alert-circle-outline' };
    }
    return { label: 'Pagado', color: '#2E7D32', icon: 'cash-check' };
  }, [isReceived, creditEntry]);

  const totalPrice = isReceived
    ? transfer.totalPriceCop ?? transfer.items.reduce((sum, i) => sum + (i.totalPriceCopSnapshot ?? 0), 0)
    : transfer.items.reduce((sum, item) => {
      const supply = supplyMap?.get(item.supplyId);
      const unitPrice = supply?.isBillableToStore ? supply.commercialPriceCop : 0;
      return sum + item.bagsToSend * (unitPrice ?? 0);
    }, 0);

  return (
    <Card style={[styles.card, isActive && { borderLeftWidth: 3, borderLeftColor: config.color }]} mode="elevated">
      <Card.Content>
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text variant="titleSmall" style={{ fontWeight: '700' }}>
                Traslado #{transfer.id.slice(-6).toUpperCase()}
              </Text>
              <Chip
                compact
                style={{ backgroundColor: '#2A2A2A', height: 24 }}
                textStyle={{ fontSize: 11, color: '#FFB74D', fontWeight: '700' }}
                icon="storefront-outline"
              >
                Destino: {toStoreName}
              </Chip>
            </View>

            <Text variant="bodySmall" style={{ color: '#AAAAAA', marginTop: 3 }}>
              {fromStoreName} ➔ <Text style={{ color: '#FFB74D', fontWeight: '600' }}>{toStoreName}</Text>
            </Text>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {formatTransferCreatedAt(transfer)} - {transfer.items.length} insumos - {totalBags} bolsas
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <Text variant="bodySmall" style={{ color: '#E63946', fontWeight: '700' }}>
                Total local: {formatCOP(totalPrice)}
              </Text>
              <Chip
                compact
                icon={paymentStatus.icon}
                textStyle={{ fontSize: 10, color: '#FFFFFF', fontWeight: '700' }}
                style={{ backgroundColor: paymentStatus.color, height: 22 }}
              >
                {paymentStatus.label}
              </Chip>
            </View>
          </View>

          <Chip
            compact
            icon={config.icon}
            textStyle={{ fontSize: 11, color: '#FFFFFF' }}
            style={{ backgroundColor: config.color, alignSelf: 'flex-start' }}
          >
            {config.label}
          </Chip>
        </View>

        {/* Toggle detalle */}
        <Button
          mode="text"
          compact
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          onPress={() => setExpanded(!expanded)}
          textColor="#999"
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
        >
          {expanded ? 'Ocultar detalle' : 'Ver detalle'}
        </Button>

        {/* Detalle expandido */}
        {expanded && (
          <>
            <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
            <Text variant="bodySmall" style={{ color: '#999', marginBottom: 4 }}>
              Items del traslado:
            </Text>
            {transfer.items.map((item) => {
              const supply = supplyMap?.get(item.supplyId);
              const name = supply?.name ?? item.supplyId.slice(-8);
              const gramsPerBag = isReceived
                ? item.gramsPerBagSnapshot ?? supply?.gramsPerBag
                : supply?.gramsPerBag;
              const totalGrams = gramsPerBag ? item.bagsToSend * gramsPerBag : null;
              const unitPrice = isReceived
                ? item.unitPriceCopSnapshot ?? 0
                : supply?.isBillableToStore ? supply.commercialPriceCop : 0;
              const lineTotal = isReceived
                ? item.totalPriceCopSnapshot ?? item.bagsToSend * unitPrice
                : item.bagsToSend * unitPrice;
              return (
                <View key={item.supplyId} style={styles.itemBlock}>
                  <View style={styles.itemRow}>
                    <Text variant="bodySmall" style={{ color: '#F5F0EB', flex: 1 }}>
                      {name}
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#999', marginRight: 12 }}>
                      {item.bagsToSend} bolsa{item.bagsToSend !== 1 ? 's' : ''}
                    </Text>
                    {totalGrams != null && (
                      <Text variant="bodySmall" style={{ color: '#E63946', fontWeight: '600', width: 70, textAlign: 'right' }}>
                        {Math.round(totalGrams)}g
                      </Text>
                    )}
                  </View>
                  <View style={styles.priceRow}>
                    <Text variant="labelSmall" style={{ color: '#999' }}>
                      {formatCOP(unitPrice)} c/u
                    </Text>
                    <Text variant="labelSmall" style={{ color: '#F5F0EB', fontWeight: '700' }}>
                      {formatCOP(lineTotal)}
                    </Text>
                  </View>
                </View>
              );
            })}
            <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
            <View style={styles.totalRow}>
              <Text variant="bodySmall" style={{ color: '#F5F0EB', fontWeight: '700' }}>
                Total cobro local
              </Text>
              <Text variant="bodyMedium" style={{ color: '#E63946', fontWeight: '800' }}>
                {formatCOP(totalPrice)}
              </Text>
            </View>
          </>
        )}

        {/* Acciones según estado */}
        {isActive && (
          <>
            <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
            <View style={styles.actions}>
              {isPending && onMarkInTransit && (
                <Button
                  mode="contained"
                  compact
                  icon="truck-delivery"
                  onPress={() => onMarkInTransit(transfer)}
                  loading={actionLoading}
                  disabled={actionLoading}
                  buttonColor="#1976D2"
                  textColor="#FFFFFF"
                  style={styles.actionBtn}
                >
                  Enviar
                </Button>
              )}
              {isPending && onCancel && (
                <Button
                  mode="outlined"
                  compact
                  icon="close"
                  onPress={() => onCancel(transfer)}
                  disabled={actionLoading}
                  textColor="#D32F2F"
                  style={styles.actionBtn}
                >
                  Cancelar
                </Button>
              )}
              {isInTransit && onReceive && (
                <Button
                  mode="contained"
                  compact
                  icon="check"
                  onPress={() => onReceive(transfer)}
                  loading={actionLoading}
                  disabled={actionLoading}
                  buttonColor="#388E3C"
                  textColor="#FFFFFF"
                  style={styles.actionBtn}
                >
                  Recibir
                </Button>
              )}
            </View>
          </>
        )}

        {isReceived && (
          <>
            <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
            <View style={styles.actions}>
              <Button
                mode="outlined"
                compact
                icon="wallet-outline"
                onPress={() => router.push('/(tabs)/cartera')}
                textColor="#FFB74D"
                style={styles.actionBtn}
              >
                Ver Cobro en Cartera
              </Button>
            </View>
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemBlock: {
    paddingVertical: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    borderRadius: 8,
  },
});
