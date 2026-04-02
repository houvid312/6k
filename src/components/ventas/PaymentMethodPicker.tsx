import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PaymentMethod } from '../../domain/enums';

const PAYMENT_OPTIONS: { method: PaymentMethod; label: string; icon: string }[] = [
  { method: PaymentMethod.EFECTIVO, label: 'Efectivo', icon: 'cash' },
  { method: PaymentMethod.TRANSFERENCIA, label: 'Transfer.', icon: 'bank-transfer' },
  { method: PaymentMethod.MIXTO, label: 'Mixto', icon: 'swap-horizontal' },
];

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}

export function PaymentMethodPicker({ value, onChange }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {PAYMENT_OPTIONS.map(({ method, label, icon }) => {
        const isSelected = method === value;
        return (
          <TouchableOpacity
            key={method}
            style={[
              styles.option,
              {
                backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceVariant,
                borderColor: isSelected ? theme.colors.primary : 'transparent',
              },
            ]}
            onPress={() => onChange(method)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
              size={18}
              color={isSelected ? '#FFFFFF' : theme.colors.onSurfaceVariant}
            />
            <Text
              variant="labelMedium"
              style={{
                color: isSelected ? '#FFFFFF' : theme.colors.onSurface,
                fontWeight: isSelected ? '700' : '500',
              }}
            >
              {label}
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
    gap: 8,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
});
