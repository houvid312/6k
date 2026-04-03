import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card, Chip, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { AttendanceRow } from '../../../src/components/rrhh/AttendanceRow';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { formatDate, toISODate } from '../../../src/utils/dates';

export default function AsistenciaScreen() {
  const theme = useTheme();
  const { workers, schedules, loading, loadWorkers, loadSchedules } = useWorkerStore();
  const { selectedStoreId } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [hoursMap, setHoursMap] = useState<Record<string, number>>({});
  const [absentMap, setAbsentMap] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const today = toISODate(new Date());
  const todayDayOfWeek = new Date().getDay();

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  useEffect(() => {
    if (selectedStoreId) {
      loadSchedules(selectedStoreId);
    }
  }, [selectedStoreId, loadSchedules]);

  const activeWorkers = workers.filter((w) => w.isActive);

  /** Map workerId -> scheduled hours for today's day of week */
  const scheduledHoursMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const schedule of schedules) {
      if (schedule.dayOfWeek === todayDayOfWeek) {
        map[schedule.workerId] = schedule.hours;
      }
    }
    return map;
  }, [schedules, todayDayOfWeek]);

  const handleHoursChange = useCallback((workerId: string, hours: number) => {
    setHoursMap((prev) => ({ ...prev, [workerId]: hours }));
  }, []);

  const handleToggleAbsent = useCallback((workerId: string) => {
    setAbsentMap((prev) => {
      const newAbsent = !prev[workerId];
      if (newAbsent) {
        setHoursMap((prevH) => ({ ...prevH, [workerId]: 0 }));
      }
      return { ...prev, [workerId]: newAbsent };
    });
  }, []);

  /** Summary calculations */
  const summary = useMemo(() => {
    let presentes = 0;
    let ausentes = 0;
    let conExtras = 0;

    for (const w of activeWorkers) {
      const isAbsent = absentMap[w.id] ?? false;
      const hours = hoursMap[w.id] ?? 0;
      const scheduled = scheduledHoursMap[w.id] ?? 8;

      if (isAbsent || hours === 0) {
        ausentes++;
      } else {
        presentes++;
        if (hours > scheduled) {
          conExtras++;
        }
      }
    }

    return { presentes, ausentes, conExtras };
  }, [activeWorkers, hoursMap, absentMap, scheduledHoursMap]);

  const handleSubmit = useCallback(async () => {
    const entries = activeWorkers
      .map((w) => ({
        workerId: w.id,
        workerName: w.name,
        hours: absentMap[w.id] ? 0 : hoursMap[w.id] ?? 0,
        scheduledHours: scheduledHoursMap[w.id] ?? 8,
      }))
      .filter((e) => e.hours > 0 || absentMap[e.workerId]);

    if (entries.length === 0) {
      showError('Ingresa las horas de al menos un trabajador');
      return;
    }

    setSubmitting(true);
    try {
      const presentes = entries.filter((e) => e.hours > 0).length;
      const ausentes = entries.filter((e) => e.hours === 0).length;
      showSuccess(`${presentes} presentes, ${ausentes} ausentes — ${formatDate(today)}`);
      setHoursMap({});
      setAbsentMap({});
    } catch {
      showError('No se pudo registrar la asistencia');
    } finally {
      setSubmitting(false);
    }
  }, [activeWorkers, hoursMap, absentMap, scheduledHoursMap, today, showSuccess, showError]);

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
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        Ingresa las horas trabajadas por cada empleado
      </Text>

      {/* Summary banner */}
      <Card style={[styles.summaryCard, { backgroundColor: '#1E1E1E' }]} mode="contained">
        <Card.Content style={styles.summaryContent}>
          <View style={styles.summaryItem}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: '#388E3C' }}>
              {summary.presentes}
            </Text>
            <Text variant="labelSmall" style={{ color: '#F5F0EB' }}>Presentes</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: '#D32F2F' }}>
              {summary.ausentes}
            </Text>
            <Text variant="labelSmall" style={{ color: '#F5F0EB' }}>Ausentes</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: '#E65100' }}>
              {summary.conExtras}
            </Text>
            <Text variant="labelSmall" style={{ color: '#F5F0EB' }}>Horas Extra</Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          {activeWorkers.map((worker) => (
            <AttendanceRow
              key={worker.id}
              worker={worker}
              hours={hoursMap[worker.id] ?? 0}
              scheduledHours={scheduledHoursMap[worker.id] ?? 8}
              isAbsent={absentMap[worker.id] ?? false}
              onHoursChange={(hours) => handleHoursChange(worker.id, hours)}
              onToggleAbsent={() => handleToggleAbsent(worker.id)}
            />
          ))}
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitBtn}
        icon="clipboard-check"
      >
        Registrar Asistencia
      </Button>

      <View style={{ height: 100 }} />

      <Portal>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={hideSnackbar}
          duration={3000}
          style={{ backgroundColor: snackbar.error ? '#B00020' : '#2E7D32', marginBottom: 80 }}
        >
          {snackbar.message}
        </Snackbar>
      </Portal>
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
  summaryCard: {
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(245, 240, 235, 0.15)',
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
