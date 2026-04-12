import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Modal, Portal, TextInput, useTheme } from 'react-native-paper';
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

export default function HorariosScreen() {
  const theme = useTheme();
  const { workers, schedules, loading, loadWorkers, loadSchedules } = useWorkerStore();
  const { selectedStoreId } = useAppStore();
  const { scheduleRepo } = useDI();

  // H2: Edit schedule modal state
  const [editVisible, setEditVisible] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [editDay, setEditDay] = useState(0);
  const [editStart, setEditStart] = useState('08:00');
  const [editEnd, setEditEnd] = useState('16:00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWorkers();
    loadSchedules(selectedStoreId);
  }, [loadWorkers, loadSchedules, selectedStoreId]);

  // H2: Handle cell tap to edit schedule
  const handleCellPress = useCallback((worker: Worker, dayOfWeek: number) => {
    const existing = schedules.find((s) => s.workerId === worker.id && s.dayOfWeek === dayOfWeek);
    setEditWorker(worker);
    setEditDay(dayOfWeek);
    setEditStart(existing?.startTime ?? '08:00');
    setEditEnd(existing?.endTime ?? '16:00');
    setEditVisible(true);
  }, [schedules]);

  const handleSaveSchedule = useCallback(async () => {
    if (!editWorker || !selectedStoreId) return;
    setSaving(true);
    try {
      const startH = parseInt(editStart.split(':')[0], 10) || 0;
      const endH = parseInt(editEnd.split(':')[0], 10) || 0;
      const hours = Math.max(0, endH - startH);
      await scheduleRepo.upsert({
        workerId: editWorker.id,
        storeId: selectedStoreId,
        dayOfWeek: editDay,
        startTime: editStart,
        endTime: editEnd,
        hours,
      });
      setEditVisible(false);
      loadSchedules(selectedStoreId);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [editWorker, editDay, editStart, editEnd, selectedStoreId, scheduleRepo, loadSchedules]);

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
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        Toca una celda para editar el horario
      </Text>

      {activeWorkers.length === 0 ? (
        <EmptyState icon="calendar" title="Sin horarios" subtitle="No hay trabajadores activos" />
      ) : (
        <ScheduleGrid workers={activeWorkers} schedules={schedules} onCellPress={handleCellPress} />
      )}

      {/* H2: Edit Schedule Modal */}
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
            {editWorker?.name} — {DAYS_OF_WEEK[editDay] ?? ''}
          </Text>
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
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button onPress={() => setEditVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleSaveSchedule} loading={saving} disabled={saving}>
              Guardar
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
});
