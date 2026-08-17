import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FlatList, View, StyleSheet, ScrollView } from 'react-native';
import { Button, Text, Portal, Snackbar, useTheme, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { ConfirmDialog } from '../../../src/components/common/ConfirmDialog';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { TransferOrderCard } from '../../../src/components/inventario/TransferOrderCard';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { Transfer } from '../../../src/domain/entities';
import { TransferStatus, UserRole } from '../../../src/domain/enums';

type ConfirmAction = 'receive' | 'cancel' | 'transit';
type StatusFilter = 'ALL' | TransferStatus;

const STATUS_SORT_ORDER: Record<TransferStatus, number> = {
  [TransferStatus.PENDING]: 0,
  [TransferStatus.IN_TRANSIT]: 1,
  [TransferStatus.RECEIVED]: 2,
  [TransferStatus.CANCELLED]: 3,
};

function getTransferTime(transfer: Transfer): number {
  const timestamp = transfer.orderDate.includes('T')
    ? transfer.orderDate
    : transfer.createdAt ?? transfer.orderDate;
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function sortTransfers(a: Transfer, b: Transfer): number {
  const statusDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
  if (statusDiff !== 0) return statusDiff;
  return getTransferTime(b) - getTransferTime(a);
}

const CONFIRM_CONFIG: Record<ConfirmAction, { title: string; message: string; label: string }> = {
  transit: {
    title: 'Marcar En Tránsito',
    message: '¿Deseas marcar el traslado como enviado en tránsito?',
    label: 'Enviar',
  },
  receive: {
    title: 'Recibir Traslado',
    message: '¿Deseas recibir el traslado? Se actualizará el inventario y se generará el cobro interno.',
    label: 'Recibir',
  },
  cancel: {
    title: 'Cancelar Traslado',
    message: '¿Deseas cancelar este traslado? Esta acción no se puede deshacer.',
    label: 'Cancelar traslado',
  },
};

export default function TrasladosScreen() {
  const theme = useTheme();
  const { transferService, creditService } = useDI();
  const { selectedStoreId, userRole, stores } = useAppStore();

  const canSend = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL || userRole === UserRole.PREPARADOR || userRole === UserRole.RODY;
  const canReceive = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL || userRole === UserRole.VENDEDOR;
  const canCancel = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL;
  const isGlobalRole = userRole === UserRole.GERENTE || userRole === UserRole.RODY || userRole === UserRole.PREPARADOR;

  const { supplies } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [creditMap, setCreditMap] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const supplyMap = new Map(supplies.map((s) => [s.id, {
    name: s.name,
    gramsPerBag: s.gramsPerBag,
    commercialPriceCop: s.commercialPriceCop,
    isBillableToStore: s.isBillableToStore,
  }]));

  const storeMap = useMemo(() => {
    return new Map(stores.map((s) => [s.id, s.name]));
  }, [stores]);

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const [data, credits] = await Promise.all([
        isGlobalRole ? transferService.getAllTransfers() : transferService.getTransfersByStore(selectedStoreId),
        creditService.getAllCredits().catch(() => []),
      ]);

      const cMap = new Map<string, any>();
      for (const credit of credits) {
        if (credit.transferId) cMap.set(credit.transferId, credit);
        if (credit.id) cMap.set(credit.id, credit);
      }
      setCreditMap(cMap);
      setTransfers([...data].sort(sortTransfers));
    } catch (err: any) {
      console.error('Error loading transfers:', err);
      showError(err?.message ? `Error al cargar traslados: ${err.message}` : 'Error al cargar traslados');
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, isGlobalRole, transferService, creditService, showError]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const storeFilteredTransfers = useMemo(() => {
    // Rody y Preparadores deben ver los traslados de todas las sedes sin que el filtro de sede principal los oculte
    if (userRole === UserRole.RODY || userRole === UserRole.PREPARADOR || !selectedStoreId) {
      return transfers;
    }
    return transfers.filter(
      (t) => t.fromStoreId === selectedStoreId || t.toStoreId === selectedStoreId
    );
  }, [transfers, selectedStoreId, userRole]);

  const filteredTransfers = useMemo(() => {
    if (statusFilter === 'ALL') return storeFilteredTransfers;
    return storeFilteredTransfers.filter((t) => t.status === statusFilter);
  }, [storeFilteredTransfers, statusFilter]);

  const countsByStatus = useMemo(() => {
    const pending = storeFilteredTransfers.filter((t) => t.status === TransferStatus.PENDING).length;
    const inTransit = storeFilteredTransfers.filter((t) => t.status === TransferStatus.IN_TRANSIT).length;
    const received = storeFilteredTransfers.filter((t) => t.status === TransferStatus.RECEIVED).length;
    const cancelled = storeFilteredTransfers.filter((t) => t.status === TransferStatus.CANCELLED).length;
    return {
      all: storeFilteredTransfers.length,
      pending,
      inTransit,
      received,
      cancelled,
    };
  }, [storeFilteredTransfers]);

  const openConfirm = (transfer: Transfer, action: ConfirmAction) => {
    if (action === 'transit' && !canSend) return;
    if (action === 'receive' && !canReceive) return;
    if (action === 'cancel' && !canCancel) return;
    setSelectedTransfer(transfer);
    setConfirmAction(action);
  };

  const closeConfirm = () => {
    setSelectedTransfer(null);
    setConfirmAction(null);
  };

  const handleConfirmAction = useCallback(async () => {
    const transferId = selectedTransfer?.id;
    const action = confirmAction;
    if (!transferId || !action) return;

    setActionLoading(true);
    try {
      if (action === 'transit' && canSend) {
        await transferService.markInTransit(transferId);
        showSuccess('Traslado marcado en tránsito');
      } else if (action === 'receive' && canReceive) {
        await transferService.executeTransfer(transferId);
        showSuccess('Traslado recibido. Inventario actualizado.');
      } else if (action === 'cancel' && canCancel) {
        await transferService.cancelTransfer(transferId);
        showSuccess('Traslado cancelado');
      }
    } catch {
      showError('No se pudo procesar la acción');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
      setSelectedTransfer(null);
      await loadTransfers();
    }
  }, [selectedTransfer, confirmAction, canSend, canReceive, canCancel, transferService, loadTransfers, showSuccess, showError]);

  const handleCreateTransfer = useCallback(async () => {
    router.push('/(tabs)/inventario/sugerencia-envio');
  }, []);

  const confirmConfig = confirmAction ? CONFIRM_CONFIG[confirmAction] : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topSection}>
        <StoreSelector />

        <View style={styles.headerButtons}>
          <Button
            mode="contained"
            icon="plus"
            onPress={handleCreateTransfer}
            style={{ borderRadius: 8, flex: 1 }}
          >
            Nuevo Traslado
          </Button>
          <Button
            mode="outlined"
            icon="calculator"
            onPress={() => router.push('/(tabs)/inventario/sugerencia-envio')}
            style={{ borderRadius: 8, flex: 1 }}
          >
            Sugerencia
          </Button>
        </View>

        {/* Filter chips bar by status */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10, maxHeight: 38 }}
          contentContainerStyle={{ paddingHorizontal: 4 }}
        >
          <Chip
            selected={statusFilter === 'ALL'}
            onPress={() => setStatusFilter('ALL')}
            style={[styles.filterChip, statusFilter === 'ALL' && styles.activeFilterChip]}
            textStyle={{ fontSize: 12, color: statusFilter === 'ALL' ? '#FFFFFF' : '#F5F0EB' }}
          >
            Todos ({countsByStatus.all})
          </Chip>
          <Chip
            selected={statusFilter === TransferStatus.PENDING}
            onPress={() => setStatusFilter(TransferStatus.PENDING)}
            style={[styles.filterChip, statusFilter === TransferStatus.PENDING && styles.activeFilterChip]}
            textStyle={{ fontSize: 12, color: statusFilter === TransferStatus.PENDING ? '#FFFFFF' : '#FFB74D' }}
          >
            Pendientes ({countsByStatus.pending})
          </Chip>
          <Chip
            selected={statusFilter === TransferStatus.IN_TRANSIT}
            onPress={() => setStatusFilter(TransferStatus.IN_TRANSIT)}
            style={[styles.filterChip, statusFilter === TransferStatus.IN_TRANSIT && styles.activeFilterChip]}
            textStyle={{ fontSize: 12, color: statusFilter === TransferStatus.IN_TRANSIT ? '#FFFFFF' : '#64B5F6' }}
          >
            En Tránsito ({countsByStatus.inTransit})
          </Chip>
          <Chip
            selected={statusFilter === TransferStatus.RECEIVED}
            onPress={() => setStatusFilter(TransferStatus.RECEIVED)}
            style={[styles.filterChip, statusFilter === TransferStatus.RECEIVED && styles.activeFilterChip]}
            textStyle={{ fontSize: 12, color: statusFilter === TransferStatus.RECEIVED ? '#FFFFFF' : '#81C784' }}
          >
            Recibidos ({countsByStatus.received})
          </Chip>
          <Chip
            selected={statusFilter === TransferStatus.CANCELLED}
            onPress={() => setStatusFilter(TransferStatus.CANCELLED)}
            style={[styles.filterChip, statusFilter === TransferStatus.CANCELLED && styles.activeFilterChip]}
            textStyle={{ fontSize: 12, color: statusFilter === TransferStatus.CANCELLED ? '#FFFFFF' : '#E57373' }}
          >
            Cancelados ({countsByStatus.cancelled})
          </Chip>
        </ScrollView>
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando traslados..." />
      ) : filteredTransfers.length === 0 ? (
        <EmptyState icon="truck" title="Sin traslados" subtitle="No hay traslados para el filtro seleccionado" />
      ) : (
        <FlatList
          data={filteredTransfers}
          renderItem={({ item }) => (
            <TransferOrderCard
              transfer={item}
              supplyMap={supplyMap}
              storeMap={storeMap}
              creditMap={creditMap}
              onMarkInTransit={canSend ? (t) => openConfirm(t, 'transit') : undefined}
              onReceive={canReceive ? (t) => openConfirm(t, 'receive') : undefined}
              onCancel={canCancel ? (t) => openConfirm(t, 'cancel') : undefined}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {confirmConfig && (
        <ConfirmDialog
          visible={!!confirmAction}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={handleConfirmAction}
          onDismiss={closeConfirm}
          confirmLabel={confirmConfig.label}
          confirmLoading={actionLoading}
        />
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    padding: 16,
    paddingBottom: 8,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  filterChip: {
    marginRight: 6,
    height: 32,
    backgroundColor: '#2A2A2A',
  },
  activeFilterChip: {
    backgroundColor: '#E63946',
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
});
