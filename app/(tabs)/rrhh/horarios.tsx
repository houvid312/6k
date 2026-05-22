import React, { useEffect, useState, useCallback } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { Text, Button, Modal, Portal, TextInput, useTheme, IconButton, Divider } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { ScheduleGrid } from '../../../src/components/rrhh/ScheduleGrid';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useDI } from '../../../src/di/providers';
import { Schedule, Worker } from '../../../src/domain/entities';
import { DAYS_OF_WEEK } from '../../../src/utils/constants';
import { calculateHoursBetween, isValidTime } from '../../../src/utils/time';

export default function HorariosScreen() {
  const theme = useTheme();
  const { workers, schedules, loading, loadWorkers, loadSchedules } = useWorkerStore();
  const { selectedStoreId } = useAppStore();
  const { scheduleRepo } = useDI();

  const [editVisible, setEditVisible] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [editDay, setEditDay] = useState(0);
  const [editScheduleId, setEditScheduleId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('08:00');
  const [editEnd, setEditEnd] = useState('16:00');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedStoreId) return;
    loadWorkers(selectedStoreId);
    loadSchedules(selectedStoreId);
  }, [loadWorkers, loadSchedules, selectedStoreId]);

  const handleCellPress = useCallback((worker: Worker, dayOfWeek: number) => {
    setEditWorker(worker);
    setEditDay(dayOfWeek);
    setEditScheduleId(null);
    setEditStart('08:00');
    setEditEnd('16:00');
    setEditNotes('');
    setEditVisible(true);
  }, []);

  const dayBlocks = schedules
    .filter((schedule) => schedule.workerId === editWorker?.id && schedule.dayOfWeek === editDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const handleEditBlock = useCallback((schedule: Schedule) => {
    setEditScheduleId(schedule.id);
    setEditStart(schedule.startTime);
    setEditEnd(schedule.endTime);
    setEditNotes(schedule.notes ?? '');
  }, []);

  const handleNewBlock = useCallback(() => {
    setEditScheduleId(null);
    setEditStart('08:00');
    setEditEnd('16:00');
    setEditNotes('');
  }, []);

  const handleSaveSchedule = useCallback(async () => {
    if (!editWorker || !selectedStoreId) return;
    if (!isValidTime(editStart) || !isValidTime(editEnd)) {
      Alert.alert('Error', 'Usa horas validas en formato HH:MM.');
      return;
    }
    const hours = calculateHoursBetween(editStart, editEnd);
    if (hours <= 0) {
      Alert.alert('Error', 'La hora de salida debe ser posterior a la entrada.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        workerId: editWorker.id,
        storeId: selectedStoreId,
        dayOfWeek: editDay,
        startTime: editStart,
        endTime: editEnd,
        hours,
        notes: editNotes.trim() || undefined,
      };
      if (editScheduleId) {
        await scheduleRepo.update(editScheduleId, payload);
      } else {
        await scheduleRepo.create(payload);
      }
      handleNewBlock();
      await loadSchedules(selectedStoreId);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el bloque de turno.');
    } finally {
      setSaving(false);
    }
  }, [editWorker, selectedStoreId, editStart, editEnd, editDay, editNotes, editScheduleId, scheduleRepo, handleNewBlock, loadSchedules]);

  const handleDeleteBlock = useCallback((schedule: Schedule) => {
    Alert.alert('Eliminar bloque', `${schedule.startTime} - ${schedule.endTime}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await scheduleRepo.delete(schedule.id);
            if (editScheduleId === schedule.id) handleNewBlock();
            if (selectedStoreId) await loadSchedules(selectedStoreId);
          } catch {
            Alert.alert('Error', 'No se pudo eliminar el bloque.');
          }
        },
      },
    ]);
  }, [editScheduleId, handleNewBlock, loadSchedules, scheduleRepo, selectedStoreId]);

  if (loading) {
    return <LoadingIndicator message="Cargando horarios..." />;
  }

  const activeWorkers = workers.filter((w) => w.isActive);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Horarios Semanales
      </Text>

      {activeWorkers.length === 0 ? (
        <EmptyState icon="calendar" title="Sin horarios" subtitle="No hay trabajadores activos" />
      ) : (
        <ScheduleGrid workers={activeWorkers} schedules={schedules} onCellPress={handleCellPress} />
      )}

      <Portal>
        <Modal
          visible={editVisible}
          onDismiss={() => setEditVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Editar Horario
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            {editWorker?.name} - {DAYS_OF_WEEK[editDay] ?? ''}
          </Text>

          {dayBlocks.length > 0 && (
            <View style={styles.blockList}>
              {dayBlocks.map((schedule) => (
                <View key={schedule.id}>
                  <View style={styles.blockRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                        {schedule.startTime} - {schedule.endTime}
                      </Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {schedule.hours}h{schedule.notes ? ` · ${schedule.notes}` : ''}
                      </Text>
                    </View>
                    <IconButton icon="pencil" size={18} onPress={() => handleEditBlock(schedule)} />
                    <IconButton icon="delete" size={18} iconColor={theme.colors.error} onPress={() => handleDeleteBlock(schedule)} />
                  </View>
                  <Divider />
                </View>
              ))}
            </View>
          )}

          <Button mode="outlined" icon="plus" onPress={handleNewBlock} style={{ marginBottom: 12 }}>
            Nuevo bloque
          </Button>

          <TextInput
            label="Hora inicio (HH:MM)"
            value={editStart}
            onChangeText={setEditStart}
            mode="outlined"
            dense
            style={{ marginBottom: 12 }}
          />
          <TextInput
            label="Hora fin (HH:MM)"
            value={editEnd}
            onChangeText={setEditEnd}
            mode="outlined"
            dense
            style={{ marginBottom: 16 }}
          />
          <TextInput
            label="Notas"
            value={editNotes}
            onChangeText={setEditNotes}
            mode="outlined"
            dense
            style={{ marginBottom: 16 }}
          />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            Horas calculadas: {calculateHoursBetween(editStart, editEnd)}h
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button onPress={() => setEditVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleSaveSchedule} loading={saving} disabled={saving}>
              {editScheduleId ? 'Actualizar' : 'Guardar'}
            </Button>
          </View>
        </Modal>
      </Portal>

      <View style={{ height: 80 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  modal: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  blockList: {
    borderWidth: 1,
    borderColor: 'rgba(245, 240, 235, 0.12)',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  blockRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
});
