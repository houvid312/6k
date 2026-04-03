import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Button, Text, Portal, Snackbar, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { ConfirmDialog } from '../../../src/components/common/ConfirmDialog';
import { TransferOrderCard } from '../../../src/components/inventario/TransferOrderCard';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { Transfer } from '../../../src/domain/entities';
import { TransferStatus } from '../../../src/domain/enums';

export default function TrasladosScreen() {
  const theme = useTheme();
  const { transferService } = useDI();
  const { selectedStoreId, stores } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await transferService.getTransfersByStore(selectedStoreId);
      setTransfers(data.sort((a, b) => b.orderDate.localeCompare(a.orderDate)));
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, transferService]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const handleExecute = useCallback(async () => {
    if (!selectedTransfer) return;
    setConfirming(true);
    try {
      await transferService.executeTransfer(selectedTransfer.id);
      showSuccess('Traslado recibido. Inventario actualizado.');
      loadTransfers();
    } catch {
      showError('No se pudo procesar el traslado');
    } finally {
      setConfirming(false);
      setConfirmVisible(false);
      setSelectedTransfer(null);
    }
  }, [selectedTransfer, transferService, loadTransfers, showSuccess, showError]);

  const handleCreateTransfer = useCallback(async () => {
    const productionCenter = stores.find((s) => s.isProductionCenter);
    if (!productionCenter) {
      showError('No hay centro de produccion configurado');
      return;
    }

    setCreating(true);
    try {
      const minTargets: Record<string, number> = {};
      await transferService.generateTransferOrder(productionCenter.id, selectedStoreId, minTargets);
      showSuccess('Orden de traslado generada');
      loadTransfers();
    } catch {
      showError('No se pudo crear el traslado');
    } finally {
      setCreating(false);
    }
  }, [stores, selectedStoreId, transferService, loadTransfers, showSuccess, showError]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            mode="contained"
            icon="plus"
            onPress={handleCreateTransfer}
            loading={creating}
            disabled={creating}
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
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando traslados..." />
      ) : transfers.length === 0 ? (
        <EmptyState icon="truck" title="Sin traslados" subtitle="No hay traslados registrados" />
      ) : (
        <FlatList
          data={transfers}
          renderItem={({ item }) => (
            <TransferOrderCard
              transfer={item}
              onPress={() => {
                if (item.status === TransferStatus.PENDING || item.status === TransferStatus.IN_TRANSIT) {
                  setSelectedTransfer(item);
                  setConfirmVisible(true);
                }
              }}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ConfirmDialog
        visible={confirmVisible}
        title="Recibir Traslado"
        message="Se actualizara el inventario del local con los items del traslado. Continuar?"
        onConfirm={handleExecute}
        onDismiss={() => {
          setConfirmVisible(false);
          setSelectedTransfer(null);
        }}
        confirmLabel="Recibir"
        confirmLoading={confirming}
      />

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
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
});
