import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RadioButton, Text } from 'react-native-paper';
import { PaymentMethod } from '../../domain/enums';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.EFECTIVO]: 'Efectivo',
  [PaymentMethod.TRANSFERENCIA]: 'Transferencia',
  [PaymentMethod.MIXTO]: 'Mixto',
};

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  [PaymentMethod.EFECTIVO]: 'cash',
  [PaymentMethod.TRANSFERENCIA]: 'bank-transfer',
  [PaymentMethod.MIXTO]: 'swap-horizontal',
};

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}

export function PaymentMethodPicker({ value, onChange }: Props) {
  return (
    <RadioButton.Group
      onValueChange={(v) => onChange(v as PaymentMethod)}
      value={value}
    >
      <View style={styles.container}>
        {Object.values(PaymentMethod).map((method) => (
          <View key={method} style={styles.option}>
            <RadioButton value={method} />
            <Text variant="bodyMedium">{PAYMENT_LABELS[method]}</Text>
          </View>
        ))}
      </View>
    </RadioButton.Group>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
