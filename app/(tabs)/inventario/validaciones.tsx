import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { DataTable, Text, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { ValidationAlert } from '../../../src/components/inventario/ValidationAlert';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { toISODate } from '../../../src/utils/dates';
import { ValidationAlert as ValidationAlertType } from '../../../src/services/ValidationService';

const ALERT_COLORS: Record<string, string> = {
  LOSS: '#FFEBEE',
  SURPLUS: '#FFF3E0',
  OK: '#E8F5E9',
};

export default function ValidacionesScreen() {
  const theme = useTheme();
  const { validationService, inventoryService } = useDI();
  const { selectedStoreId } = useAppStore();

  const [alerts, setAlerts] = useState<ValidationAlertType[]>([]);
  const [loading, setLoading] = useState(true);

  const loadValidations = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const endDate = toISODate(now);
      const startDate = toISODate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

      // For demo purposes, use empty inventory maps
      // In a real app these would come from physical counts
      const data = await validationService.getAlerts(
        selectedStoreId,
        startDate,
        endDate,
        {},
        {},
        5,
      );
      setAlerts(data);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, validationService]);

  useEffect(() => {
    loadValidations();
  }, [loadValidations]);

  if (loading) {
    return <LoadingIndicator message="Calculando validaciones..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Validaciones de Inventario
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
        Comparacion teorica vs real (ultimos 7 dias)
      </Text>

      {alerts.length > 0 && alerts.filter((a) => a.alertType !== 'OK').length > 0 && (
        <ValidationAlert
          type="LOSS"
          message={`Se encontraron ${alerts.filter((a) => a.alertType !== 'OK').length} alertas de inventario`}
        />
      )}

      {alerts.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Sin alertas"
          subtitle="No se encontraron discrepancias significativas"
        />
      ) : (
        <DataTable>
          <DataTable.Header>
            <DataTable.Title>Insumo</DataTable.Title>
            <DataTable.Title numeric>Teorico</DataTable.Title>
            <DataTable.Title numeric>Real</DataTable.Title>
            <DataTable.Title numeric>Diff %</DataTable.Title>
          </DataTable.Header>

          {alerts.map((alert, index) => (
            <DataTable.Row
              key={index}
              style={{ backgroundColor: ALERT_COLORS[alert.alertType] ?? 'transparent' }}
            >
              <DataTable.Cell>{alert.supplyName || `Insumo ${index + 1}`}</DataTable.Cell>
              <DataTable.Cell numeric>{Math.round(alert.theoreticalGrams)}g</DataTable.Cell>
              <DataTable.Cell numeric>{Math.round(alert.realGrams)}g</DataTable.Cell>
              <DataTable.Cell numeric>
                <Text
                  variant="bodySmall"
                  style={{
                    color: alert.alertType === 'LOSS' ? '#D32F2F'
                      : alert.alertType === 'SURPLUS' ? '#F57C00'
                      : '#388E3C',
                    fontWeight: '600',
                  }}
                >
                  {alert.differencePercent > 0 ? '+' : ''}{alert.differencePercent.toFixed(1)}%
                </Text>
              </DataTable.Cell>
            </DataTable.Row>
          ))}
        </DataTable>
      )}

      <View style={{ height: 80 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 4,
  },
});
