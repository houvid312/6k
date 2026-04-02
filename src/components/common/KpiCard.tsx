import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  icon?: string;
  label: string;
  value: string;
  trend?: { direction: 'up' | 'down'; label: string };
  color?: string;
}

export function KpiCard({ icon, label, value, trend, color }: Props) {
  const theme = useTheme();
  const accentColor = color ?? theme.colors.primary;

  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content style={styles.content}>
        {icon && (
          <View style={[styles.iconContainer, { backgroundColor: accentColor + '15' }]}>
            <MaterialCommunityIcons
              name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
              size={24}
              color={accentColor}
            />
          </View>
        )}
        <Text variant="bodySmall" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {label}
        </Text>
        <Text variant="headlineSmall" style={[styles.value, { color: theme.colors.onSurface }]}>
          {value}
        </Text>
        {trend && (
          <View style={styles.trendRow}>
            <MaterialCommunityIcons
              name={trend.direction === 'up' ? 'trending-up' : 'trending-down'}
              size={16}
              color={trend.direction === 'up' ? '#388E3C' : '#D32F2F'}
            />
            <Text
              variant="labelSmall"
              style={{ color: trend.direction === 'up' ? '#388E3C' : '#D32F2F', marginLeft: 4 }}
            >
              {trend.label}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
  },
  content: {
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    marginBottom: 4,
  },
  value: {
    fontWeight: 'bold',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
});
