import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { PizzaSize, PORTIONS_PER_SIZE } from '../../domain/enums';

const SIZE_LABELS: Record<PizzaSize, string> = {
  [PizzaSize.INDIVIDUAL]: 'Individual',
  [PizzaSize.DIAMANTE]: 'Diamante',
  [PizzaSize.MEDIANA]: 'Mediana',
  [PizzaSize.FAMILIAR]: 'Familiar',
};

interface Props {
  selected: PizzaSize | null;
  onSelect: (size: PizzaSize) => void;
}

export function SizeSelector({ selected, onSelect }: Props) {
  const theme = useTheme();
  const sizes = [PizzaSize.INDIVIDUAL, PizzaSize.DIAMANTE, PizzaSize.MEDIANA, PizzaSize.FAMILIAR];

  return (
    <View style={styles.container}>
      {sizes.map((size) => {
        const isSelected = size === selected;
        return (
          <TouchableOpacity
            key={size}
            style={[
              styles.button,
              {
                backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
              },
            ]}
            onPress={() => onSelect(size)}
            activeOpacity={0.7}
          >
            <Text
              variant="labelLarge"
              style={{ color: isSelected ? '#FFFFFF' : theme.colors.onSurface, fontWeight: '600' }}
            >
              {SIZE_LABELS[size]}
            </Text>
            <Text
              variant="labelSmall"
              style={{ color: isSelected ? '#FFFFFF' : theme.colors.onSurfaceVariant }}
            >
              ({PORTIONS_PER_SIZE[size]} porc.)
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    minWidth: '45%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
