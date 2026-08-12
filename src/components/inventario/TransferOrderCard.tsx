import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Divider, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Transfer } from '../../domain/entities';
import { TransferStatus } from '../../domain/enums';
import { formatDate, formatDateTime } from '../../utils/dates';
import { formatCOP } from '../../utils/currency';

interface StatusBadgeConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

const STATUS_CONFIG: Record<TransferStatus, StatusBadgeConfig> = {
  [TransferStatus.PENDING]: {
    label: 'Pendiente',
    color: '#FFB74D',
    bgColor: 'rgba(255, 183, 77, 0.15)',
    borderColor: '#F57C00',
    icon: 'clock-outline',
  },
  [TransferStatus.IN_TRANSIT]: {
    label: 'En tránsito',
    color: '#64B5F6',
    bgColor: 'rgba(100, 181, 246, 0.15)',
    borderColor: '#1976D2',
    icon: 'truck-delivery-outline',
  },
  [TransferStatus.RECEIVED]: {
    label: 'Recibido',
    color: '#81C784',
    bgColor: 'rgba(129, 199, 132, 0.15)',
    borderColor: '#388E3C',
    icon: 'check-circle-outline',
  },
  [TransferStatus.CANCELLED]: {
    label: 'Cancelado',
    color: '#E57373',
    bgColor: 'rgba(229, 115, 115, 0.15)',
    borderColor: '#D32F2F',
    icon: 'close-circle-outline',
  },
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

  const paymentStatus = useMemo(() => {
    if (!isReceived) {
      return {
        label: 'Por Recibir',
        textColor: '#B0BEC5',
        bgColor: 'rgba(176, 190, 197, 0.15)',
        borderColor: '#78909C',
        icon: 'clock-outline' as const,
      };
    }
    if (creditEntry) {
      if (creditEntry.isPaid || creditEntry.balance <= 0) {
        return {
          label: 'Pagado',
          textColor: '#81C784',
          bgColor: 'rgba(129, 199, 132, 0.15)',
          borderColor: '#388E3C',
          icon: 'cash-check' as const,
        };
      }
      return {
        label: `Pendiente (${formatCOP(creditEntry.balance)})`,
        textColor: '#FFB74D',
        bgColor: 'rgba(255, 183, 77, 0.15)',
        borderColor: '#E65100',
        icon: 'alert-circle-outline' as const,
      };
    }
    return {
      label: 'Pagado',
      textColor: '#81C784',
      bgColor: 'rgba(129, 199, 132, 0.15)',
      borderColor: '#388E3C',
      icon: 'cash-check' as const,
    };
  }, [isReceived, creditEntry]);

  const totalPrice = isReceived
    ? transfer.totalPriceCop ?? transfer.items.reduce((sum, i) => sum + (i.totalPriceCopSnapshot ?? 0), 0)
    : transfer.items.reduce((sum, item) => {
      const supply = supplyMap?.get(item.supplyId);
      const unitPrice = supply?.isBillableToStore ? supply.commercialPriceCop : 0;
      return sum + item.bagsToSend * (unitPrice ?? 0);
    }, 0);

  return (
    <Card style={[styles.card, isActive && { borderLeftWidth: 4, borderLeftColor: config.color }]} mode="elevated">
      <Card.Content style={{ paddingVertical: 12, paddingHorizontal: 14 }}>

        {/* Top Header Row */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text variant="titleMedium" style={{ fontWeight: '800', color: '#F5F0EB' }}>
                Traslado #{transfer.id.slice(-6).toUpperCase()}
              </Text>
              {/* Destination badge */}
              <View style={styles.destBadge}>
                <MaterialCommunityIcons name="storefront-outline" size={13} color="#FFB74D" />
                <Text style={styles.destBadgeText}>
                  Destino: {toStoreName}
                </Text>
              </View>
            </View>

            {/* Route */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <MaterialCommunityIcons name="map-marker-path" size={14} color="#999" />
              <Text variant="bodySmall" style={{ color: '#AAAAAA', fontWeight: '500' }}>
                {fromStoreName} <Text style={{ color: '#FFB74D', fontWeight: '700' }}>➔ {toStoreName}</Text>
              </Text>
            </View>

            {/* Date & Quantities */}
            <Text variant="bodySmall" style={{ color: '#777777', marginTop: 2 }}>
              {formatTransferCreatedAt(transfer)} • {transfer.items.length} insumos • {totalBags} bolsas
            </Text>

            {/* Price & Payment Status Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text variant="bodySmall" style={{ color: '#888888' }}>Total local:</Text>
                <Text variant="titleSmall" style={{ color: '#E63946', fontWeight: '800' }}>
                  {formatCOP(totalPrice)}
                </Text>
              </View>

              {/* Custom Payment Status Badge */}
              <View style={[styles.customBadge, { backgroundColor: paymentStatus.bgColor, borderColor: paymentStatus.borderColor }]}>
                <MaterialCommunityIcons name={paymentStatus.icon} size={12} color={paymentStatus.textColor} />
                <Text style={[styles.customBadgeText, { color: paymentStatus.textColor }]}>
                  {paymentStatus.label}
                </Text>
              </View>
            </View>
          </View>

          {/* Transfer Status Badge */}
          <View style={[styles.customBadge, { backgroundColor: config.bgColor, borderColor: config.borderColor, alignSelf: 'flex-start' }]}>
            <MaterialCommunityIcons name={config.icon} size={13} color={config.color} />
            <Text style={[styles.customBadgeText, { color: config.color }]}>
              {config.label}
            </Text>
          </View>
        </View>

        {/* Toggle Details */}
        <Button
          mode="text"
          compact
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          onPress={() => setExpanded(!expanded)}
          textColor="#999"
          style={{ alignSelf: 'flex-start', marginTop: 4, marginLeft: -8 }}
        >
          {expanded ? 'Ocultar detalle' : 'Ver detalle'}
        </Button>

        {/* Expanded details */}
        {expanded && (
          <>
            <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />
            <Text variant="bodySmall" style={{ color: '#999', marginBottom: 6, fontWeight: '600' }}>
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
                    <Text variant="bodySmall" style={{ color: '#F5F0EB', flex: 1, fontWeight: '500' }}>
                      {name}
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#AAAAAA', marginRight: 12 }}>
                      {item.bagsToSend} bolsa{item.bagsToSend !== 1 ? 's' : ''}
                    </Text>
                    {totalGrams != null && (
                      <Text variant="bodySmall" style={{ color: '#E63946', fontWeight: '600', width: 70, textAlign: 'right' }}>
                        {Math.round(totalGrams)}g
                      </Text>
                    )}
                  </View>
                  <View style={styles.priceRow}>
                    <Text variant="labelSmall" style={{ color: '#888888' }}>
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

        {/* Actions according to status */}
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
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  destBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 183, 77, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 77, 0.3)',
  },
  destBadgeText: {
    fontSize: 11,
    color: '#FFB74D',
    fontWeight: '700',
  },
  customBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  itemBlock: {
    paddingVertical: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 1,
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
