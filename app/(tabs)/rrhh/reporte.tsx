import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Card, Text, Button, TextInput, Chip, Divider, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useDI } from '../../../src/di/providers';
import { Attendance } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';
import { toISODate, formatDate, getWeekRange } from '../../../src/utils/dates';
type AttendanceStatus = 'presente' | 'ausente' | 'tarde';

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  presente: '#388E3C',
  ausente: '#D32F2F',
  tarde: '#F57C00',
};

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  tarde: 'Tarde',
};

export default function ReporteDiarioScreen() {
  const theme = useTheme();
  const { workers, loading: workersLoading, loadWorkers } = useWorkerStore();
  const { selectedStoreId } = useAppStore();
  const { saleService, attendanceRepo } = useDI();

  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [incidencias, setIncidencias] = useState('');
  const [daySales, setDaySales] = useState(0);
  const [dayPortions, setDayPortions] = useState(0);
  const [dayAvgTicket, setDayAvgTicket] = useState(0);
  const [loadingSales, setLoadingSales] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // H6: Historico laboral
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [workerHistory, setWorkerHistory] = useState<Attendance[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const today = new Date();
  const todayISO = toISODate(today);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const loadSalesData = useCallback(async () => {
    setLoadingSales(true);
    try {
      const summary = await saleService.getDailySummary(selectedStoreId, todayISO);
      setDaySales(summary.totalAmount);
      const count = summary.salesCount;
      setDayPortions(summary.totalAmount > 0 ? count : 0);
      setDayAvgTicket(count > 0 ? Math.round(summary.totalAmount / count) : 0);
    } catch {
      // keep defaults
    } finally {
      setLoadingSales(false);
    }
  }, [selectedStoreId, saleService, todayISO]);

  useEffect(() => {
    loadSalesData();
  }, [loadSalesData]);

  const activeWorkers = workers.filter((w) => w.isActive);

  const toggleStatus = useCallback((workerId: string) => {
    setAttendanceMap((prev) => {
      const current = prev[workerId] ?? 'presente';
      const next: AttendanceStatus =
        current === 'presente' ? 'tarde' : current === 'tarde' ? 'ausente' : 'presente';
      return { ...prev, [workerId]: next };
    });
  }, []);

  const getStatus = (workerId: string): AttendanceStatus => {
    return attendanceMap[workerId] ?? 'presente';
  };

  const presentCount = activeWorkers.filter((w) => getStatus(w.id) === 'presente').length;
  const lateCount = activeWorkers.filter((w) => getStatus(w.id) === 'tarde').length;
  const absentCount = activeWorkers.filter((w) => getStatus(w.id) === 'ausente').length;

  // H6: Load worker history
  useEffect(() => {
    if (!selectedWorkerId) { setWorkerHistory([]); return; }
    (async () => {
      setLoadingHistory(true);
      try {
        // Last 30 days
        const end = toISODate(new Date());
        const start = toISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const history = await attendanceRepo.getByWorkerDateRange(selectedWorkerId, start, end);
        setWorkerHistory(history);
      } catch { setWorkerHistory([]); }
      finally { setLoadingHistory(false); }
    })();
  }, [selectedWorkerId, attendanceRepo]);

  const handleSubmit = useCallback(() => {
    Alert.alert(
      'Reporte Enviado',
      `Reporte del ${formatDate(today)} enviado correctamente.\n\n` +
        `Presentes: ${presentCount}\n` +
        `Tarde: ${lateCount}\n` +
        `Ausentes: ${absentCount}\n` +
        `Ventas: ${formatCOP(daySales)}`,
      [{ text: 'OK' }],
    );
  }, [today, presentCount, lateCount, absentCount, daySales]);

  if (workersLoading) {
    return <LoadingIndicator message="Cargando datos..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDate(today)}
        </Text>
      </View>

      {/* Section A: Asistencia */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Asistencia
      </Text>
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          {activeWorkers.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              No hay trabajadores activos
            </Text>
          ) : (
            activeWorkers.map((worker) => {
              const status = getStatus(worker.id);
              return (
                <View key={worker.id} style={styles.workerRow}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {worker.name}
                  </Text>
                  <Chip
                    compact
                    onPress={() => toggleStatus(worker.id)}
                    textStyle={{ fontSize: 11, color: '#FFFFFF' }}
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  >
                    {STATUS_LABELS[status]}
                  </Chip>
                </View>
              );
            })
          )}
        </Card.Content>
      </Card>

      {/* Section B: Ventas del dia */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Ventas del Dia
      </Text>
      {loadingSales ? (
        <LoadingIndicator message="Cargando ventas..." />
      ) : (
        <View style={styles.kpiRow}>
          <KpiCard icon="cash" label="Total Ventas" value={formatCOP(daySales)} color="#388E3C" />
          <KpiCard icon="receipt" label="Ticket Prom." value={formatCOP(dayAvgTicket)} color="#1976D2" />
        </View>
      )}

      {/* Section C: Incidencias */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Incidencias
      </Text>
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <TextInput
            mode="outlined"
            label="Notas sobre incidencias del dia"
            value={incidencias}
            onChangeText={setIncidencias}
            multiline
            numberOfLines={4}
            style={styles.textArea}
          />
        </Card.Content>
      </Card>

      {/* Section D: Resumen */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Resumen
      </Text>
      <Card style={[styles.card, { backgroundColor: '#1E1E1E' }]} mode="elevated">
        <Card.Content>
          <View style={styles.summaryRow}>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Fecha:</Text>
            <Text variant="bodySmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>
              {formatDate(today)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Presentes:</Text>
            <Text variant="bodySmall" style={{ color: '#388E3C', fontWeight: '600' }}>
              {presentCount}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Tarde:</Text>
            <Text variant="bodySmall" style={{ color: '#F57C00', fontWeight: '600' }}>
              {lateCount}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Ausentes:</Text>
            <Text variant="bodySmall" style={{ color: '#D32F2F', fontWeight: '600' }}>
              {absentCount}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Ventas del dia:</Text>
            <Text variant="bodySmall" style={{ color: '#388E3C', fontWeight: '600' }}>
              {formatCOP(daySales)}
            </Text>
          </View>
          {incidencias.trim().length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Incidencias:</Text>
              <Text variant="bodySmall" style={{ color: '#F5F0EB', marginTop: 4 }}>
                {incidencias.trim()}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Submit Button */}
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitBtn}
        icon="send"
      >
        Enviar Reporte
      </Button>

      {/* H6: Historico Laboral */}
      <Divider style={{ marginVertical: 16 }} />
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Historico Laboral
      </Text>
      <SearchableSelect
        options={activeWorkers.map((w) => ({ value: w.id, label: w.name }))}
        selectedValue={selectedWorkerId}
        placeholder="Seleccionar trabajador"
        icon="account"
        onSelect={setSelectedWorkerId}
      />

      {loadingHistory && <LoadingIndicator message="Cargando historico..." />}

      {selectedWorkerId && workerHistory.length > 0 && (
        <Card style={[styles.card, { marginTop: 8 }]} mode="elevated">
          <Card.Content>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
              Ultimos 30 dias — {workerHistory.length} registros
            </Text>
            {(() => {
              const totalHours = workerHistory.reduce((s, a) => s + a.actualHours, 0);
              const totalPay = workerHistory.reduce((s, a) => s + a.subtotal, 0);
              return (
                <>
                  <View style={styles.summaryRow}>
                    <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Total Horas</Text>
                    <Text variant="bodySmall" style={{ color: '#F5F0EB', fontWeight: '600' }}>{totalHours}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>Total Bruto</Text>
                    <Text variant="bodySmall" style={{ color: '#388E3C', fontWeight: '600' }}>{formatCOP(totalPay)}</Text>
                  </View>
                  <Divider style={{ marginVertical: 8 }} />
                  {workerHistory.slice(0, 10).map((a) => (
                    <View key={a.id} style={styles.summaryRow}>
                      <Text variant="bodySmall" style={{ color: '#999' }}>{a.date}</Text>
                      <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>{a.actualHours}h — {formatCOP(a.subtotal)}</Text>
                    </View>
                  ))}
                  {workerHistory.length > 10 && (
                    <Text variant="bodySmall" style={{ color: '#666', marginTop: 4 }}>
                      ...y {workerHistory.length - 10} registros mas
                    </Text>
                  )}
                </>
              );
            })()}
          </Card.Content>
        </Card>
      )}

      <View style={{ height: 100 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
  workerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 80,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  submitBtn: {
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
