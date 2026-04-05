import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, IconButton, useTheme } from 'react-native-paper';

interface Props {
  label: string;
  bags: number;
  looseGrams: number;
  gramsPerBag: number;
  unit?: 'GRAMOS' | 'MILILITROS' | 'UNIDAD';
  onBagsChange: (bags: number) => void;
  onGramsChange: (grams: number) => void;
}

export function BagCounter({ label, bags, looseGrams, gramsPerBag, unit, onBagsChange, onGramsChange }: Props) {
  const theme = useTheme();
  const isUnit = unit === 'UNIDAD';
  const total = bags * gramsPerBag + looseGrams;

  return (
    <View style={styles.container}>
      <Text variant="bodyMedium" style={[styles.label, { fontWeight: '600' }]}>
        {label}
      </Text>
      <View style={styles.row}>
        <View style={styles.bagControl}>
          <IconButton
            icon="minus"
            size={20}
            mode="contained-tonal"
            onPress={() => onBagsChange(Math.max(0, bags - 1))}
            style={styles.iconBtn}
          />
          <TextInput
            value={String(bags)}
            onChangeText={(text) => {
              const v = parseInt(text, 10);
              onBagsChange(isNaN(v) ? 0 : Math.max(0, v));
            }}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
          <IconButton
            icon="plus"
            size={20}
            mode="contained-tonal"
            onPress={() => onBagsChange(bags + 1)}
            style={styles.iconBtn}
          />
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {isUnit ? 'unidades' : 'bolsas'}
          </Text>
        </View>
        {!isUnit && (
          <View style={styles.gramsControl}>
            <TextInput
              value={String(looseGrams)}
              onChangeText={(text) => {
                const v = parseFloat(text);
                onGramsChange(isNaN(v) ? 0 : Math.max(0, v));
              }}
              keyboardType="decimal-pad"
              mode="outlined"
              style={styles.gramsInput}
              right={<TextInput.Affix text="g" />}
            />
          </View>
        )}
      </View>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
        Total: {isUnit ? `${bags} und.` : `${Math.round(total)}g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  label: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bagControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    margin: 0,
  },
  input: {
    width: 70,
    textAlign: 'center',
    height: 48,
    fontSize: 18,
  },
  gramsControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gramsInput: {
    width: 100,
    height: 48,
    fontSize: 18,
  },
});
