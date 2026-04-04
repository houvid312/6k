import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  Divider,
  SegmentedButtons,
  Snackbar,
  useTheme,
} from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { InventoryWriteoff } from '../../../src/domain/entities';
import { InventoryLevel, UserRole, WriteoffStatus } from '../../../src/domain/enums';
import { formatDate } from '../../../src/utils/dates';

const REASON_LABELS: Record<string, string> = {
  DAMAGED: 'Danado',
  EXPIRED: 'Vencido',
  SPILLED: 'Derrame',
  CONTAMINATED: 'Contaminado',
  OTHER: 'Otro',
};

const LEVEL_LABELS: Record<number, string> = {
  [InventoryLevel.RAW]: 'Mat. Prima',
  [InventoryLevel.PROCESSED]: 'Procesado',
  [InventoryLevel.STORE]: 'Local',
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING: { color: '#F57C00', bg: '#3E2723', label: 'Pendiente' },
  APPROVED: { color: '#4CAF50', bg: '#1B5E20', label: 'Aprobada' },
  REJECTED: { color: '#EF5350', bg: '#B71C1C', label: 'Rechazada' },
};

export default function BajasScreen() {
  const theme = useTheme();
  const { writeoffService } = useDI();
  const { selectedStoreId, userRole, userId } = useAppStore();
  const { getSupplyName, getWorkerName } = useMasterDataStore();
  const isAdmin = userRole === UserRole.ADMIN;

  const [tab, setTab] = useState<string>(isAdmin ? 'pending' : 'history');
  const [writeoffs, setWriteoffs] = useState<InventoryWriteoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; success: boolean; message: string }>({
    visible: false,
    success: true,
    message: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let data: InventoryWriteoff[];
      if (tab === 'pending') {
        data = isAdmin
          ? await writeoffService.getPendingRequests()
          : await writeoffService.getPendingByStore(selectedStoreId);
      } else {
        data = isAdmin
          ? await writeoffService.getAllHistory()
          : await writeoffService.getHistory(selectedStoreId);
      }
      setWriteoffs(data);
    } catch {
      setWriteoffs([]);
    } finally {
      setLoading(false);
    }
  }, [tab, isAdmin, selectedStoreId, writeoffService]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = useCallback(async (writeoff: InventoryWriteoff) => {
    Alert.alert(
      'Aprobar Baja',
      `Aprobar baja de ${getSupplyName(writeoff.supplyId)} (${writeoff.quantityGrams}g)?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar',
          onPress: async () => {
            try {
              await writeoffService.approve(writeoff.id, userId);
              setSnackbar({ visible: true, success: true, message: 'Baja aprobada. Inventario descontado.' });
              loadData();
            } catch {
              setSnackbar({ visible: true, success: false, message: 'Error al aprobar la baja' });
            }
          },
        },
      ],
    );
  }, [writeoffService, userId, getSupplyName, loadData]);

  const handleReject = useCallback(async (writeoff: InventoryWriteoff) => {
    Alert.alert(
      'Rechazar Baja',
      `Rechazar baja de ${getSupplyName(writeoff.supplyId)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            try {
              await writeoffService.reject(writeoff.id, userId);
              setSnackbar({ visible: true, success: true, message: 'Baja rechazada.' });
              loadData();
            } catch {
              setSnackbar({ visible: true, success: false, message: 'Error al rechazar la baja' });
            }
          },
        },
      ],
    );
  }, [writeoffService, userId, getSupplyName, loadData]);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderWriteoff = ({ item: wo }: { item: InventoryWriteoff }) => {
    const statusConf = STATUS_CONFIG[wo.status] ?? STATUS_CONFIG.PENDING;

    return (
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                {getSupplyName(wo.supplyId)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatTime(wo.createdAt)} · {LEVEL_LABELS[wo.level] ?? 'Local'}
              </Text>
            </View>
            <Chip
              style={{ backgroundColor: statusConf.bg }}
              textStyle={{ color: statusConf.color, fontSize: 11, fontWeight: '700' }}
              compact
            >
              {statusConf.label}
            </Chip>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          <View style={styles.detailRow}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Cantidad:</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{wo.quantityGrams}g</Text>
          </View>
          <View style={styles.detailRow}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Razon:</Text>
            <Text variant="bodyMedium">{REASON_LABELS[wo.reason] ?? wo.reason}</Text>
          </View>
          {wo.notes ? (
            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Notas:</Text>
              <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>{wo.notes}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Solicitado por:</Text>
            <Text variant="bodyMedium">{getWorkerName(wo.requestedBy)}</Text>
          </View>
          {wo.reviewedBy && (
            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Revisado por:</Text>
              <Text variant="bodyMedium">{getWorkerName(wo.reviewedBy)}</Text>
            </View>
          )}

          {wo.status === WriteoffStatus.PENDING && isAdmin && (
            <>
              <Divider style={{ marginVertical: 8 }} />
              <View style={styles.actionRow}>
                <Button
                  mode="outlined"
                  textColor="#EF5350"
                  compact
                  onPress={() => handleReject(wo)}
                  style={{ flex: 1, marginRight: 8 }}
                >
                  Rechazar
                </Button>
                <Button
                  mode="contained"
                  buttonColor="#388E3C"
                  textColor="#FFFFFF"
                  compact
                  onPress={() => handleApprove(wo)}
                  style={{ flex: 1 }}
                >
                  Aprobar
                </Button>
              </View>
            </>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topSection}>
        <StoreSelector />
        <SegmentedButtons
          value={tab}
          onValueChange={setTab}
          buttons={[
            ...(isAdmin ? [{ value: 'pending', label: 'Pendientes' }] : []),
            { value: 'history', label: 'Historial' },
          ]}
          style={styles.segments}
        />
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando bajas..." />
      ) : writeoffs.length === 0 ? (
        <EmptyState
          icon="package-variant-remove"
          title={tab === 'pending' ? 'Sin bajas pendientes' : 'Sin historial de bajas'}
          subtitle={tab === 'pending' ? 'No hay solicitudes por revisar' : 'No se han registrado bajas'}
        />
      ) : (
        <FlatList
          data={writeoffs}
          renderItem={renderWriteoff}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
        style={{ backgroundColor: snackbar.success ? '#4CAF50' : '#B71C1C' }}
        action={{
          label: 'OK',
          textColor: '#FFFFFF',
          onPress: () => setSnackbar((s) => ({ ...s, visible: false })),
        }}
      >
        <Text style={{ color: '#FFFFFF' }}>{snackbar.message}</Text>
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    padding: 16,
    paddingBottom: 0,
  },
  segments: {
    marginTop: 12,
    marginBottom: 8,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
