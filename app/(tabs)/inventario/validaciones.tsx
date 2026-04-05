import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, Button, SegmentedButtons, Portal, Snackbar, IconButton, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { CalendarPickerModal } from '../../../src/components/common/CalendarPickerModal';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { DailyAlert } from '../../../src/domain/entities';
import { toISODate, nowColombia, todayColombia, formatDate } from '../../../src/utils/dates';

const ALERT_CONFIG: Record<string, { color: string; label: string }> = {
  LOSS: { color: '#D32F2F', label: 'Perdida' },
  SURPLUS: { color: '#F57C00', label: 'Sobrante' },
  OK: { color: '#388E3C', label: 'OK' },
};

const RANGE_BUTTONS = [
  { value: 'today', label: 'Hoy' },
  { value: 'day', label: 'Dia', icon: 'calendar' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: '30 dias' },
];

export default function ValidacionesScreen() {
  const theme = useTheme();
  const { alertService, cashClosingService } = useDI();
  const { selectedStoreId } = useAppStore();
  const { supplies: cachedSupplies } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [alerts, setAlerts] = useState<DailyAlert[]>([]);
  const [supplyNames, setSupplyNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [range, setRange] = useState('today');
  const [selectedDay, setSelectedDay] = useState(todayColombia());
  const [calendarVisible, setCalendarVisible] = useState(false);

  const loadValidations = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      setSupplyNames(new Map(cachedSupplies.map((s) => [s.id, s.name])));

      const now = nowColombia();
      const endDate = toISODate(now);

      let startDate: string;
      let queryEndDate = endDate;

      if (range === 'today') {
        startDate = endDate;
      } else if (range === 'day') {
        startDate = selectedDay;
        queryEndDate = selectedDay;
      } else if (range === 'week') {
        startDate = toISODate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      } else {
        startDate = toISODate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      }

      if (range === 'today' || range === 'day') {
        const data = await alertService.getDailyAlerts(selectedStoreId, startDate);
        setAlerts(data);
      } else {
        const data = await alertService.getAlertHistory(selectedStoreId, startDate, queryEndDate);
        setAlerts(data);
      }
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, range, selectedDay, alertService, cachedSupplies]);

  useEffect(() => {
    loadValidations();
  }, [loadValidations]);

  const handleRangeChange = (value: string) => {
    if (value === 'day') {
      setCalendarVisible(true);
    }
    setRange(value);
  };

  const handleDaySelected = (date: string) => {
    setSelectedDay(date);
    setCalendarVisible(false);
  };

  const handleRegenerate = useCallback(async () => {
    if (!selectedStoreId) return;
    setRegenerating(true);
    try {
      const targetDate = range === 'day' ? selectedDay : todayColombia();
      await cashClosingService.regenerateAlerts(selectedStoreId, targetDate);
      await loadValidations();
      showSuccess('Alertas regeneradas correctamente');
    } catch {
      showError('No se pudieron regenerar las alertas');
    } finally {
      setRegenerating(false);
    }
  }, [selectedStoreId, range, selectedDay, cashClosingService, loadValidations, showSuccess, showError]);

  const losses = alerts.filter((a) => a.alertType === 'LOSS').length;
  const surpluses = alerts.filter((a) => a.alertType === 'SURPLUS').length;
  const oks = alerts.filter((a) => a.alertType === 'OK').length;

  return (
    <ScreenContainer scrollable padded>
      <StoreSelector />

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Validaciones de Inventario
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        Inventario final teorico vs conteo fisico real
      </Text>

      <SegmentedButtons
        value={range}
        onValueChange={handleRangeChange}
        buttons={RANGE_BUTTONS}
        style={styles.segments}
      />

      {/* Selected day indicator */}
      {range === 'day' && (
        <Pressable style={styles.dayIndicator} onPress={() => setCalendarVisible(true)}>
          <IconButton icon="calendar" iconColor="#E63946" size={18} style={{ margin: 0 }} />
          <Text variant="bodyMedium" style={styles.dayIndicatorText}>
            {formatDate(selectedDay)}
          </Text>
          <Text variant="bodySmall" style={{ color: '#777' }}>Cambiar</Text>
        </Pressable>
      )}

      <CalendarPickerModal
        visible={calendarVisible}
        selectedDate={selectedDay}
        maxDate={todayColombia()}
        onSelect={handleDaySelected}
        onDismiss={() => setCalendarVisible(false)}
      />

      {loading ? (
        <LoadingIndicator message="Cargando validaciones..." />
      ) : (
        <>
          {/* Summary KPIs */}
          {alerts.length > 0 && (
            <View style={styles.kpiRow}>
              <View style={[styles.kpiCard, { borderLeftColor: '#D32F2F', borderLeftWidth: 3 }]}>
                <Text style={[styles.kpiValue, { color: '#D32F2F' }]}>{losses}</Text>
                <Text style={styles.kpiLabel}>Perdidas</Text>
              </View>
              <View style={[styles.kpiCard, { borderLeftColor: '#F57C00', borderLeftWidth: 3 }]}>
                <Text style={[styles.kpiValue, { color: '#F57C00' }]}>{surpluses}</Text>
                <Text style={styles.kpiLabel}>Sobrantes</Text>
              </View>
              <View style={[styles.kpiCard, { borderLeftColor: '#388E3C', borderLeftWidth: 3 }]}>
                <Text style={[styles.kpiValue, { color: '#388E3C' }]}>{oks}</Text>
                <Text style={styles.kpiLabel}>OK</Text>
              </View>
            </View>
          )}

          {alerts.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Sin alertas"
              subtitle="No se encontraron validaciones para este periodo. Las alertas se generan automaticamente al hacer cierre de caja."
            />
          ) : (
            <>
              {/* Column headers */}
              <View style={styles.headerRow}>
                <Text style={[styles.headerText, { flex: 1 }]}>Insumo</Text>
                <Text style={[styles.headerText, styles.headerRight]}>Teorico</Text>
                <Text style={[styles.headerText, styles.headerRight]}>Real</Text>
                <Text style={[styles.headerText, styles.headerRight]}>Desvio</Text>
              </View>

              {/* Alert rows */}
              {alerts.map((alert) => {
                const config = ALERT_CONFIG[alert.alertType] ?? ALERT_CONFIG.OK;
                const name = supplyNames.get(alert.supplyId) ?? 'Insumo';
                const diffSign = alert.differenceGrams > 0 ? '+' : '';
                const pctSign = alert.differencePercent > 0 ? '+' : '';

                return (
                  <View
                    key={alert.id}
                    style={[
                      styles.alertRow,
                      { borderLeftWidth: 3, borderLeftColor: config.color },
                    ]}
                  >
                    {/* Supply name + alert type */}
                    <View style={styles.alertInfo}>
                      <Text variant="bodyMedium" style={styles.alertName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.alertTypeLabel, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </View>

                    {/* Theoretical */}
                    <View style={styles.alertCol}>
                      <Text variant="bodySmall" style={styles.alertValue}>
                        {Math.round(alert.theoreticalGrams)}
                      </Text>
                      <Text style={styles.alertUnit}>g</Text>
                    </View>

                    {/* Real */}
                    <View style={styles.alertCol}>
                      <Text variant="bodySmall" style={styles.alertValue}>
                        {Math.round(alert.realGrams)}
                      </Text>
                      <Text style={styles.alertUnit}>g</Text>
                    </View>

                    {/* Difference */}
                    <View style={styles.alertCol}>
                      <Text
                        variant="bodySmall"
                        style={[styles.alertValue, { color: config.color, fontWeight: '700' }]}
                      >
                        {diffSign}{Math.round(alert.differenceGrams)}g
                      </Text>
                      <Text style={[styles.alertPct, { color: config.color }]}>
                        {pctSign}{alert.differencePercent.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* Regenerate button */}
          <Button
            mode="contained-tonal"
            onPress={handleRegenerate}
            loading={regenerating}
            disabled={regenerating || loading}
            icon="refresh"
            style={styles.regenerateBtn}
          >
            Regenerar alertas
          </Button>
        </>
      )}

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
  sectionTitle: {
    marginTop: 16,
    marginBottom: 4,
  },
  segments: {
    marginBottom: 12,
  },
  dayIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 12,
    gap: 4,
  },
  dayIndicatorText: {
    flex: 1,
    color: '#F5F0EB',
    fontWeight: '600',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  kpiLabel: {
    fontSize: 10,
    color: '#777',
    marginTop: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 10,
    color: '#777',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  headerRight: {
    width: 64,
    textAlign: 'right',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  alertInfo: {
    flex: 1,
    marginRight: 8,
  },
  alertName: {
    color: '#F5F0EB',
    fontWeight: '600',
  },
  alertTypeLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  alertCol: {
    alignItems: 'flex-end',
    width: 64,
  },
  alertValue: {
    color: '#F5F0EB',
    fontWeight: '600',
    fontSize: 13,
  },
  alertUnit: {
    fontSize: 9,
    color: '#777',
  },
  alertPct: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  regenerateBtn: {
    marginTop: 16,
    borderRadius: 8,
  },
});
