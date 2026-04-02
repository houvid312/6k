import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
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
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

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
      {items.map((item, index) => {
        const showNote = expandedNote === item.cartItemId || item.customerNote.trim().length > 0;

        return (
          <View key={item.cartItemId}>
            <View style={styles.itemRow}>
              {/* Remove */}
              <IconButton
                icon="close-circle"
                size={18}
                iconColor={theme.colors.error}
                onPress={() => onRemove(item.cartItemId)}
                style={styles.iconBtn}
              />

              {/* Name + size */}
              <Pressable
                style={styles.itemInfo}
                onPress={() => setExpandedNote(expandedNote === item.cartItemId ? null : item.cartItemId)}
              >
                <Text variant="bodyMedium" style={{ fontWeight: '600' }} numberOfLines={1}>
                  {item.productName}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {SIZE_SHORT[item.size]} · {item.portions} porc.
                  {item.customerNote.trim() ? '  📝' : ''}
                </Text>
              </Pressable>

              {/* Quantity controls inline */}
              <View style={styles.qtyRow}>
                <IconButton
                  icon="minus-circle-outline"
                  size={20}
                  onPress={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
                  style={styles.iconBtn}
                />
                <Text variant="bodyMedium" style={styles.qtyText}>
                  {item.quantity}
                </Text>
                <IconButton
                  icon="plus-circle-outline"
                  size={20}
                  onPress={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
                  style={styles.iconBtn}
                />
              </View>

              {/* Price */}
              <Text variant="bodyMedium" style={{ fontWeight: '600', minWidth: 70, textAlign: 'right' }}>
                {formatCOP(item.subtotal)}
              </Text>
            </View>

            {/* Collapsible note */}
            {showNote && (
              <TextInput
                placeholder="Nota (ej: Mesa 3, Juan)"
                value={item.customerNote}
                onChangeText={(text) => onUpdateNote(item.cartItemId, text)}
                mode="flat"
                dense
                style={styles.noteInput}
              />
            )}

            {index < items.length - 1 && <Divider style={styles.itemDivider} />}
          </View>
        );
      })}
      <Divider style={styles.totalDivider} />
      <View style={styles.totalRow}>
        <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
          TOTAL · {totalPortions} porc.
        </Text>
        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
          {formatCOP(totalAmount)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  iconBtn: {
    margin: 0,
    width: 28,
    height: 28,
  },
  itemInfo: {
    flex: 1,
    marginHorizontal: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyText: {
    minWidth: 20,
    textAlign: 'center',
    fontWeight: '700',
  },
  noteInput: {
    marginLeft: 28,
    marginBottom: 4,
    backgroundColor: 'transparent',
    fontSize: 12,
    height: 32,
  },
  itemDivider: {
    marginVertical: 2,
  },
  totalDivider: {
    marginTop: 6,
    height: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
});
