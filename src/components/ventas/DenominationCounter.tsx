import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton, TextInput, useTheme, Divider } from 'react-native-paper';
import { DenominationCount } from '../../domain/entities';
import { COP_DENOMINATIONS } from '../../utils/constants';
import { formatCOP } from '../../utils/currency';

interface Props {
  denominations: DenominationCount;
  onChange: (key: keyof DenominationCount, count: number) => void;
  total: number;
}

export function DenominationCounter({ denominations, onChange, total }: Props) {
  const theme = useTheme();

  return (
    <View>
      {COP_DENOMINATIONS.map((denom) => {
        const key = denom.key as keyof DenominationCount;
        const count = denominations[key] ?? 0;
        const subtotal = count * denom.value;

        return (
          <View key={denom.key}>
            <View style={styles.row}>
              <Text variant="bodyMedium" style={styles.label}>
                {denom.label}
              </Text>
              <View style={styles.controls}>
                <IconButton
                  icon="minus"
                  size={18}
                  mode="contained-tonal"
                  onPress={() => onChange(key, Math.max(0, count - 1))}
                  style={styles.iconBtn}
                />
                <TextInput
                  value={String(count)}
                  onChangeText={(text) => {
                    const parsed = parseInt(text, 10);
                    onChange(key, isNaN(parsed) ? 0 : Math.max(0, parsed));
                  }}
                  keyboardType="numeric"
                  mode="outlined"
                  style={styles.input}
                  dense
                />
                <IconButton
                  icon="plus"
                  size={18}
                  mode="contained-tonal"
                  onPress={() => onChange(key, count + 1)}
                  style={styles.iconBtn}
                />
              </View>
              <Text variant="bodySmall" style={[styles.subtotal, { color: theme.colors.onSurfaceVariant }]}>
                {formatCOP(subtotal)}
              </Text>
            </View>
            <Divider />
          </View>
        );
      })}
      <View style={styles.totalRow}>
        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
          Total Efectivo
        </Text>
        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
          {formatCOP(total)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    width: 80,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  iconBtn: {
    margin: 0,
  },
  input: {
    width: 60,
    textAlign: 'center',
    height: 36,
  },
  subtotal: {
    width: 80,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
});
