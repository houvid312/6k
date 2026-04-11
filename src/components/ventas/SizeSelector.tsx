import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { ProductFormat } from '../../domain/entities/ProductFormat';

interface Props {
  formats: ProductFormat[];
  selected: string | null;
  onSelect: (formatId: string) => void;
}

export function SizeSelector({ formats, selected, onSelect }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {formats.map((format) => {
        const isSelected = format.id === selected;
        return (
          <TouchableOpacity
            key={format.id}
            style={[
              styles.button,
              {
                backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
              },
            ]}
            onPress={() => onSelect(format.id)}
            activeOpacity={0.7}
          >
            <Text
              variant="labelLarge"
              style={{ color: isSelected ? '#FFFFFF' : theme.colors.onSurface, fontWeight: '600' }}
            >
              {format.name}
            </Text>
            <Text
              variant="labelSmall"
              style={{ color: isSelected ? '#FFFFFF' : theme.colors.onSurfaceVariant }}
            >
              ({format.portions} porc.)
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
