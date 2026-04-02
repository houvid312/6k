import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { Worker } from '../../domain/entities';

interface Props {
  worker: Worker;
  hours: number;
  onHoursChange: (hours: number) => void;
}

export function AttendanceRow({ worker, hours, onHoursChange }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
          {worker.name}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {worker.role}
        </Text>
      </View>
      <TextInput
        value={hours > 0 ? String(hours) : ''}
        onChangeText={(text) => {
          const v = parseFloat(text);
          onHoursChange(isNaN(v) ? 0 : Math.max(0, v));
        }}
        keyboardType="numeric"
        mode="outlined"
        placeholder="0"
        style={styles.input}
        dense
        right={<TextInput.Affix text="hrs" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  info: {
    flex: 1,
  },
  input: {
    width: 100,
    height: 36,
  },
});
