import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton, Divider, TextInput, useTheme } from 'react-native-paper';
import { CartItem } from '../../stores/useSaleStore';
import { formatCOP } from '../../utils/currency';
import { PizzaSize } from '../../domain/enums';

const SIZE_SHORT: Record<PizzaSize, string> = {
  [PizzaSize.INDIVIDUAL]: 'Ind.',
  [PizzaSize.DIAMANTE]: 'Diam.',
  [PizzaSize.MEDIANA]: 'Med.',
  [PizzaSize.FAMILIAR]: 'Fam.',
};

interface Props {
  items: CartItem[];
  onRemove: (cartItemId: string) => void;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onUpdateNote: (cartItemId: string, note: string) => void;
}

export function CartSummary({ items, onRemove, onUpdateQuantity, onUpdateNote }: Props) {
  const theme = useTheme();

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Carrito vacio
        </Text>
      </View>
    );
  }

  const totalPortions = items.reduce((sum, i) => sum + i.portions, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.subtotal, 0);

  return (
    <View>
      {items.map((item, index) => (
        <View key={item.cartItemId}>
          <View style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                {item.productName}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {SIZE_SHORT[item.size]} - {item.portions} porc.
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
              {formatCOP(item.subtotal)}
            </Text>
            <IconButton
              icon="close-circle"
              size={20}
              iconColor={theme.colors.error}
              onPress={() => onRemove(item.cartItemId)}
              style={styles.removeBtn}
            />
          </View>
          {/* Quantity controls */}
          <View style={styles.quantityControls}>
            <IconButton
              icon="minus-circle-outline"
              size={22}
              onPress={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
              style={styles.qtyBtn}
            />
            <Text variant="titleSmall" style={styles.qtyText}>
              {item.quantity}
            </Text>
            <IconButton
              icon="plus-circle-outline"
              size={22}
              onPress={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
              style={styles.qtyBtn}
            />
          </View>
          {/* Customer note */}
          <TextInput
            placeholder="Cliente / nota (ej: Mesa 3, Juan)"
            value={item.customerNote}
            onChangeText={(text) => onUpdateNote(item.cartItemId, text)}
            mode="flat"
            dense
            style={styles.noteInput}
          />
          {index < items.length - 1 && <Divider style={styles.itemDivider} />}
        </View>
      ))}
      <Divider style={styles.totalDivider} />
      <View style={styles.totalRow}>
        <View>
          <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
            TOTAL
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {totalPortions} porciones
          </Text>
        </View>
        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
          {formatCOP(totalAmount)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemInfo: {
    flex: 1,
  },
  removeBtn: {
    margin: 0,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    marginBottom: 4,
  },
  qtyBtn: {
    margin: 0,
  },
  qtyText: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '700',
  },
  noteInput: {
    marginBottom: 8,
    backgroundColor: 'transparent',
    fontSize: 13,
    height: 36,
  },
  itemDivider: {
    marginVertical: 4,
  },
  totalDivider: {
    marginTop: 8,
    height: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
});
