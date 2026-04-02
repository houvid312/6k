import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface Props {
  percentage: number;
  label?: string;
}

function getGaugeColor(pct: number): string {
  if (pct <= 30) return '#388E3C';
  if (pct <= 40) return '#F57C00';
  return '#D32F2F';
}

export function FoodCostGauge({ percentage, label = 'Costo de materia prima' }: Props) {
  const theme = useTheme();
  const color = getGaugeColor(percentage);
  const widthPercent = Math.min(100, Math.max(0, percentage));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
          {label}
        </Text>
        <Text variant="titleMedium" style={{ fontWeight: 'bold', color }}>
          {percentage.toFixed(1)}%
        </Text>
      </View>
      <View style={styles.barBackground}>
        <View
          style={[styles.barFill, { width: `${widthPercent}%`, backgroundColor: color }]}
        />
      </View>
      <View style={styles.labels}>
        <Text variant="labelSmall" style={{ color: '#388E3C' }}>0%</Text>
        <Text variant="labelSmall" style={{ color: '#F57C00' }}>30%</Text>
        <Text variant="labelSmall" style={{ color: '#D32F2F' }}>40%+</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  barBackground: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: 12,
    borderRadius: 6,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});
