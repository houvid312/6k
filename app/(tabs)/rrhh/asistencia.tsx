import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Text, Button, Card, Chip, Portal, Snackbar, useTheme, TextInput, Modal, RadioButton } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { useDI } from '../../../src/di/providers';
import { Attendance, Schedule, Worker } from '../../../src/domain/entities';
import { formatDate, todayColombia } from '../../../src/utils/dates';
import { formatCOP } from '../../../src/utils/currency';
import {
  calculateHoursBetween,
  getRrhhDayOfWeek,
  isValidTime,
  timeInputFromDateTime,
  toColombiaTimestamp,
} from '../../../src/utils/time';

interface AttendanceShift {
  key: string;
  id?: string;
  scheduleId?: string;
  workerId: string;
  workerName: string;
  workerRole: string;
  scheduledHours: number;
  hourlyRate: number;
  checkIn: string;
  checkOut: string;
  notes: string;
  isUnplanned: boolean;
  source: Attendance['source'];
  status: Attendance['status'];
}

export default function AsistenciaScreen() {
  const theme = useTheme();
  const { selectedStoreId } = useAppStore();
  const { workerRepo, scheduleRepo, attendanceRepo } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [unplannedVisible, setUnplannedVisible] = useState(false);
  const [unplannedWorkerId, setUnplannedWorkerId] = useState('');
  const [unplannedStart, setUnplannedStart] = useState('08:00');
  const [unplannedEnd, setUnplannedEnd] = useState('16:00');
  const [unplannedNotes, setUnplannedNotes] = useState('');

  const today = todayColombia();

  const buildShifts = useCallback((
    assignedWorkers: Worker[],
    storeSchedules: Schedule[],
    attendance: Attendance[],
  ): AttendanceShift[] => {
    const workerMap = new Map(assignedWorkers.map((worker) => [worker.id, worker]));
    const scheduleMap = new Map(storeSchedules.map((schedule) => [schedule.id, schedule]));
    const attendedScheduleIds = new Set<string>();

    const existingShifts = attendance
      .map((record): AttendanceShift | null => {
        const worker = workerMap.get(record.workerId);
        if (!worker) return null;
        const schedule = record.scheduleId ? scheduleMap.get(record.scheduleId) : undefined;
        if (record.scheduleId) attendedScheduleIds.add(record.scheduleId);
        return {
          key: record.id,
          id: record.id,
          scheduleId: record.scheduleId,
          workerId: record.workerId,
          workerName: worker.name,
          workerRole: worker.role,
          scheduledHours: record.scheduledHours,
          hourlyRate: record.hourlyRate,
          checkIn: timeInputFromDateTime(record.checkIn) || schedule?.startTime || '',
          checkOut: timeInputFromDateTime(record.checkOut) || schedule?.endTime || '',
          notes: record.notes ?? '',
          isUnplanned: record.isUnplanned,
          source: record.source,
          status: record.status,
        };
      })
      .filter((shift): shift is AttendanceShift => shift !== null);

    const day = getRrhhDayOfWeek(new Date(`${today}T12:00:00-05:00`));
    const missingScheduledShifts = storeSchedules
      .filter((schedule) => schedule.dayOfWeek === day && !attendedScheduleIds.has(schedule.id))
      .map((schedule): AttendanceShift | null => {
        const worker = workerMap.get(schedule.workerId);
        if (!worker || !worker.isActive) return null;
        return {
          key: `schedule-${schedule.id}`,
          scheduleId: schedule.id,
          workerId: worker.id,
          workerName: worker.name,
          workerRole: worker.role,
          scheduledHours: schedule.hours,
          hourlyRate: worker.hourlyRate,
          checkIn: schedule.startTime,
          checkOut: schedule.endTime,
          notes: schedule.notes ?? '',
          isUnplanned: false,
          source: 'MANUAL',
          status: 'DRAFT',
        };
      })
      .filter((shift): shift is AttendanceShift => shift !== null);

    return [...existingShifts, ...missingScheduledShifts].sort((a, b) => (
      a.workerName.localeCompare(b.workerName) || a.checkIn.localeCompare(b.checkIn)
    ));
  }, [today]);

  const loadData = useCallback(async () => {
    if (!selectedStoreId) {
      setWorkers([]);
      setShifts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [assignedWorkers, storeSchedules, attendance] = await Promise.all([
        workerRepo.getByStore(selectedStoreId),
        scheduleRepo.getByStore(selectedStoreId),
        attendanceRepo.getByDate(selectedStoreId, today),
      ]);
      setWorkers(assignedWorkers);
      setShifts(buildShifts(assignedWorkers, storeSchedules, attendance));
      if (!unplannedWorkerId && assignedWorkers[0]) {
        setUnplannedWorkerId(assignedWorkers[0].id);
      }
    } catch {
      showError('No se pudo cargar la asistencia');
    } finally {
      setLoading(false);
    }
  }, [attendanceRepo, buildShifts, scheduleRepo, selectedStoreId, showError, today, unplannedWorkerId, workerRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const recorded = shifts.filter((shift) => shift.id && shift.status !== 'DRAFT').length;
    const draft = shifts.filter((shift) => shift.status === 'DRAFT').length;
    const projectedHours = shifts.reduce((sum, shift) => sum + calculateHoursBetween(shift.checkIn, shift.checkOut), 0);
    return { recorded, draft, projectedHours: Math.round(projectedHours * 100) / 100 };
  }, [shifts]);

  const updateShift = useCallback((key: string, updates: Partial<AttendanceShift>) => {
    setShifts((current) => current.map((shift) => (
      shift.key === key ? { ...shift, ...updates } : shift
    )));
  }, []);

  const shiftToPayload = useCallback((shift: AttendanceShift): Omit<Attendance, 'id'> | null => {
    if (!isValidTime(shift.checkIn) || !isValidTime(shift.checkOut)) {
      throw new Error(`Hora invalida para ${shift.workerName}`);
    }
    const actualHours = calculateHoursBetween(shift.checkIn, shift.checkOut);
    if (actualHours <= 0) return null;

    return {
      date: today,
      workerId: shift.workerId,
      storeId: selectedStoreId,
      scheduleId: shift.scheduleId,
      scheduledHours: shift.scheduledHours,
      actualHours,
      hourlyRate: shift.hourlyRate,
      subtotal: Math.round(actualHours * shift.hourlyRate),
      checkIn: toColombiaTimestamp(today, shift.checkIn),
      checkOut: toColombiaTimestamp(today, shift.checkOut),
      notes: shift.notes.trim() || undefined,
      isUnplanned: shift.isUnplanned,
      source: shift.source,
      status: 'RECORDED',
    };
  }, [selectedStoreId, today]);

  const handleSubmit = useCallback(async () => {
    if (!selectedStoreId) return;
    setSubmitting(true);
    try {
      let saved = 0;
      for (const shift of shifts) {
        const payload = shiftToPayload(shift);
        if (!payload) continue;
        if (shift.id) {
          await attendanceRepo.update(shift.id, payload);
        } else {
          await attendanceRepo.create(payload);
        }
        saved++;
      }

      if (saved === 0) {
        showError('Ingresa al menos una entrada y salida valida');
        return;
      }

      showSuccess(`${saved} turno(s) guardado(s) - ${formatDate(today)}`);
      await loadData();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'No se pudo registrar la asistencia');
    } finally {
      setSubmitting(false);
    }
  }, [attendanceRepo, loadData, selectedStoreId, shiftToPayload, shifts, showError, showSuccess, today]);

  const handleCreateUnplanned = useCallback(async () => {
    if (!selectedStoreId) return;
    const worker = workers.find((item) => item.id === unplannedWorkerId);
    if (!worker) {
      showError('Selecciona un trabajador');
      return;
    }
    const actualHours = calculateHoursBetween(unplannedStart, unplannedEnd);
    if (actualHours <= 0) {
      showError('La salida debe ser posterior a la entrada');
      return;
    }

    try {
      await attendanceRepo.create({
        date: today,
        workerId: worker.id,
        storeId: selectedStoreId,
        scheduledHours: 0,
        actualHours,
        hourlyRate: worker.hourlyRate,
        subtotal: Math.round(actualHours * worker.hourlyRate),
        checkIn: toColombiaTimestamp(today, unplannedStart),
        checkOut: toColombiaTimestamp(today, unplannedEnd),
        notes: unplannedNotes.trim() || undefined,
        isUnplanned: true,
        source: 'MANUAL',
        status: 'RECORDED',
      });
      setUnplannedVisible(false);
      setUnplannedNotes('');
      showSuccess('Turno sin horario guardado');
      await loadData();
    } catch {
      showError('No se pudo guardar el turno sin horario');
    }
  }, [attendanceRepo, loadData, selectedStoreId, showError, showSuccess, today, unplannedEnd, unplannedNotes, unplannedStart, unplannedWorkerId, workers]);

  if (loading) {
    return <LoadingIndicator message="Cargando asistencia..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDate(today)}
        </Text>
      </View>

      <Card style={[styles.summaryCard, { backgroundColor: '#1E1E1E' }]} mode="contained">
        <Card.Content style={styles.summaryContent}>
          <View style={styles.summaryItem}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: '#4CAF50' }}>{summary.recorded}</Text>
            <Text variant="labelSmall" style={{ color: '#F5F0EB' }}>Guardados</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: '#E63946' }}>{summary.draft}</Text>
            <Text variant="labelSmall" style={{ color: '#F5F0EB' }}>Pendientes</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: '#F57C00' }}>{summary.projectedHours}</Text>
            <Text variant="labelSmall" style={{ color: '#F5F0EB' }}>Horas</Text>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.actionRow}>
        <Button mode="outlined" icon="plus" onPress={() => setUnplannedVisible(true)} style={styles.actionButton}>
          Turno sin horario
        </Button>
        <Button mode="contained" icon="content-save" onPress={handleSubmit} loading={submitting} disabled={submitting} style={styles.actionButton}>
          Guardar asistencia
        </Button>
      </View>

      {shifts.length === 0 ? (
        <EmptyState icon="clipboard-text-clock" title="Sin turnos" subtitle="No hay horarios ni asistencia para este centro hoy" />
      ) : (
        shifts.map((shift) => {
          const actualHours = calculateHoursBetween(shift.checkIn, shift.checkOut);
          const subtotal = Math.round(actualHours * shift.hourlyRate);
          return (
            <Card key={shift.key} style={styles.shiftCard} mode="elevated">
              <Card.Content>
                <View style={styles.shiftHeader}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '700' }}>{shift.workerName}</Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{shift.workerRole}</Text>
                  </View>
                  <View style={styles.chipRow}>
                    {shift.isUnplanned && <Chip compact>Sin horario</Chip>}
                    {shift.status === 'DRAFT' && <Chip compact>Borrador</Chip>}
                  </View>
                </View>

                <View style={styles.timeRow}>
                  <TextInput
                    label="Entrada"
                    value={shift.checkIn}
                    onChangeText={(value) => updateShift(shift.key, { checkIn: value })}
                    mode="outlined"
                    dense
                    style={styles.timeInput}
                  />
                  <TextInput
                    label="Salida"
                    value={shift.checkOut}
                    onChangeText={(value) => updateShift(shift.key, { checkOut: value })}
                    mode="outlined"
                    dense
                    style={styles.timeInput}
                  />
                </View>

                <TextInput
                  label="Notas"
                  value={shift.notes}
                  onChangeText={(value) => updateShift(shift.key, { notes: value })}
                  mode="outlined"
                  dense
                  style={{ marginBottom: 8 }}
                />

                <View style={styles.detailRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Programado {shift.scheduledHours}h · Real {actualHours}h
                  </Text>
                  <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.primary }}>
                    {formatCOP(subtotal)}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          );
        })
      )}

      <Portal>
        <Modal
          visible={unplannedVisible}
          onDismiss={() => setUnplannedVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 12 }}>
            Turno sin horario
          </Text>
          <ScrollView style={{ maxHeight: 180, marginBottom: 12 }}>
            <RadioButton.Group onValueChange={setUnplannedWorkerId} value={unplannedWorkerId}>
              {workers.filter((worker) => worker.isActive).map((worker) => (
                <RadioButton.Item
                  key={worker.id}
                  label={worker.name}
                  value={worker.id}
                  labelStyle={{ color: '#F5F0EB' }}
                />
              ))}
            </RadioButton.Group>
          </ScrollView>
          <View style={styles.timeRow}>
            <TextInput label="Entrada" value={unplannedStart} onChangeText={setUnplannedStart} mode="outlined" dense style={styles.timeInput} />
            <TextInput label="Salida" value={unplannedEnd} onChangeText={setUnplannedEnd} mode="outlined" dense style={styles.timeInput} />
          </View>
          <TextInput label="Notas" value={unplannedNotes} onChangeText={setUnplannedNotes} mode="outlined" dense style={{ marginBottom: 16 }} />
          <View style={styles.modalActions}>
            <Button onPress={() => setUnplannedVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleCreateUnplanned}>Guardar</Button>
          </View>
        </Modal>

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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
  },
  shiftCard: {
    borderRadius: 12,
    marginBottom: 10,
  },
  shiftHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  timeInput: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modal: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
