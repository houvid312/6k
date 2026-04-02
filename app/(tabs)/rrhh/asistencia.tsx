import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Card, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { AttendanceRow } from '../../../src/components/rrhh/AttendanceRow';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { formatDate, toISODate } from '../../../src/utils/dates';

export default function AsistenciaScreen() {
  const theme = useTheme();
  const { workers, loading, loadWorkers } = useWorkerStore();
  const { selectedStoreId } = useAppStore();

  const [hoursMap, setHoursMap] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const today = toISODate(new Date());

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const activeWorkers = workers.filter((w) => w.isActive);

  const handleHoursChange = useCallback((workerId: string, hours: number) => {
    setHoursMap((prev) => ({ ...prev, [workerId]: hours }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const entries = activeWorkers
      .filter((w) => (hoursMap[w.id] ?? 0) > 0)
      .map((w) => ({
        workerId: w.id,
        workerName: w.name,
        hours: hoursMap[w.id] ?? 0,
      }));

    if (entries.length === 0) {
      Alert.alert('Error', 'Ingresa las horas de al menos un trabajador');
      return;
    }

    setSubmitting(true);
    try {
      // In a real app this would call attendanceService.registerAttendance()
      Alert.alert(
        'Asistencia registrada',
        `${entries.length} trabajadores para ${formatDate(today)}`,
      );
      setHoursMap({});
    } catch {
      Alert.alert('Error', 'No se pudo registrar la asistencia');
    } finally {
      setSubmitting(false);
    }
  }, [activeWorkers, hoursMap, today]);

  if (loading) {
    return <LoadingIndicator message="Cargando trabajadores..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDate(new Date())}
        </Text>
      </View>

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Registro de Asistencia
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
        Ingresa las horas trabajadas por cada empleado
      </Text>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          {activeWorkers.map((worker) => (
            <AttendanceRow
              key={worker.id}
              worker={worker}
              hours={hoursMap[worker.id] ?? 0}
              onHoursChange={(hours) => handleHoursChange(worker.id, hours)}
            />
          ))}
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitBtn}
        icon="clipboard-check"
      >
        Registrar Asistencia
      </Button>

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  card: {
    borderRadius: 12,
  },
  submitBtn: {
    marginTop: 24,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
