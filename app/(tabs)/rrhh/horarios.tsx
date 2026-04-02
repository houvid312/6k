import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { ScheduleGrid } from '../../../src/components/rrhh/ScheduleGrid';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';

export default function HorariosScreen() {
  const theme = useTheme();
  const { workers, schedules, loading, loadWorkers, loadSchedules } = useWorkerStore();
  const { selectedStoreId } = useAppStore();

  useEffect(() => {
    loadWorkers();
    loadSchedules(selectedStoreId);
  }, [loadWorkers, loadSchedules, selectedStoreId]);

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
        <ScheduleGrid workers={activeWorkers} schedules={schedules} />
      )}

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
});
