import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { DataTable, Text, Button, SegmentedButtons, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { ValidationAlert as ValidationAlertComponent } from '../../../src/components/inventario/ValidationAlert';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { DailyAlert } from '../../../src/domain/entities';
import { toISODate, nowColombia } from '../../../src/utils/dates';

const ALERT_COLORS: Record<string, string> = {
  LOSS: '#FFEBEE',
  SURPLUS: '#FFF3E0',
  OK: '#E8F5E9',
};

const RANGE_BUTTONS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: '30 dias' },
];

export default function ValidacionesScreen() {
  const theme = useTheme();
  const { alertService, supplyRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const [alerts, setAlerts] = useState<DailyAlert[]>([]);
  const [supplyNames, setSupplyNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('today');

  const loadValidations = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const supplies = await supplyRepo.getAll();
      setSupplyNames(new Map(supplies.map((s) => [s.id, s.name])));

      const now = nowColombia();
      const endDate = toISODate(now);

      let startDate: string;
      if (range === 'today') {
        startDate = endDate;
      } else if (range === 'week') {
        startDate = toISODate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      } else {
        startDate = toISODate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      }

      if (range === 'today') {
        const data = await alertService.getDailyAlerts(selectedStoreId, endDate);
        setAlerts(data);
      } else {
        const data = await alertService.getAlertHistory(selectedStoreId, startDate, endDate);
        setAlerts(data);
      }
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, range, alertService, supplyRepo]);

  useEffect(() => {
    loadValidations();
  }, [loadValidations]);

  const anomalies = alerts.filter((a) => a.alertType !== 'OK');

  return (
    <ScreenContainer scrollable padded>
      <StoreSelector />

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Validaciones de Inventario
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        Comparacion inventario teorico vs conteo fisico
      </Text>

      <SegmentedButtons
        value={range}
        onValueChange={setRange}
        buttons={RANGE_BUTTONS}
        style={styles.segments}
      />

      {loading ? (
        <LoadingIndicator message="Cargando validaciones..." />
      ) : (
        <>
          {anomalies.length > 0 && (
            <ValidationAlertComponent
              type="LOSS"
              message={`Se encontraron ${anomalies.length} discrepancia(s) de inventario`}
            />
          )}

          {alerts.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Sin alertas"
              subtitle="No se encontraron validaciones para este periodo. Las alertas se generan automaticamente al hacer cierre de caja."
            />
          ) : (
            <DataTable>
              <DataTable.Header>
                <DataTable.Title>Insumo</DataTable.Title>
                <DataTable.Title numeric>Teorico</DataTable.Title>
                <DataTable.Title numeric>Real</DataTable.Title>
                <DataTable.Title numeric>Diff %</DataTable.Title>
              </DataTable.Header>

              {alerts.map((alert) => (
                <DataTable.Row
                  key={alert.id}
                  style={{ backgroundColor: ALERT_COLORS[alert.alertType] ?? 'transparent' }}
                >
                  <DataTable.Cell>
                    {supplyNames.get(alert.supplyId) ?? 'Insumo'}
                  </DataTable.Cell>
                  <DataTable.Cell numeric>{Math.round(alert.theoreticalGrams)}g</DataTable.Cell>
                  <DataTable.Cell numeric>{Math.round(alert.realGrams)}g</DataTable.Cell>
                  <DataTable.Cell numeric>
                    <Text
                      variant="bodySmall"
                      style={{
                        color:
                          alert.alertType === 'LOSS'
                            ? '#D32F2F'
                            : alert.alertType === 'SURPLUS'
                              ? '#F57C00'
                              : '#388E3C',
                        fontWeight: '600',
                      }}
                    >
                      {alert.differencePercent > 0 ? '+' : ''}
                      {alert.differencePercent.toFixed(1)}%
                    </Text>
                  </DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable>
          )}

          {alerts.length > 0 && (
            <View style={styles.summary}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Total alertas: {alerts.length} | Perdidas: {alerts.filter((a) => a.alertType === 'LOSS').length} | Sobrantes: {alerts.filter((a) => a.alertType === 'SURPLUS').length} | OK: {alerts.filter((a) => a.alertType === 'OK').length}
              </Text>
            </View>
          )}
        </>
      )}

      <View style={{ height: 80 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginTop: 16,
    marginBottom: 4,
  },
  segments: {
    marginBottom: 16,
  },
  summary: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
  },
});
