import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Divider,
  Portal,
  Snackbar,
  Switch,
  Dialog,
  Chip,
  useTheme,
  IconButton,
} from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { UserRole } from '../../../src/domain/enums';
import { Store } from '../../../src/domain/entities';

interface StoreFormState {
  id?: string;
  name: string;
  address: string;
  isProductionCenter: boolean;
  isActive: boolean;
}

export default function SedesScreen() {
  const theme = useTheme();
  const { storeRepo } = useDI();
  const { userRole, loadStores } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const isGerente = userRole === UserRole.GERENTE;

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('active');

  // Dialog state for create/edit
  const [dialogVisible, setDialogVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StoreFormState>({
    name: '',
    address: '',
    isProductionCenter: false,
    isActive: true,
  });

  const loadAllStores = useCallback(async () => {
    setLoading(true);
    try {
      const data = await storeRepo.getAllIncludeInactive();
      setStores(data);
    } catch (err) {
      console.error('Error loading stores:', err);
      showError('Error al cargar la lista de sedes');
    } finally {
      setLoading(false);
    }
  }, [storeRepo, showError]);

  useEffect(() => {
    loadAllStores();
  }, [loadAllStores]);

  const filteredStores = useMemo(() => {
    let list = [...stores].sort((a, b) => a.name.localeCompare(b.name));
    if (filterStatus === 'active') {
      return list.filter((s) => s.isActive !== false);
    }
    if (filterStatus === 'inactive') {
      return list.filter((s) => s.isActive === false);
    }
    return list;
  }, [stores, filterStatus]);

  const handleOpenCreate = () => {
    setForm({
      name: '',
      address: '',
      isProductionCenter: false,
      isActive: true,
    });
    setDialogVisible(true);
  };

  const handleOpenEdit = (store: Store) => {
    setForm({
      id: store.id,
      name: store.name,
      address: store.address || '',
      isProductionCenter: store.isProductionCenter,
      isActive: store.isActive !== false,
    });
    setDialogVisible(true);
  };

  const handleSaveStore = async () => {
    const name = form.name.trim();
    if (!name) {
      showError('El nombre de la sede es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        // Editar
        await storeRepo.update(form.id, {
          name,
          address: form.address.trim() || undefined,
          isProductionCenter: form.isProductionCenter,
          isActive: form.isActive,
        });
        showSuccess(`Sede "${name}" actualizada con éxito`);
      } else {
        // Crear
        await storeRepo.create({
          name,
          address: form.address.trim() || undefined,
          isProductionCenter: form.isProductionCenter,
          isActive: form.isActive,
        });
        showSuccess(`Sede "${name}" creada con éxito`);
      }

      setDialogVisible(false);
      await loadAllStores();
      await loadStores(true); // Refresh global app store
    } catch (err: any) {
      console.error('Error saving store:', err);
      showError('Error al guardar la sede');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (store: Store) => {
    const newStatus = !store.isActive;
    try {
      await storeRepo.setActive(store.id, newStatus);
      showSuccess(`Sede "${store.name}" ${newStatus ? 'activada' : 'desactivada'}`);
      await loadAllStores();
      await loadStores(true);
    } catch (err) {
      console.error('Error toggling store status:', err);
      showError('Error al cambiar el estado de la sede');
    }
  };

  if (!isGerente) {
    return (
      <ScreenContainer scrollable padded>
        <EmptyState
          icon="shield-lock"
          title="Acceso Restringido"
          subtitle="Solo la Gerencia General tiene permisos para crear o modificar sedes."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable padded>
      <View style={styles.header}>
        <Button
          mode="text"
          icon="arrow-left"
          compact
          onPress={() => router.replace('/(tabs)/inventario')}
          style={{ alignSelf: 'flex-start' }}
        >
          Volver a Inventario
        </Button>
        <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
          Gestión de Sedes (Tiendas y Centro de Prod.)
        </Text>
        <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          Crea nuevas sedes o desactiva sedes fuera de operación sin perder su historial.
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Button
          mode="contained"
          icon="plus"
          onPress={handleOpenCreate}
          buttonColor="#E63946"
        >
          Crear Nueva Sede
        </Button>
      </View>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        <Chip
          selected={filterStatus === 'active'}
          onPress={() => setFilterStatus('active')}
          compact
          style={filterStatus === 'active' ? { backgroundColor: '#E63946' } : { backgroundColor: '#252525' }}
          textStyle={{ color: '#FFF' }}
        >
          🟢 Activas ({stores.filter((s) => s.isActive !== false).length})
        </Chip>
        <Chip
          selected={filterStatus === 'inactive'}
          onPress={() => setFilterStatus('inactive')}
          compact
          style={filterStatus === 'inactive' ? { backgroundColor: '#E63946' } : { backgroundColor: '#252525' }}
          textStyle={{ color: '#FFF' }}
        >
          🔴 Inactivas ({stores.filter((s) => s.isActive === false).length})
        </Chip>
        <Chip
          selected={filterStatus === 'all'}
          onPress={() => setFilterStatus('all')}
          compact
          style={filterStatus === 'all' ? { backgroundColor: '#E63946' } : { backgroundColor: '#252525' }}
          textStyle={{ color: '#FFF' }}
        >
          ⚪ Todas ({stores.length})
        </Chip>
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando sedes..." />
      ) : filteredStores.length === 0 ? (
        <EmptyState icon="store-remove" title="Sin sedes" subtitle="No se encontraron sedes para el filtro seleccionado." />
      ) : (
        filteredStores.map((store) => {
          const isActive = store.isActive !== false;
          return (
            <Card key={store.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]}>
              <Card.Content>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text variant="titleMedium" style={{ color: '#F5F0EB', fontWeight: '700' }}>
                        {store.name}
                      </Text>
                      {store.isProductionCenter ? (
                        <Chip compact icon="factory" style={{ backgroundColor: '#D4A843' }} textStyle={{ color: '#000', fontSize: 10, fontWeight: '700' }}>
                          Centro de Producción
                        </Chip>
                      ) : (
                        <Chip compact icon="store" style={{ backgroundColor: '#2E2E2E' }} textStyle={{ color: '#AAA', fontSize: 10 }}>
                          Local Venta
                        </Chip>
                      )}
                    </View>

                    {store.address ? (
                      <Text variant="bodySmall" style={{ color: '#888', marginTop: 4 }}>
                        📍 {store.address}
                      </Text>
                    ) : null}
                  </View>

                  <IconButton
                    icon="pencil-outline"
                    iconColor="#FFC107"
                    size={20}
                    onPress={() => handleOpenEdit(store)}
                  />
                </View>

                <Divider style={{ backgroundColor: '#333', marginVertical: 10 }} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: isActive ? '#4CAF50' : '#FF5252', fontWeight: '600' }}>
                    {isActive ? '🟢 Sede Activa en Operación' : '🔴 Sede Desactivada (Archivada)'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 11, color: '#999' }}>{isActive ? 'Desactivar' : 'Activar'}</Text>
                    <Switch
                      value={isActive}
                      onValueChange={() => handleToggleActive(store)}
                      color="#E63946"
                    />
                  </View>
                </View>
              </Card.Content>
            </Card>
          );
        })
      )}

      {/* Modal / Dialog for Create and Edit */}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)} style={{ backgroundColor: '#1E1E1E' }}>
          <Dialog.Title style={{ color: '#FFF' }}>
            {form.id ? 'Editar Sede' : 'Crear Nueva Sede'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Nombre de la Sede *"
              value={form.name}
              onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
              mode="outlined"
              style={{ backgroundColor: '#111', marginBottom: 12 }}
              outlineColor="#333"
              textColor="#FFF"
            />
            <TextInput
              label="Dirección (Opcional)"
              value={form.address}
              onChangeText={(v) => setForm((prev) => ({ ...prev, address: v }))}
              mode="outlined"
              style={{ backgroundColor: '#111', marginBottom: 12 }}
              outlineColor="#333"
              textColor="#FFF"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: '#FFF', fontWeight: '600' }}>¿Es Centro de Producción?</Text>
                <Text style={{ color: '#888', fontSize: 11 }}>
                  Si se marca, manejará niveles de inventario Mat. Prima (`RAW`) y Procesado (`PROCESSED`).
                </Text>
              </View>
              <Switch
                value={form.isProductionCenter}
                onValueChange={(v) => setForm((prev) => ({ ...prev, isProductionCenter: v }))}
                color="#D4A843"
              />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)} textColor="#888">
              Cancelar
            </Button>
            <Button mode="contained" onPress={handleSaveStore} loading={saving} disabled={saving} buttonColor="#E63946">
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <View style={{ height: 80 }} />

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
    marginBottom: 8,
  },
  title: {
    fontWeight: 'bold',
    marginTop: 4,
  },
  subtitle: {
    marginBottom: 12,
  },
  actionRow: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  card: {
    marginBottom: 10,
    borderRadius: 12,
  },
});
