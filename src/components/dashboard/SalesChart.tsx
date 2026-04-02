import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { formatCOP } from '../../utils/currency';

interface DataPoint {
  label: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  title?: string;
}

export function SalesChart({ data, title }: Props) {
  const theme = useTheme();
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.container}>
      {title && (
        <Text variant="titleSmall" style={[styles.title, { fontWeight: '600' }]}>
          {title}
        </Text>
      )}
      {data.map((item, index) => {
        const widthPercent = (item.value / maxValue) * 100;
        return (
          <View key={index} style={styles.barRow}>
            <Text
              variant="labelSmall"
              style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  {
                    width: `${widthPercent}%`,
                    backgroundColor: theme.colors.primary,
                  },
                ]}
              />
            </View>
            <Text variant="labelSmall" style={[styles.valueText, { fontWeight: '600' }]}>
              {formatCOP(item.value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    width: 70,
    marginRight: 8,
  },
  barContainer: {
    flex: 1,
    height: 20,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    height: 20,
    borderRadius: 4,
  },
  valueText: {
    width: 70,
    textAlign: 'right',
    marginLeft: 8,
  },
});
