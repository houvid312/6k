import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';
import { Transfer } from '../../domain/entities';
import { TransferStatus } from '../../domain/enums';
import { formatDate } from '../../utils/dates';

const STATUS_CONFIG: Record<TransferStatus, { label: string; color: string }> = {
  [TransferStatus.PENDING]: { label: 'Pendiente', color: '#F57C00' },
  [TransferStatus.IN_TRANSIT]: { label: 'En transito', color: '#1976D2' },
  [TransferStatus.RECEIVED]: { label: 'Recibido', color: '#388E3C' },
  [TransferStatus.CANCELLED]: { label: 'Cancelado', color: '#D32F2F' },
};

interface Props {
  transfer: Transfer;
  onPress?: () => void;
}

export function TransferOrderCard({ transfer, onPress }: Props) {
  const theme = useTheme();
  const config = STATUS_CONFIG[transfer.status];

  return (
    <Card style={styles.card} mode="elevated" onPress={onPress}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleSmall" style={{ fontWeight: '600' }}>
            Traslado {transfer.id.slice(-6)}
          </Text>
          <Chip
            compact
            textStyle={{ fontSize: 11, color: '#FFFFFF' }}
            style={{ backgroundColor: config.color }}
          >
            {config.label}
          </Chip>
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Fecha: {formatDate(transfer.orderDate)}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          {transfer.items.length} insumos - {transfer.items.reduce((sum, i) => sum + i.bagsToSend, 0)} bolsas
        </Text>
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
    marginBottom: 8,
  },
});
