import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet, Alert } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { ConfirmDialog } from '../../../src/components/common/ConfirmDialog';
import { TransferOrderCard } from '../../../src/components/inventario/TransferOrderCard';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Transfer } from '../../../src/domain/entities';
import { TransferStatus } from '../../../src/domain/enums';

export default function TrasladosScreen() {
  const theme = useTheme();
  const { transferService } = useDI();
  const { selectedStoreId, stores } = useAppStore();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      await transferService.executeTransfer(selectedTransfer.id);
      Alert.alert('Traslado recibido', 'El inventario ha sido actualizado');
      loadTransfers();
    } catch (err) {
      Alert.alert('Error', 'No se pudo procesar el traslado');
    } finally {
      setConfirmVisible(false);
      setSelectedTransfer(null);
    }
  }, [selectedTransfer, transferService, loadTransfers]);

  const handleCreateTransfer = useCallback(async () => {
    const productionCenter = stores.find((s) => s.isProductionCenter);
    if (!productionCenter) {
      Alert.alert('Error', 'No hay centro de produccion configurado');
      return;
    }

    try {
      const minTargets: Record<string, number> = {};
      await transferService.generateTransferOrder(productionCenter.id, selectedStoreId, minTargets);
      Alert.alert('Traslado creado', 'Se genero una orden de traslado');
      loadTransfers();
    } catch {
      Alert.alert('Error', 'No se pudo crear el traslado');
    }
  }, [stores, selectedStoreId, transferService, loadTransfers]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Button
          mode="contained"
          icon="plus"
          onPress={handleCreateTransfer}
          style={{ borderRadius: 8 }}
        >
          Nuevo Traslado
        </Button>
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
      />
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
