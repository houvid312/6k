import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput, Button, Card, Divider, Portal, Snackbar, Chip, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { SupplyRequirement } from '../../../src/services/DemandEstimationService';
import { nowColombia } from '../../../src/utils/dates';

const DAY_OPTIONS = [
  { value: '1', label: 'Lun' },
  { value: '2', label: 'Mar' },
  { value: '3', label: 'Mie' },
  { value: '4', label: 'Jue' },
  { value: '5', label: 'Vie' },
  { value: '6', label: 'Sab' },
  { value: '0', label: 'Dom' },
];

function getTomorrowDay(): string {
  const tomorrow = nowColombia();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return String(tomorrow.getDay());
}

export default function SugerenciaEnvioScreen() {
  const theme = useTheme();
  const { demandEstimationService, transferService } = useDI();
  const { selectedStoreId, stores } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [selectedDay, setSelectedDay] = useState<string>(getTomorrowDay());
  const [requirements, setRequirements] = useState<SupplyRequirement[]>([]);
  const [editableBags, setEditableBags] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [calculated, setCalculated] = useState(false);

  const handleCalculate = useCallback(async () => {
    if (!selectedStoreId) {
      showError('Selecciona un local');
      return;
    }

    setLoading(true);
    try {
      const result = await demandEstimationService.generateSuggestedTransfer(
        selectedStoreId,
        Number(selectedDay),
      );
      setRequirements(result);
      const bags: Record<string, string> = {};
      for (const req of result) {
        bags[req.supplyId] = String(req.bagsToSend);
      }
      setEditableBags(bags);
      setCalculated(true);
      if (result.length === 0) {
        showSuccess('El local tiene inventario suficiente para la demanda estimada');
      }
    } catch {
      showError('Error al calcular sugerencia');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, selectedDay, demandEstimationService, showSuccess, showError]);

  const handleCreateTransfer = useCallback(async () => {
    const productionCenter = stores.find((s) => s.isProductionCenter);
    if (!productionCenter) {
      showError('No hay centro de produccion configurado');
      return;
    }

    const minTargets: Record<string, number> = {};
    for (const req of requirements) {
      const bags = parseInt(editableBags[req.supplyId] || '0', 10);
      if (bags > 0) {
        minTargets[req.supplyId] = bags * req.gramsPerBag;
      }
    }

    setCreating(true);
    try {
      await transferService.generateTransferOrder(productionCenter.id, selectedStoreId, minTargets);
      showSuccess('Orden de traslado creada');
      setTimeout(() => router.push('/(tabs)/inventario/traslados'), 1500);
    } catch {
      showError('Error al crear orden de traslado');
    } finally {
      setCreating(false);
    }
  }, [stores, selectedStoreId, requirements, transferService, showSuccess, showError]);

  return (
    <ScreenContainer scrollable padded>
      <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Sugerencia de Envio
      </Text>
      <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Calculo automatico basado en demanda estimada e inventario actual
      </Text>

      <StoreSelector />

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginTop: 16, marginBottom: 8, color: theme.colors.onBackground }}>
        Dia de la semana:
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
        <View style={styles.dayRow}>
          {DAY_OPTIONS.map((day) => (
            <Chip
              key={day.value}
              selected={selectedDay === day.value}
              onPress={() => setSelectedDay(day.value)}
              mode="flat"
              style={[
                styles.dayChip,
                selectedDay === day.value && { backgroundColor: '#E63946' },
              ]}
              textStyle={{
                color: selectedDay === day.value ? '#FFFFFF' : '#F5F0EB',
                fontWeight: selectedDay === day.value ? '700' : '400',
              }}
              showSelectedOverlay={false}
            >
              {day.label}
            </Chip>
          ))}
        </View>
      </ScrollView>

      <Button
        mode="contained"
        onPress={handleCalculate}
        loading={loading}
        disabled={loading}
        icon="calculator"
        style={styles.calcBtn}
        buttonColor="#E63946"
      >
        Calcular Sugerencia
      </Button>

      {calculated && requirements.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Inventario suficiente"
          subtitle="No se necesita enviar insumos para la demanda estimada"
        />
      ) : requirements.length > 0 ? (
        <>
          <Text variant="bodySmall" style={{ color: '#999', marginBottom: 8 }}>
            Ajusta las bolsas si necesitas enviar mas o menos de lo sugerido
          </Text>

          {requirements.map((req) => (
            <Card key={req.supplyId} style={[styles.reqCard, { backgroundColor: '#1E1E1E' }]}>
              <Card.Content>
                <Text variant="titleSmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
                  {req.supplyName}
                </Text>
                <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                  {req.gramsPerBag}g por bolsa
                </Text>

                <Divider style={{ backgroundColor: '#333', marginVertical: 8 }} />

                <View style={styles.reqDetails}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: '#999' }}>
                      En tienda: {Math.round(req.currentGrams)}g
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#999', marginTop: 2 }}>
                      Necesita: {Math.round(req.requiredGrams)}g
                    </Text>
                  </View>
                  <View style={styles.bagsInputContainer}>
                    <Text variant="bodySmall" style={{ color: '#999', marginBottom: 4 }}>
                      Bolsas
                    </Text>
                    <TextInput
                      mode="outlined"
                      dense
                      keyboardType="numeric"
                      value={editableBags[req.supplyId] || '0'}
                      onChangeText={(v) =>
                        setEditableBags((prev) => ({ ...prev, [req.supplyId]: v }))
                      }
                      style={styles.bagsInput}
                      outlineColor="#333"
                      activeOutlineColor="#E63946"
                      textColor="#F5F0EB"
                    />
                  </View>
                </View>
              </Card.Content>
            </Card>
          ))}

          <Button
            mode="contained"
            onPress={handleCreateTransfer}
            loading={creating}
            disabled={creating}
            icon="truck"
            style={styles.createBtn}
          >
            Crear Orden de Traslado
          </Button>
        </>
      ) : null}

      <View style={{ height: 100 }} />

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
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
  dayScroll: {
    marginBottom: 16,
    flexGrow: 0,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayChip: {
    backgroundColor: '#333',
  },
  calcBtn: {
    marginBottom: 16,
    borderRadius: 8,
    paddingVertical: 4,
  },
  reqCard: {
    marginBottom: 8,
    borderRadius: 12,
  },
  reqDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bagsInputContainer: {
    alignItems: 'center',
  },
  bagsInput: {
    width: 80,
    backgroundColor: '#111',
    textAlign: 'center',
  },
  createBtn: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
