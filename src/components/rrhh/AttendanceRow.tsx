import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, TextInput, Chip, useTheme } from 'react-native-paper';
import { Worker } from '../../domain/entities';

interface Props {
  worker: Worker;
  hours: number;
  scheduledHours: number;
  isAbsent: boolean;
  onHoursChange: (hours: number) => void;
  onToggleAbsent: () => void;
}

export function AttendanceRow({
  worker,
  hours,
  scheduledHours,
  isAbsent,
  onHoursChange,
  onToggleAbsent,
}: Props) {
  const theme = useTheme();

  const getStatusIndicator = () => {
    if (isAbsent || hours === 0) {
      return (
        <Chip
          compact
          textStyle={{ fontSize: 10, color: '#FFFFFF' }}
          style={{ backgroundColor: '#D32F2F' }}
        >
          Ausente
        </Chip>
      );
    }
    if (hours > scheduledHours && scheduledHours > 0) {
      const extra = hours - scheduledHours;
      return (
        <Chip
          compact
          textStyle={{ fontSize: 10, color: '#E65100' }}
          style={{ backgroundColor: '#FFF3E0' }}
        >
          Extras: +{extra}h
        </Chip>
      );
    }
    if (hours < scheduledHours && hours > 0) {
      return (
        <Chip
          compact
          textStyle={{ fontSize: 10, color: '#F57F17' }}
          style={{ backgroundColor: '#FFFDE7' }}
        >
          Parcial
        </Chip>
      );
    }
    if (hours === scheduledHours && hours > 0) {
      return (
        <Chip
          compact
          textStyle={{ fontSize: 10, color: '#388E3C' }}
          style={{ backgroundColor: '#E8F5E9' }}
        >
          Completo
        </Chip>
      );
    }
    return null;
  };

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
          {worker.name}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {worker.role}
        </Text>
        <View style={styles.metaRow}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Programado: {scheduledHours}h
          </Text>
          {getStatusIndicator()}
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={onToggleAbsent} style={styles.absentToggle}>
          <Chip
            compact
            selected={isAbsent}
            showSelectedOverlay
            textStyle={{
              fontSize: 10,
              color: isAbsent ? '#FFFFFF' : '#D32F2F',
            }}
            style={{
              backgroundColor: isAbsent ? '#D32F2F' : 'transparent',
              borderWidth: 1,
              borderColor: '#D32F2F',
            }}
          >
            Ausente
          </Chip>
        </Pressable>

        <TextInput
          value={isAbsent ? '0' : hours > 0 ? String(hours) : ''}
          onChangeText={(text) => {
            const v = parseFloat(text);
            onHoursChange(isNaN(v) ? 0 : Math.max(0, v));
          }}
          keyboardType="numeric"
          mode="outlined"
          placeholder="0"
          style={[styles.input, isAbsent && styles.inputDisabled]}
          dense
          disabled={isAbsent}
          right={<TextInput.Affix text="hrs" />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 240, 235, 0.1)',
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  controls: {
    alignItems: 'flex-end',
    gap: 6,
  },
  absentToggle: {
    marginBottom: 2,
  },
  input: {
    width: 100,
    height: 36,
  },
  inputDisabled: {
    opacity: 0.4,
  },
});
