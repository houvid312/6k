import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { Product } from '../../domain/entities';

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
}

export function ProductGrid({ products, onSelect, selectedId }: Props) {
  const theme = useTheme();

  const renderItem = ({ item }: { item: Product }) => {
    const isSelected = item.id === selectedId;
    return (
      <Card
        style={[
          styles.card,
          isSelected && { borderColor: theme.colors.primary, borderWidth: 2 },
        ]}
        mode="elevated"
        onPress={() => onSelect(item.id)}
      >
        <Card.Content style={styles.cardContent}>
          <Text style={styles.emoji}>{getEmoji(item)}</Text>
          <Text
            variant="titleSmall"
            numberOfLines={2}
            style={[styles.productName, { color: theme.colors.onSurface }]}
          >
            {item.name}
          </Text>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {item.category === 'PIZZA' ? 'Pizza' : 'Bebida'}
          </Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <FlatList
      data={products}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            No hay productos disponibles
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 8,
  },
  row: {
    gap: 8,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  productName: {
    textAlign: 'center',
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    padding: 32,
  },
});
