import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { FlatList, View, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { Card, Text, Chip, Button, FAB, IconButton, useTheme, Modal, Portal, TextInput, RadioButton, Switch } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Worker } from '../../../src/domain/entities';
import { WorkerRole, UserRole } from '../../../src/domain/enums';
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

const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.GERENTE]: 'Gerente (CEO)',
  [UserRole.ADMIN_LOCAL]: 'Admin Local',
  [UserRole.PREPARADOR]: 'Preparador',
  [UserRole.RODY]: 'Rody (Repartidor)',
  [UserRole.VENDEDOR]: 'Vendedor',
};

export default function RRHHScreen() {
  const theme = useTheme();
  const { workers, loading, loadWorkers } = useWorkerStore();
  const { stores, selectedStoreId, loadStores, userRole: currentUserRole } = useAppStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [hourlyRate, setHourlyRate] = useState('8000');
  const [role, setRole] = useState<WorkerRole>(WorkerRole.PREPARADOR);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.VENDEDOR);
  const [isActive, setIsActive] = useState(true);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');

  useEffect(() => {
    loadWorkers();
    loadStores();
  }, [loadStores, loadWorkers]);

  const isWorkerInStore = useCallback((w: Worker) => {
    if (!selectedStoreId) return true;
    if (w.userRole === UserRole.GERENTE || !w.storeIds || w.storeIds.length === 0) return true;
    return w.storeIds.includes(selectedStoreId);
  }, [selectedStoreId]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (!isWorkerInStore(w)) {
        return false;
      }
      if (statusFilter === 'ACTIVE' && !w.isActive) {
        return false;
      }
      if (statusFilter === 'INACTIVE' && w.isActive) {
        return false;
      }
      return true;
    });
  }, [workers, isWorkerInStore, statusFilter]);

  const resetForm = useCallback((worker?: Worker) => {
    setEditingWorker(worker ?? null);
    setName(worker?.name ?? '');
    setUsername(worker?.username ?? '');
    setPhone(worker?.phone ?? '');
    setPin(worker?.pin ?? '');
    setShowPin(false);
    setHourlyRate(String(worker?.hourlyRate ?? 8000));
    setRole(worker?.role ?? WorkerRole.PREPARADOR);
    setUserRole(worker?.userRole ?? UserRole.VENDEDOR);
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
    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedName) {
      Alert.alert('Error', 'El nombre es obligatorio.');
      return;
    }
    if (!trimmedUsername) {
      Alert.alert('Error', 'El usuario (username) es obligatorio.');
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
        username: trimmedUsername || undefined,
        phone: phone.trim() || undefined,
        pin,
        hourlyRate: rate,
        role,
        userRole,
        isActive,
      };
      const worker = editingWorker
        ? await container.workerRepo.update(editingWorker.id, payload)
        : await container.workerRepo.create(payload);
      await container.workerStoreAssignmentRepo.setWorkerStores(worker.id, selectedStoreIds, selectedStoreIds[0]);
      closeModal();
      await loadWorkers();
    } catch (error: any) {
      console.error('Error al guardar trabajador:', error);
      const errMsg = error?.message || 'No se pudo guardar el trabajador. Intente de nuevo.';
      if (Platform.OS === 'web') {
        window.alert(`Error: ${errMsg}`);
      } else {
        Alert.alert('Error', errMsg);
      }
    } finally {
      setSaving(false);
    }
  }, [name, username, phone, pin, selectedStoreIds, hourlyRate, role, userRole, isActive, editingWorker, closeModal, loadWorkers]);

  const toggleStore = useCallback((storeId: string) => {
    setSelectedStoreIds((current) => (
      current.includes(storeId)
        ? current.filter((id) => id !== storeId)
        : [...current, storeId]
    ));
  }, []);

  // Toggle worker active/inactive status
  const handleToggleStatus = useCallback((worker: Worker) => {
    const newStatus = !worker.isActive;
    const actionText = newStatus ? 'activar' : 'desactivar';
    const titleText = newStatus ? 'Activar Empleado' : 'Desactivar Empleado';
    const confirmMessage = `¿Seguro que deseas ${actionText} a ${worker.name}?`;

    const executeToggle = async () => {
      try {
        await container.workerRepo.update(worker.id, { isActive: newStatus });
        await loadWorkers();
      } catch (error) {
        console.error(`Error ${actionText} worker:`, error);
        if (Platform.OS === 'web') {
          window.alert(`Error: No se pudo ${actionText} el empleado`);
        } else {
          Alert.alert('Error', `No se pudo ${actionText} el empleado`);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        executeToggle();
      }
    } else {
      Alert.alert(
        titleText,
        confirmMessage,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: newStatus ? 'Activar' : 'Desactivar',
            style: newStatus ? 'default' : 'destructive',
            onPress: executeToggle,
          },
        ],
      );
    }
  }, [loadWorkers]);

  // Delete worker with fallback to deactivation on foreign key constraint
  const handleDeleteWorker = useCallback((worker: Worker) => {
    const confirmMessage = `¿Seguro que deseas eliminar a ${worker.name}?\n\nNota: Si el empleado tiene transacciones o historial asociado en la base de datos, será desactivado en su lugar para mantener la integridad de los datos.`;

    const executeDelete = async () => {
      try {
        await container.workerRepo.delete(worker.id);
        await loadWorkers();
        if (Platform.OS === 'web') {
          window.alert(`El empleado "${worker.name}" fue eliminado exitosamente.`);
        } else {
          Alert.alert('Éxito', `El empleado "${worker.name}" fue eliminado exitosamente.`);
        }
      } catch (error: any) {
        console.warn('No se pudo eliminar el empleado, desactivando en su lugar:', error);
        try {
          await container.workerRepo.update(worker.id, { isActive: false });
          await loadWorkers();
          const infoMsg = `No es posible eliminar a "${worker.name}" porque cuenta con registros o transacciones asociadas en el sistema.\n\nEn su lugar, el empleado ha sido DESACTIVADO para proteger la integridad de la información.`;
          if (Platform.OS === 'web') {
            window.alert(infoMsg);
          } else {
            Alert.alert('Empleado Desactivado', infoMsg);
          }
        } catch (deactivateError) {
          console.error('Error al desactivar empleado tras fallo en borrado:', deactivateError);
          if (Platform.OS === 'web') {
            window.alert('Error al intentar desactivar el empleado.');
          } else {
            Alert.alert('Error', 'No se pudo procesar la solicitud.');
          }
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        executeDelete();
      }
    } else {
      Alert.alert(
        'Eliminar Empleado',
        confirmMessage,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: executeDelete },
        ],
      );
    }
  }, [loadWorkers]);

  const renderWorker = ({ item }: { item: Worker }) => (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.workerRow}>
          <View style={styles.workerInfo}>
            <Text variant="titleSmall" style={{ fontWeight: '600' }}>
              {item.name} {item.username ? `(@${item.username})` : ''}
            </Text>
            <View style={styles.chipRow}>
              <Chip
                compact
                textStyle={{ fontSize: 10, color: '#FFFFFF' }}
                style={{ backgroundColor: ROLE_COLORS[item.role] ?? '#757575' }}
              >
                {item.role}
              </Chip>
              {item.userRole && (
                <Chip
                  compact
                  textStyle={{ fontSize: 10, color: '#FFFFFF' }}
                  style={{ backgroundColor: '#D32F2F', marginLeft: 4 }}
                >
                  {USER_ROLE_LABELS[item.userRole]}
                </Chip>
              )}
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
            <IconButton
              icon={item.isActive ? 'account-off' : 'account-check'}
              size={18}
              iconColor={item.isActive ? theme.colors.error : '#4CAF50'}
              onPress={() => handleToggleStatus(item)}
            />
            <IconButton
              icon="delete"
              size={18}
              iconColor="#D32F2F"
              onPress={() => handleDeleteWorker(item)}
            />
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topSection}>
        <StoreSelector />
      </View>
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

      {/* Filter chips bar */}
      <View style={styles.filterRow}>
        <Chip
          selected={statusFilter === 'ALL'}
          onPress={() => setStatusFilter('ALL')}
          style={[styles.filterChip, statusFilter === 'ALL' && styles.activeFilterChip]}
          textStyle={{ fontSize: 12, color: statusFilter === 'ALL' ? '#FFFFFF' : '#F5F0EB' }}
        >
          Todos ({workers.filter(isWorkerInStore).length})
        </Chip>
        <Chip
          selected={statusFilter === 'ACTIVE'}
          onPress={() => setStatusFilter('ACTIVE')}
          style={[styles.filterChip, statusFilter === 'ACTIVE' && styles.activeFilterChip]}
          textStyle={{ fontSize: 12, color: statusFilter === 'ACTIVE' ? '#FFFFFF' : '#F5F0EB' }}
        >
          Activos ({workers.filter((w) => isWorkerInStore(w) && w.isActive).length})
        </Chip>
        <Chip
          selected={statusFilter === 'INACTIVE'}
          onPress={() => setStatusFilter('INACTIVE')}
          style={[styles.filterChip, statusFilter === 'INACTIVE' && styles.activeFilterChip]}
          textStyle={{ fontSize: 12, color: statusFilter === 'INACTIVE' ? '#FFFFFF' : '#F5F0EB' }}
        >
          Inactivos ({workers.filter((w) => isWorkerInStore(w) && !w.isActive).length})
        </Chip>
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando trabajadores..." />
      ) : filteredWorkers.length === 0 ? (
        <EmptyState icon="account-group" title="Sin trabajadores" subtitle="No hay trabajadores registrados para este local" />
      ) : (
        <FlatList
          data={filteredWorkers}
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
              label="Usuario (para iniciar sesión) *"
              value={username}
              onChangeText={(text) => setUsername(text.toLowerCase().replace(/\s/g, ''))}
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="account-outline" />}
              autoCapitalize="none"
              autoCorrect={false}
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
              secureTextEntry={!showPin}
              style={styles.input}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showPin ? 'eye-off' : 'eye'}
                  onPress={() => setShowPin(!showPin)}
                  color="#8B8178"
                />
              }
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
              Rol del Sistema (Seguridad RLS) *
             </Text>
             <RadioButton.Group onValueChange={(value) => setUserRole(value as UserRole)} value={userRole}>
               <View style={styles.roleGrid}>
                 {Object.values(UserRole)
                   .filter((ur) => currentUserRole === UserRole.GERENTE || ur !== UserRole.GERENTE)
                   .map((ur) => (
                   <View key={ur} style={styles.roleOption}>
                     <RadioButton.Item
                       label={USER_ROLE_LABELS[ur]}
                       value={ur}
                       labelStyle={{ color: '#F5F0EB', fontSize: 13 }}
                       style={[
                         styles.radioItem,
                         userRole === ur && { backgroundColor: '#E6394622', borderColor: '#E63946', borderWidth: 1 },
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
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  navRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(245, 240, 235, 0.15)',
    borderWidth: 1,
  },
  activeFilterChip: {
    backgroundColor: '#E63946',
    borderColor: '#E63946',
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
