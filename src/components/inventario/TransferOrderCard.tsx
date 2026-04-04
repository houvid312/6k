import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Chip, Text, Button, Divider, useTheme } from 'react-native-paper';
import { Transfer } from '../../domain/entities';
import { TransferStatus } from '../../domain/enums';
import { formatDate } from '../../utils/dates';

const STATUS_CONFIG: Record<TransferStatus, { label: string; color: string; icon: string }> = {
  [TransferStatus.PENDING]: { label: 'Pendiente', color: '#F57C00', icon: 'clock-outline' },
  [TransferStatus.IN_TRANSIT]: { label: 'En transito', color: '#1976D2', icon: 'truck-delivery' },
  [TransferStatus.RECEIVED]: { label: 'Recibido', color: '#388E3C', icon: 'check-circle' },
  [TransferStatus.CANCELLED]: { label: 'Cancelado', color: '#D32F2F', icon: 'close-circle' },
};

interface Props {
  transfer: Transfer;
  supplyMap?: Map<string, { name: string; gramsPerBag: number }>;
  onMarkInTransit?: (transfer: Transfer) => void;
  onReceive?: (transfer: Transfer) => void;
  onCancel?: (transfer: Transfer) => void;
  actionLoading?: boolean;
}

export function TransferOrderCard({
  transfer,
  supplyMap,
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
  const isActive = isPending || isInTransit;

  return (
    <Card style={[styles.card, isActive && { borderLeftWidth: 3, borderLeftColor: config.color }]} mode="elevated">
      <Card.Content>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ fontWeight: '600' }}>
              Traslado {transfer.id.slice(-6)}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {formatDate(transfer.orderDate)} - {transfer.items.length} insumos - {totalBags} bolsas
            </Text>
          </View>
          <Chip
            compact
            icon={config.icon}
            textStyle={{ fontSize: 11, color: '#FFFFFF' }}
            style={{ backgroundColor: config.color }}
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
              const name = supplyMap?.get(item.supplyId)?.name ?? item.supplyId.slice(-8);
              const gramsPerBag = supplyMap?.get(item.supplyId)?.gramsPerBag;
              const totalGrams = gramsPerBag ? item.bagsToSend * gramsPerBag : null;
              return (
                <View key={item.supplyId} style={styles.itemRow}>
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
              );
            })}
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
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    borderRadius: 8,
  },
});
