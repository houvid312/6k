import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Card, Text, Chip, Button, FAB, IconButton, useTheme, Modal, Portal, TextInput, RadioButton, Switch } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Worker } from '../../../src/domain/entities';
import { WorkerRole } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { container } from '../../../src/di/container';

const ROLE_COLORS: Record<WorkerRole, string> = {
  [WorkerRole.ADMINISTRADOR]: '#7B1FA2',
  [WorkerRole.CAJERO]: '#1976D2',
  [WorkerRole.PREPARADOR]: '#388E3C',
  [WorkerRole.HORNERO]: '#F57C00',
  [WorkerRole.ESTIRADOR]: '#00897B',
  [WorkerRole.COORDINADOR]: '#C62828',
};

const ROLE_LABELS: Record<WorkerRole, string> = {
  [WorkerRole.ADMINISTRADOR]: 'Administrador',
  [WorkerRole.CAJERO]: 'Cajero',
  [WorkerRole.PREPARADOR]: 'Preparador',
  [WorkerRole.HORNERO]: 'Hornero',
  [WorkerRole.ESTIRADOR]: 'Estirador',
  [WorkerRole.COORDINADOR]: 'Coordinador',
};

export default function RRHHScreen() {
  const theme = useTheme();
  const { workers, loading, loadWorkers } = useWorkerStore();
  const { stores, selectedStoreId, loadStores } = useAppStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [hourlyRate, setHourlyRate] = useState('8000');
  const [role, setRole] = useState<WorkerRole>(WorkerRole.PREPARADOR);
  const [isActive, setIsActive] = useState(true);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  useEffect(() => {
    loadWorkers();
    loadStores();
  }, [loadStores, loadWorkers]);

  const resetForm = useCallback((worker?: Worker) => {
    setEditingWorker(worker ?? null);
    setName(worker?.name ?? '');
    setPhone(worker?.phone ?? '');
    setPin(worker?.pin ?? '');
    setHourlyRate(String(worker?.hourlyRate ?? 8000));
    setRole(worker?.role ?? WorkerRole.PREPARADOR);
    setIsActive(worker?.isActive ?? true);
    setSelectedStoreIds(worker?.storeIds?.length ? worker.storeIds : selectedStoreId ? [selectedStoreId] : []);
  }, [selectedStoreId]);

  const openModal = useCallback((worker?: Worker) => {
    resetForm(worker);
    setModalVisible(true);
  }, [resetForm]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'El nombre es obligatorio.');
      return;
    }
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      Alert.alert('Error', 'El PIN debe ser exactamente 6 digitos numericos.');
      return;
    }
    if (selectedStoreIds.length === 0) {
      Alert.alert('Error', 'Selecciona al menos un centro.');
      return;
    }
    const rate = Number(hourlyRate);
    if (isNaN(rate) || rate <= 0) {
      Alert.alert('Error', 'La tarifa por hora debe ser un numero positivo.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        phone: phone.trim() || undefined,
        pin,
        hourlyRate: rate,
        role,
        isActive,
      };
      const worker = editingWorker
        ? await container.workerRepo.update(editingWorker.id, payload)
        : await container.workerRepo.create(payload);
      await container.workerStoreAssignmentRepo.setWorkerStores(worker.id, selectedStoreIds, selectedStoreIds[0]);
      closeModal();
      await loadWorkers();
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el trabajador. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  }, [name, phone, pin, selectedStoreIds, hourlyRate, role, isActive, editingWorker, closeModal, loadWorkers]);

  const toggleStore = useCallback((storeId: string) => {
    setSelectedStoreIds((current) => (
      current.includes(storeId)
        ? current.filter((id) => id !== storeId)
        : [...current, storeId]
    ));
  }, []);

  // H1: Deactivate worker
  const handleDeactivate = useCallback((worker: Worker) => {
    Alert.alert(
      'Desactivar Empleado',
      `¿Seguro que deseas desactivar a ${worker.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await container.workerRepo.update(worker.id, { isActive: false });
              await loadWorkers();
            } catch {
              Alert.alert('Error', 'No se pudo desactivar el empleado');
            }
          },
        },
      ],
    );
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
          <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 4 }}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                {formatCOP(item.hourlyRate)}/hr
              </Text>
              {item.phone && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.phone}
                </Text>
              )}
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'right' }}>
                {(item.storeIds ?? [])
                  .map((id) => stores.find((store) => store.id === id)?.name)
                  .filter(Boolean)
                  .join(', ') || 'Sin centro'}
              </Text>
            </View>
            <IconButton
              icon="pencil"
              size={18}
              onPress={() => openModal(item)}
            />
            {item.isActive && (
              <IconButton
                icon="account-off"
                size={18}
                iconColor={theme.colors.error}
                onPress={() => handleDeactivate(item)}
              />
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
        <Button mode="outlined" compact icon="file-document" onPress={() => router.push('/(tabs)/rrhh/reporte')}>
          Reporte
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
        onPress={() => openModal()}
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#FFFFFF"
      />

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={closeModal}
          contentContainerStyle={[styles.modalContainer, { backgroundColor: '#1E1E1E' }]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              {editingWorker ? 'Editar Trabajador' : 'Nuevo Trabajador'}
            </Text>

            <TextInput
              label="Nombre *"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
              autoFocus
            />

            <TextInput
              label="Telefono"
              value={phone}
              onChangeText={setPhone}
              mode="outlined"
              keyboardType="phone-pad"
              style={styles.input}
            />

            <TextInput
              label="PIN (6 digitos) *"
              value={pin}
              onChangeText={(text) => setPin(text.replace(/[^0-9]/g, '').slice(0, 6))}
              mode="outlined"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              style={styles.input}
            />

            <TextInput
              label="Tarifa por hora (COP) *"
              value={hourlyRate}
              onChangeText={(text) => setHourlyRate(text.replace(/[^0-9]/g, ''))}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
            />

            <Text variant="titleSmall" style={styles.roleLabel}>
              Rol *
            </Text>
            <RadioButton.Group onValueChange={(value) => setRole(value as WorkerRole)} value={role}>
              <View style={styles.roleGrid}>
                {Object.values(WorkerRole).map((r) => (
                  <View key={r} style={styles.roleOption}>
                    <RadioButton.Item
                      label={ROLE_LABELS[r]}
                      value={r}
                      labelStyle={{ color: '#F5F0EB', fontSize: 13 }}
                      style={[
                        styles.radioItem,
                        role === r && { backgroundColor: ROLE_COLORS[r] + '22', borderColor: ROLE_COLORS[r], borderWidth: 1 },
                      ]}
                    />
                  </View>
                ))}
              </View>
            </RadioButton.Group>

            <Text variant="titleSmall" style={styles.roleLabel}>
              Centros *
            </Text>
            <View style={styles.storeGrid}>
              {stores.map((store) => {
                const selected = selectedStoreIds.includes(store.id);
                return (
                  <Chip
                    key={store.id}
                    selected={selected}
                    icon={selected ? 'check' : 'store-outline'}
                    onPress={() => toggleStore(store.id)}
                    style={[styles.storeChip, selected && { backgroundColor: '#E6394622' }]}
                    textStyle={{ color: '#F5F0EB' }}
                  >
                    {store.name}
                  </Chip>
                );
              })}
            </View>

            <View style={styles.statusRow}>
              <Text variant="bodyMedium" style={{ color: '#F5F0EB' }}>
                Trabajador activo
              </Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>

            <View style={styles.buttonRow}>
              <Button
                mode="outlined"
                onPress={closeModal}
                style={styles.actionButton}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                mode="contained"
                onPress={handleSubmit}
                style={styles.actionButton}
                loading={saving}
                disabled={saving}
              >
                {editingWorker ? 'Guardar Cambios' : 'Crear Trabajador'}
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
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
  modalContainer: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    maxHeight: '85%',
  },
  modalTitle: {
    color: '#F5F0EB',
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  roleLabel: {
    color: '#F5F0EB',
    marginBottom: 8,
    marginTop: 4,
  },
  roleGrid: {
    gap: 4,
    marginBottom: 16,
  },
  roleOption: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  radioItem: {
    borderRadius: 8,
  },
  storeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  storeChip: {
    borderWidth: 1,
    borderColor: 'rgba(245, 240, 235, 0.2)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
  },
});
