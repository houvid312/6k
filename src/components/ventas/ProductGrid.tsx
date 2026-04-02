import React from 'react';
import { StyleSheet, View, TouchableOpacity, Dimensions } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Product } from '../../domain/entities';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 12;
const GRID_GAP = 8;
const PIZZA_CARD_WIDTH = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3);
const BEV_CARD_WIDTH = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 3) / 4);

const PIZZA_EMOJI: Record<string, string> = {
  'prod-hawaiana': '\uD83C\uDF4D',
  'prod-jamon-tocineta': '\uD83E\uDD53',
  'prod-pepperoni': '\uD83D\uDD34',
  'prod-pollo-champinones': '\uD83C\uDF44',
  'prod-napolitana': '\uD83C\uDF45',
  'prod-mexicana': '\uD83C\uDF36\uFE0F',
  'prod-jamon-queso': '\uD83E\uDDC0',
};

const BEVERAGE_EMOJI: Record<string, string> = {
  'prod-gaseosa-15': '\uD83E\uDD64',
  'prod-gaseosa-personal': '\uD83E\uDD64',
  'prod-mr-soda': '\uD83C\uDF7A',
  'prod-agua': '\uD83D\uDCA7',
  'prod-jugo': '\uD83E\uDDC3',
};

function getEmoji(product: Product): string {
  if (product.category === 'BEBIDA') {
    return BEVERAGE_EMOJI[product.id] ?? '\uD83E\uDD64';
  }
  return PIZZA_EMOJI[product.id] ?? '\uD83C\uDF55';
}

interface Props {
  products: Product[];
  onSelect: (productId: string) => void;
  selectedId?: string;
  availablePortions?: Record<string, number>;
}

function getPortionColor(count: number): string {
  if (count <= 0) return '#B71C1C';
  if (count <= 5) return '#D32F2F';
  if (count <= 10) return '#FF9800';
  return '#388E3C';
}

export function ProductGrid({ products, onSelect, selectedId, availablePortions }: Props) {
  const theme = useTheme();

  const pizzas = products.filter((p) => p.category === 'PIZZA');
  const beverages = products.filter((p) => p.category === 'BEBIDA');

  if (products.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          No hay productos disponibles
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Pizzas - 3 columns */}
      <View style={styles.grid}>
        {pizzas.map((item) => {
          const isSelected = item.id === selectedId;
          const portions = availablePortions?.[item.id];
          const hasPortions = portions !== undefined;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.pizzaCard,
                { backgroundColor: theme.colors.surface },
                isSelected && { borderColor: theme.colors.primary },
              ]}
              onPress={() => onSelect(item.id)}
              activeOpacity={0.7}
            >
              {hasPortions && (
                <View style={[styles.portionBadge, { backgroundColor: getPortionColor(portions) }]}>
                  <Text style={styles.portionBadgeText}>{portions}</Text>
                </View>
              )}
              <Text style={styles.emoji}>{getEmoji(item)}</Text>
              <Text
                numberOfLines={2}
                style={[styles.productName, { color: theme.colors.onSurface }]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Beverages - 4 columns */}
      {beverages.length > 0 && (
        <>
          <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
            Bebidas
          </Text>
          <View style={styles.grid}>
            {beverages.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.bevCard,
                    { backgroundColor: theme.colors.surface },
                    isSelected && { borderColor: theme.colors.primary },
                  ]}
                  onPress={() => onSelect(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.bevEmoji}>{getEmoji(item)}</Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.bevName, { color: theme.colors.onSurface }]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  pizzaCard: {
    width: PIZZA_CARD_WIDTH,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  portionBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 1,
  },
  portionBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  productName: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 14,
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 8,
    fontWeight: '600',
  },
  bevCard: {
    width: BEV_CARD_WIDTH,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bevEmoji: {
    fontSize: 22,
    marginBottom: 2,
  },
  bevName: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 9,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
  },
});
