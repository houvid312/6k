import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Text, TextInput, IconButton, useTheme } from 'react-native-paper';
import { AdditionCatalogItem } from '../../domain/entities/Addition';
import { CartItemAddition } from '../../stores/useSaleStore';
import { formatCOP } from '../../utils/currency';

interface Props {
  additions: AdditionCatalogItem[];
  selected: CartItemAddition[];
  onToggle: (addition: AdditionCatalogItem) => void;
  onUpdateQuantity: (additionCatalogId: string, quantity: number) => void;
}

export function AdditionSelector({ additions, selected, onToggle, onUpdateQuantity }: Props) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedMap = useMemo(
    () => new Map(selected.map((s) => [s.additionCatalogId, s])),
    [selected],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return additions;
    const q = search.toLowerCase();
    return additions.filter((a) => a.name.toLowerCase().includes(q));
  }, [additions, search]);

  // Only show unselected items in dropdown
  const unselected = useMemo(
    () => filtered.filter((a) => !selectedMap.has(a.id)),
    [filtered, selectedMap],
  );

  if (additions.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
        Adiciones
      </Text>

      {/* Search input */}
      <TextInput
        placeholder="Buscar adición..."
        value={search}
        onChangeText={(t) => { setSearch(t); setDropdownOpen(true); }}
        onFocus={() => setDropdownOpen(true)}
        mode="outlined"
        dense
        style={styles.searchInput}
        right={search ? <TextInput.Icon icon="close" onPress={() => { setSearch(''); setDropdownOpen(false); }} /> : undefined}
        left={<TextInput.Icon icon="plus-circle-outline" />}
      />

      {/* Dropdown list */}
      {dropdownOpen && unselected.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: theme.colors.elevation.level2, borderColor: theme.colors.outline }]}>
          <FlatList
            data={unselected}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.dropdownList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  onToggle(item);
                  setSearch('');
                  setDropdownOpen(false);
                }}
                activeOpacity={0.7}
              >
                <Text variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                  {formatCOP(item.price)}
                </Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />}
          />
        </View>
      )}

      {/* Selected additions */}
      {selected.length > 0 && (
        <View style={styles.selectedList}>
          {selected.map((sel) => {
            const catalog = additions.find((a) => a.id === sel.additionCatalogId);
            return (
              <View key={sel.additionCatalogId} style={[styles.selectedRow, { backgroundColor: theme.colors.primaryContainer }]}>
                <IconButton
                  icon="close-circle"
                  size={16}
                  iconColor={theme.colors.error}
                  onPress={() => onToggle(catalog!)}
                  style={styles.removeBtn}
                />
                <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onPrimaryContainer }} numberOfLines={1}>
                  {sel.name}
                </Text>
                <View style={styles.qtyControls}>
                  <IconButton
                    icon="minus-circle-outline"
                    size={16}
                    onPress={() => onUpdateQuantity(sel.additionCatalogId, sel.quantity - 1)}
                    style={styles.qtyBtn}
                  />
                  <Text variant="labelMedium" style={{ fontWeight: '700', minWidth: 16, textAlign: 'center' }}>
                    {sel.quantity}
                  </Text>
                  <IconButton
                    icon="plus-circle-outline"
                    size={16}
                    onPress={() => onUpdateQuantity(sel.additionCatalogId, sel.quantity + 1)}
                    style={styles.qtyBtn}
                  />
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: '600', minWidth: 55, textAlign: 'right' }}>
                  {formatCOP(sel.price * sel.quantity)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  searchInput: {
    fontSize: 14,
    height: 40,
  },
  dropdown: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  dropdownList: {
    maxHeight: 160,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  separator: {
    height: 1,
  },
  selectedList: {
    marginTop: 8,
    gap: 4,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingRight: 8,
    paddingVertical: 2,
  },
  removeBtn: {
    margin: 0,
    width: 24,
    height: 24,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyBtn: {
    margin: 0,
    width: 22,
    height: 22,
  },
});
