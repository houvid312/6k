import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export interface FlavorSegment {
  flavorName: string;
  totalUnits: number;
  dailyAvgUnits: number;
  percentage: number;
  color: string;
}

interface Props {
  segments: FlavorSegment[];
}

export function FlavorDistributionChart({ segments }: Props) {
  const theme = useTheme();
  const validSegments = segments.filter((s) => s.percentage > 0);
  const totalUnits = segments.reduce((sum, s) => sum + s.totalUnits, 0);

  if (totalUnits === 0 || validSegments.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Sin datos suficientes para calcular distribución de sabores.
        </Text>
      </View>
    );
  }

  // Web CSS conic-gradient or bar breakdown fallback
  const conicGradientCss = validSegments
    .reduce<{ stops: string[]; cumulative: number }>(
      (acc, seg) => {
        const next = acc.cumulative + seg.percentage;
        acc.stops.push(`${seg.color} ${acc.cumulative.toFixed(1)}% ${next.toFixed(1)}%`);
        acc.cumulative = next;
        return acc;
      },
      { stops: [], cumulative: 0 }
    )
    .stops.join(', ');

  return (
    <View style={styles.container}>
      {/* Visual Chart Container */}
      <View style={styles.chartWrapper}>
        {Platform.OS === 'web' ? (
          <View
            style={[
              styles.donutWeb,
              {
                // @ts-ignore - CSS conic gradient in web
                background: `conic-gradient(${conicGradientCss})`,
              },
            ]}
          >
            <View style={[styles.donutHole, { backgroundColor: '#1E1E1E' }]}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#F5F0EB' }}>
                100%
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {totalUnits.toLocaleString()} uds
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.stackedBar}>
            {validSegments.map((seg, i) => (
              <View
                key={seg.flavorName || i}
                style={[
                  styles.barSegment,
                  {
                    width: `${seg.percentage}%`,
                    backgroundColor: seg.color,
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>

      {/* Legend with Color Dots and Percentages */}
      <View style={styles.legendGrid}>
        {validSegments.map((seg) => (
          <View key={seg.flavorName} style={styles.legendCard}>
            <View style={[styles.colorDot, { backgroundColor: seg.color }]} />
            <View style={{ flex: 1 }}>
              <Text variant="bodySmall" style={styles.flavorTitle} numberOfLines={1}>
                {seg.flavorName}
              </Text>
              <View style={styles.legendMeta}>
                <Text variant="labelSmall" style={{ fontWeight: 'bold', color: '#4CAF50' }}>
                  {seg.percentage.toFixed(1)}%
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  ({seg.totalUnits.toLocaleString()} uds)
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    width: '100%',
  },
  donutWeb: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  donutHole: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackedBar: {
    flexDirection: 'row',
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  barSegment: {
    height: 28,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  legendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  flavorTitle: {
    fontWeight: '600',
    color: '#F5F0EB',
  },
  legendMeta: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
});
