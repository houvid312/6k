import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Divider, useTheme } from 'react-native-paper';
import { formatCOP } from '../../utils/currency';

interface Props {
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  workerCount: number;
}

export function PayrollSummary({ totalGross, totalDeductions, totalNet, workerCount }: Props) {
  const theme = useTheme();

  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>
          Resumen de Nomina
        </Text>
        <View style={styles.row}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Trabajadores
          </Text>
          <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
            {workerCount}
          </Text>
        </View>
        <View style={styles.row}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Total Bruto
          </Text>
          <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
            {formatCOP(totalGross)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Deducciones
          </Text>
          <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.error }}>
            -{formatCOP(totalDeductions)}
          </Text>
        </View>
        <Divider style={styles.divider} />
        <View style={styles.row}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
            Total Neto
          </Text>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            {formatCOP(totalNet)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  divider: {
    marginVertical: 8,
    height: 2,
  },
});
