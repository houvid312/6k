import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, useTheme, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { DenominationCounter } from '../../../src/components/ventas/DenominationCounter';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { DenominationCount } from '../../../src/domain/entities';
import { todayColombia } from '../../../src/utils/dates';
import { formatCOP } from '../../../src/utils/currency';

const EMPTY_DENOMINATIONS: DenominationCount = {
  bills100k: 0,
  bills50k: 0,
  bills20k: 0,
  bills10k: 0,
  bills5k: 0,
  bills2k: 0,
  coins: 0,
};

export default function AperturaCajaScreen() {
  const theme = useTheme();
  const { cashClosingService } = useDI();
  const { selectedStoreId, userId } = useAppStore();

  const [denominations, setDenominations] = useState<DenominationCount>({ ...EMPTY_DENOMINATIONS });
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; success: boolean; message: string }>({
    visible: false,
    success: true,
    message: '',
  });

  const total = cashClosingService.calculateDenominationTotal(denominations);

  const handleDenominationChange = useCallback((key: keyof DenominationCount, count: number) => {
    setDenominations((prev) => ({ ...prev, [key]: count }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedStoreId) return;
    setSubmitting(true);
    try {
      const today = todayColombia();
      await cashClosingService.createOpening(selectedStoreId, today, denominations, userId || undefined);
      setSnackbar({ visible: true, success: true, message: `Caja abierta con base de ${formatCOP(total)}` });
      setTimeout(() => {
        router.replace('/(tabs)/ventas');
      }, 1000);
    } catch (error: any) {
      const msg = error?.message?.includes('duplicate')
        ? 'Ya existe una apertura para hoy en este local'
        : 'Error al registrar la apertura';
      setSnackbar({ visible: true, success: false, message: msg });
    } finally {
      setSubmitting(false);
    }
  }, [selectedStoreId, denominations, total, userId, cashClosingService]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      <StoreSelector excludeProductionCenter />

      <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginTop: 12, marginBottom: 4 }}>
        Apertura de Caja
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
        Registra la base de efectivo al inicio del turno
      </Text>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <DenominationCounter
            denominations={denominations}
            onChange={handleDenominationChange}
            total={total}
          />
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitButton}
        buttonColor="#4CAF50"
        textColor="#FFFFFF"
        icon="cash-register"
      >
        Abrir Caja — {formatCOP(total)}
      </Button>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={3000}
        style={{ backgroundColor: snackbar.success ? '#4CAF50' : '#B71C1C' }}
      >
        <Text style={{ color: '#FFFFFF' }}>{snackbar.message}</Text>
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 12,
    marginBottom: 16,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 4,
  },
});
