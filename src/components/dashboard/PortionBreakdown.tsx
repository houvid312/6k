import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: Segment[];
  title?: string;
}

const COLORS = ['#D32F2F', '#FFC107', '#388E3C', '#1976D2', '#7B1FA2', '#F57C00', '#00897B'];

export function PortionBreakdown({ segments, title }: Props) {
  const theme = useTheme();
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) return null;

  return (
    <View style={styles.container}>
      {title && (
        <Text variant="titleSmall" style={[styles.title, { fontWeight: '600' }]}>
          {title}
        </Text>
      )}
      <View style={styles.barContainer}>
        {segments.map((segment, index) => {
          const widthPercent = (segment.value / total) * 100;
          if (widthPercent < 1) return null;
          return (
            <View
              key={index}
              style={[
                styles.segment,
                {
                  width: `${widthPercent}%`,
                  backgroundColor: segment.color || COLORS[index % COLORS.length],
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.legend}>
        {segments.map((segment, index) => (
          <View key={index} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: segment.color || COLORS[index % COLORS.length] },
              ]}
            />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {segment.label} ({segment.value})
            </Text>
          </View>
        ))}
      </View>
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
  barContainer: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  segment: {
    height: 24,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
});
