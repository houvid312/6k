import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { InventorySummaryItem } from '../../services/InventoryService';
import { formatCOP } from '../../utils/currency';

interface Props {
  item: InventorySummaryItem;
  minimumGrams?: number;
}

function getStockColor(current: number, minimum: number): string {
  if (minimum <= 0) return '#388E3C';
  const ratio = current / minimum;
  if (ratio > 1.5) return '#388E3C';
  if (ratio > 1) return '#F57C00';
  return '#D32F2F';
}

export function InventoryLevelCard({ item, minimumGrams = 0 }: Props) {
  const theme = useTheme();
  const stockColor = getStockColor(item.quantityGrams, minimumGrams);
  const barWidth = minimumGrams > 0
    ? Math.min(100, (item.quantityGrams / (minimumGrams * 2)) * 100)
    : 50;

  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleSmall" style={{ fontWeight: '600' }}>
            {item.supplyName}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.gramsPerBag}g/bolsa
          </Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
              {item.bags}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Bolsas
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
              {Math.round(item.looseGrams)}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Gramos sueltos
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="titleMedium" style={{ fontWeight: '600' }}>
              {Math.round(item.quantityGrams)}g
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Total
            </Text>
          </View>
        </View>
        <View style={styles.barBackground}>
          <View
            style={[
              styles.barFill,
              { width: `${barWidth}%`, backgroundColor: stockColor },
            ]}
          />
        </View>
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
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  stat: {
    alignItems: 'center',
  },
  barBackground: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
});
