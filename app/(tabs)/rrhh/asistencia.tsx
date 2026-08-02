import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ScrollView, View, StyleSheet, Alert, Platform } from 'react-native';
import { Text, Button, Card, Chip, Portal, Snackbar, useTheme, TextInput, Modal, RadioButton, IconButton } from 'react-native-paper';
import { useIsFocused } from '@react-navigation/native';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useSnackbar } from '../../../src/hooks';
import { useDI } from '../../../src/di/providers';
import { Attendance, Schedule, Worker } from '../../../src/domain/entities';
import { UserRole } from '../../../src/domain/enums';
import { formatDate, todayColombia, toISODate } from '../../../src/utils/dates';
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

interface WorkerShiftDetail {
  id: string;
  date: string;
  hours: number;
  subtotal: number;
}

interface WorkerHoursSummary {
  workerId: string;
  workerName: string;
  workerRole: string;
  totalHours: number;
  totalSubtotal: number;
  shiftCount: number;
  shiftsDetail: WorkerShiftDetail[];
}

export default function AsistenciaScreen() {
  const theme = useTheme();
  const isFocused = useIsFocused();
  const { selectedStoreId, userRole } = useAppStore();
  const { workers, loadWorkers: loadStoreWorkers } = useWorkerStore();
  const { workerRepo, scheduleRepo, attendanceRepo } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const canManage = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL;

  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [unplannedVisible, setUnplannedVisible] = useState(false);
  const [unplannedWorkerId, setUnplannedWorkerId] = useState('');
  const [unplannedStart, setUnplannedStart] = useState('08:00');
  const [unplannedEnd, setUnplannedEnd] = useState('16:00');
  const [unplannedNotes, setUnplannedNotes] = useState('');

  // Selected Date state for confirming attendance on any day (today, past, etc.)
  const [selectedDate, setSelectedDate] = useState(todayColombia());

  // Total Hours Date Range Report state
  const [reportVisible, setReportVisible] = useState(false);
  const [reportPreset, setReportPreset] = useState<'HOY' | 'SEMANA' | 'QUINCENA' | 'MES' | 'CUSTOM'>('SEMANA');
  const [reportFrom, setReportFrom] = useState(todayColombia());
  const [reportTo, setReportTo] = useState(todayColombia());
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSummaries, setReportSummaries] = useState<WorkerHoursSummary[]>([]);

  const changeDateByDays = useCallback((days: number) => {
    const d = new Date(`${selectedDate}T12:00:00-05:00`);
    d.setDate(d.getDate() + days);
    setSelectedDate(toISODate(d));
  }, [selectedDate]);

  const buildShifts = useCallback((
    assignedWorkers: Worker[],
    storeSchedules: Schedule[],
    attendance: Attendance[],
    targetDate: string,
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

    const day = getRrhhDayOfWeek(new Date(`${targetDate}T12:00:00-05:00`));
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
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedStoreId) {
      setShifts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await loadStoreWorkers(selectedStoreId);
      const [assignedWorkers, storeSchedules, attendance] = await Promise.all([
        workerRepo.getByStore(selectedStoreId),
        scheduleRepo.getByStore(selectedStoreId),
        attendanceRepo.getByDate(selectedStoreId, selectedDate),
      ]);
      setShifts(buildShifts(assignedWorkers, storeSchedules, attendance, selectedDate));
      if (!unplannedWorkerId && assignedWorkers[0]) {
        setUnplannedWorkerId(assignedWorkers[0].id);
      }
    } catch {
      showError('No se pudo cargar la asistencia');
    } finally {
      setLoading(false);
    }
  }, [attendanceRepo, buildShifts, loadStoreWorkers, scheduleRepo, selectedDate, selectedStoreId, showError, unplannedWorkerId, workerRepo]);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, loadData, selectedDate]);

  const loadRangeReport = useCallback(async (fromStr: string, toStr: string) => {
    if (!selectedStoreId) return;
    setReportLoading(true);
    try {
      const [records, allWorkers] = await Promise.all([
        attendanceRepo.getByStoreDateRange(selectedStoreId, fromStr, toStr),
        workerRepo.getAll(),
      ]);
      const workerMap = new Map<string, Worker>(allWorkers.map((w: Worker) => [w.id, w]));

      const summaryMap = new Map<string, WorkerHoursSummary>();

      for (const rec of records) {
        // Only count CONFIRMED / RECORDED attendance records
        if (rec.status !== 'RECORDED' || !rec.actualHours || rec.actualHours <= 0) continue;
        const worker = workerMap.get(rec.workerId);
        const name = worker ? worker.name : 'Trabajador no encontrado';
        const role = worker ? worker.role : '';

        const existing = summaryMap.get(rec.workerId) ?? {
          workerId: rec.workerId,
          workerName: name,
          workerRole: role,
          totalHours: 0,
          totalSubtotal: 0,
          shiftCount: 0,
          shiftsDetail: [],
        };

        existing.totalHours += rec.actualHours;
        existing.totalSubtotal += rec.subtotal;
        existing.shiftCount += 1;
        existing.shiftsDetail.push({
          id: rec.id,
          date: rec.date,
          hours: rec.actualHours,
          subtotal: rec.subtotal,
        });

        summaryMap.set(rec.workerId, existing);
      }

      const list = Array.from(summaryMap.values())
        .map((s) => ({ ...s, totalHours: Math.round(s.totalHours * 100) / 100 }))
        .sort((a, b) => a.workerName.localeCompare(b.workerName));

      setReportSummaries(list);
    } catch (error) {
      console.error('Error loading range report:', error);
      showError('Error al cargar reporte de horas');
    } finally {
      setReportLoading(false);
    }
  }, [attendanceRepo, selectedStoreId, showError, workerRepo]);

  const handleDeletePastAttendanceRecord = useCallback((attendanceId: string, workerName: string, dateStr: string) => {
    const confirmMsg = `¿Seguro que deseas eliminar el registro de asistencia del ${formatDate(dateStr)} de ${workerName}?`;
    const doDelete = async () => {
      try {
        await attendanceRepo.delete(attendanceId);
        showSuccess(`Asistencia del ${formatDate(dateStr)} de ${workerName} eliminada.`);
        await loadData();
        await loadRangeReport(reportFrom, reportTo);
      } catch (error) {
        showError('No se pudo eliminar el registro de asistencia');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doDelete();
    } else {
      Alert.alert('Eliminar Asistencia', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [attendanceRepo, loadData, loadRangeReport, reportFrom, reportTo, showError, showSuccess]);

  const handleDeleteShift = useCallback((shift: AttendanceShift) => {
    if (!shift.id) return;
    const confirmMsg = `¿Seguro que deseas eliminar la asistencia de ${shift.workerName}?`;
    const doDelete = async () => {
      try {
        await attendanceRepo.delete(shift.id!);
        showSuccess(`Asistencia de ${shift.workerName} eliminada.`);
        await loadData();
        if (reportVisible) {
          await loadRangeReport(reportFrom, reportTo);
        }
      } catch (error) {
        showError('No se pudo eliminar el registro de asistencia');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doDelete();
    } else {
      Alert.alert('Eliminar Asistencia', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [attendanceRepo, loadData, loadRangeReport, reportFrom, reportTo, reportVisible, showError, showSuccess]);

  const handleApplyPreset = useCallback((preset: 'HOY' | 'SEMANA' | 'QUINCENA' | 'MES') => {
    setReportPreset(preset);
    const todayDate = new Date(`${todayColombia()}T12:00:00-05:00`);
    let from = todayColombia();
    let to = todayColombia();

    if (preset === 'SEMANA') {
      const jsDay = todayDate.getDay();
      const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
      const start = new Date(todayDate);
      start.setDate(todayDate.getDate() + mondayOffset);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      from = toISODate(start);
      to = toISODate(end);
    } else if (preset === 'QUINCENA') {
      const day = todayDate.getDate();
      const start = new Date(todayDate.getFullYear(), todayDate.getMonth(), day <= 15 ? 1 : 16);
      const end = new Date(todayDate.getFullYear(), todayDate.getMonth() + (day <= 15 ? 0 : 1), day <= 15 ? 15 : 0);
      from = toISODate(start);
      to = toISODate(end);
    } else if (preset === 'MES') {
      const start = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
      const end = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
      from = toISODate(start);
      to = toISODate(end);
    }

    setReportFrom(from);
    setReportTo(to);
    loadRangeReport(from, to);
  }, [loadRangeReport]);

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
      date: selectedDate,
      workerId: shift.workerId,
      storeId: selectedStoreId,
      scheduleId: shift.scheduleId,
      scheduledHours: shift.scheduledHours,
      actualHours,
      hourlyRate: shift.hourlyRate,
      subtotal: Math.round(actualHours * shift.hourlyRate),
      checkIn: toColombiaTimestamp(selectedDate, shift.checkIn),
      checkOut: toColombiaTimestamp(selectedDate, shift.checkOut),
      notes: shift.notes.trim() || undefined,
      isUnplanned: shift.isUnplanned,
      source: shift.source,
      status: 'RECORDED',
    };
  }, [selectedDate, selectedStoreId]);

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

      showSuccess(`${saved} turno(s) guardado(s) - ${formatDate(selectedDate)}`);
      await loadData();
      if (reportVisible) {
        await loadRangeReport(reportFrom, reportTo);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'No se pudo registrar la asistencia');
    } finally {
      setSubmitting(false);
    }
  }, [attendanceRepo, loadData, loadRangeReport, reportFrom, reportTo, reportVisible, selectedDate, selectedStoreId, shiftToPayload, shifts, showError, showSuccess]);

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
        date: selectedDate,
        workerId: worker.id,
        storeId: selectedStoreId,
        scheduledHours: 0,
        actualHours,
        hourlyRate: worker.hourlyRate,
        subtotal: Math.round(actualHours * worker.hourlyRate),
        checkIn: toColombiaTimestamp(selectedDate, unplannedStart),
        checkOut: toColombiaTimestamp(selectedDate, unplannedEnd),
        notes: unplannedNotes.trim() || undefined,
        isUnplanned: true,
        source: 'MANUAL',
        status: 'RECORDED',
      });
      setUnplannedVisible(false);
      setUnplannedNotes('');
      showSuccess('Turno sin horario guardado');
      await loadData();
      if (reportVisible) {
        await loadRangeReport(reportFrom, reportTo);
      }
    } catch {
      showError('No se pudo guardar el turno sin horario');
    }
  }, [attendanceRepo, loadData, loadRangeReport, reportFrom, reportTo, reportVisible, selectedDate, selectedStoreId, showError, showSuccess, unplannedEnd, unplannedNotes, unplannedStart, unplannedWorkerId, workers]);

  if (loading) {
    return <LoadingIndicator message="Cargando asistencia..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        <View style={styles.dateSelector}>
          <IconButton icon="chevron-left" size={22} iconColor="#E63946" onPress={() => changeDateByDays(-1)} />
          <View style={{ alignItems: 'center' }}>
            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#F5F0EB' }}>
              {formatDate(selectedDate)}
            </Text>
            {selectedDate === todayColombia() ? (
              <Chip compact style={{ backgroundColor: '#E63946', height: 20 }} textStyle={{ color: '#FFF', fontSize: 10, lineHeight: 12 }}>
                Hoy
              </Chip>
            ) : (
              <Button compact mode="text" labelStyle={{ fontSize: 10, color: '#E63946', marginVertical: 0 }} onPress={() => setSelectedDate(todayColombia())}>
                Ir a Hoy
              </Button>
            )}
          </View>
          <IconButton icon="chevron-right" size={22} iconColor="#E63946" onPress={() => changeDateByDays(1)} />
        </View>
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
        <Button
          mode="outlined"
          icon="clock-check-outline"
          onPress={() => {
            handleApplyPreset('SEMANA');
            setReportVisible(true);
          }}
          style={styles.actionButton}
        >
          Total Horas
        </Button>
        <Button mode="outlined" icon="plus" onPress={() => setUnplannedVisible(true)} style={styles.actionButton}>
          Sin horario
        </Button>
        <Button mode="contained" icon="content-save" onPress={handleSubmit} loading={submitting} disabled={submitting} style={styles.actionButton}>
          Guardar
        </Button>
      </View>

      {shifts.length === 0 ? (
        <EmptyState icon="clipboard-text-clock" title="Sin turnos" subtitle={`No hay horarios ni asistencia para ${formatDate(selectedDate)}`} />
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
                    {shift.status === 'DRAFT' ? (
                      <Chip compact>Borrador</Chip>
                    ) : (
                      <Chip compact style={{ backgroundColor: '#2E7D32' }} textStyle={{ color: '#FFF' }}>
                        Confirmado
                      </Chip>
                    )}
                    {canManage && shift.id && (
                      <IconButton
                        icon="delete-outline"
                        size={18}
                        iconColor="#D32F2F"
                        onPress={() => handleDeleteShift(shift)}
                      />
                    )}
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
        {/* Modal: Turno Sin Horario */}
        <Modal
          visible={unplannedVisible}
          onDismiss={() => setUnplannedVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 12 }}>
            Turno sin horario ({formatDate(selectedDate)})
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

        {/* Modal: Total Horas por Período */}
        <Modal
          visible={reportVisible}
          onDismiss={() => setReportVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 20, maxHeight: '85%' }]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold', color: '#F5F0EB' }}>
                Total Horas por Período
              </Text>
              <IconButton icon="close" size={20} iconColor="#F5F0EB" onPress={() => setReportVisible(false)} />
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
              Acumulado de horas trabajadas en asistencias confirmadas.
            </Text>

            {/* Presets row */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
              {(['HOY', 'SEMANA', 'QUINCENA', 'MES'] as const).map((p) => {
                const isSelected = reportPreset === p;
                return (
                  <Button
                    key={p}
                    mode={isSelected ? 'contained' : 'outlined'}
                    compact
                    onPress={() => handleApplyPreset(p)}
                    style={{ flex: 1, borderRadius: 8, borderColor: isSelected ? '#E63946' : 'rgba(255,255,255,0.2)' }}
                    buttonColor={isSelected ? '#E63946' : undefined}
                    textColor={isSelected ? '#FFF' : '#F5F0EB'}
                    labelStyle={{ fontSize: 11, marginHorizontal: 2 }}
                  >
                    {p === 'HOY' ? 'Hoy' : p === 'SEMANA' ? 'Semana' : p === 'QUINCENA' ? 'Quincena' : 'Mes'}
                  </Button>
                );
              })}
            </View>

            {/* Range inputs */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                label="Desde (YYYY-MM-DD)"
                value={reportFrom}
                onChangeText={setReportFrom}
                mode="outlined"
                dense
                style={{ flex: 1, backgroundColor: '#111111' }}
              />
              <TextInput
                label="Hasta (YYYY-MM-DD)"
                value={reportTo}
                onChangeText={setReportTo}
                mode="outlined"
                dense
                style={{ flex: 1, backgroundColor: '#111111' }}
              />
            </View>
            <Button
              mode="contained"
              icon="magnify"
              onPress={() => { setReportPreset('CUSTOM'); loadRangeReport(reportFrom, reportTo); }}
              style={{ marginBottom: 16, borderRadius: 8, backgroundColor: theme.colors.primary }}
            >
              Consultar Rango
            </Button>

            {reportLoading ? (
              <LoadingIndicator message="Calculando horas..." />
            ) : reportSummaries.length === 0 ? (
              <EmptyState icon="clock-alert-outline" title="Sin asistencias confirmadas" subtitle="No hay registros confirmados en este rango de fechas" />
            ) : (
              <Card style={{ backgroundColor: '#111111', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                  <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>TRABAJADOR</Text>
                  <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>HORAS / TOTAL</Text>
                </View>

                {reportSummaries.map((s) => (
                  <View key={s.workerId} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#F5F0EB' }}>{s.workerName}</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{s.workerRole}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ backgroundColor: '#4CAF50', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 2 }}>
                          <Text variant="labelSmall" style={{ fontWeight: 'bold', color: '#FFF' }}>{s.totalHours} hrs</Text>
                        </View>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{s.shiftCount} turno(s) · {formatCOP(s.totalSubtotal)}</Text>
                      </View>
                    </View>

                    {/* Shift breakdown per date */}
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.04)', gap: 4 }}>
                      {s.shiftsDetail.map((detail) => (
                        <View key={detail.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                          <Text variant="labelSmall" style={{ color: '#F5F0EB', fontWeight: '500' }}>
                            📅 {formatDate(detail.date)} ({detail.hours}h · {formatCOP(detail.subtotal)})
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Button
                              compact
                              mode="text"
                              labelStyle={{ fontSize: 10, color: '#E63946', marginHorizontal: 2 }}
                              onPress={() => {
                                setSelectedDate(detail.date);
                                setReportVisible(false);
                              }}
                            >
                              Ir a fecha
                            </Button>
                            {canManage && (
                              <IconButton
                                icon="delete-outline"
                                size={16}
                                iconColor="#D32F2F"
                                style={{ margin: 0 }}
                                onPress={() => handleDeletePastAttendanceRecord(detail.id, s.workerName, detail.date)}
                              />
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                {/* Overall Totals */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 8, borderTopWidth: 2, borderColor: '#E63946' }}>
                  <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#F5F0EB' }}>Total Período:</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#E63946' }}>
                      {Math.round(reportSummaries.reduce((sum, item) => sum + item.totalHours, 0) * 100) / 100} hrs
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {formatCOP(reportSummaries.reduce((sum, item) => sum + item.totalSubtotal, 0))}
                    </Text>
                  </View>
                </View>
              </Card>
            )}
          </ScrollView>
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
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
