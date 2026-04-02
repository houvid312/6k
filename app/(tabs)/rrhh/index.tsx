import React, { useEffect } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Card, Text, Chip, Button, FAB, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { Worker } from '../../../src/domain/entities';
import { WorkerRole } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';

const ROLE_COLORS: Record<WorkerRole, string> = {
  [WorkerRole.ADMINISTRADOR]: '#7B1FA2',
  [WorkerRole.CAJERO]: '#1976D2',
  [WorkerRole.PREPARADOR]: '#388E3C',
  [WorkerRole.HORNERO]: '#F57C00',
  [WorkerRole.ESTIRADOR]: '#00897B',
};

export default function RRHHScreen() {
  const theme = useTheme();
  const { workers, loading, loadWorkers } = useWorkerStore();

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const renderWorker = ({ item }: { item: Worker }) => (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.workerRow}>
          <View style={styles.workerInfo}>
            <Text variant="titleSmall" style={{ fontWeight: '600' }}>
              {item.name}
            </Text>
            <View style={styles.chipRow}>
              <Chip
                compact
                textStyle={{ fontSize: 10, color: '#FFFFFF' }}
                style={{ backgroundColor: ROLE_COLORS[item.role] ?? '#757575' }}
              >
                {item.role}
              </Chip>
              {!item.isActive && (
                <Chip compact textStyle={{ fontSize: 10 }} style={{ backgroundColor: '#FFEBEE' }}>
                  Inactivo
                </Chip>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
              {formatCOP(item.hourlyRate)}/hr
            </Text>
            {item.phone && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {item.phone}
              </Text>
            )}
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Nav buttons */}
      <View style={styles.navRow}>
        <Button mode="outlined" compact icon="calendar-clock" onPress={() => router.push('/(tabs)/rrhh/horarios')}>
          Horarios
        </Button>
        <Button mode="outlined" compact icon="clipboard-check" onPress={() => router.push('/(tabs)/rrhh/asistencia')}>
          Asistencia
        </Button>
        <Button mode="outlined" compact icon="currency-usd" onPress={() => router.push('/(tabs)/rrhh/nomina')}>
          Nomina
        </Button>
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando trabajadores..." />
      ) : workers.length === 0 ? (
        <EmptyState icon="account-group" title="Sin trabajadores" subtitle="No hay trabajadores registrados" />
      ) : (
        <FlatList
          data={workers}
          renderItem={renderWorker}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <FAB
        icon="account-plus"
        onPress={() => {/* TODO: Add worker form */}}
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  list: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 12,
    marginBottom: 8,
  },
  workerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workerInfo: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    borderRadius: 28,
  },
});
