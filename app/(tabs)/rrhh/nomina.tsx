import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Text, Divider, SegmentedButtons, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { PayrollSummary } from '../../../src/components/rrhh/PayrollSummary';
import { useDI } from '../../../src/di/providers';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { PayrollEntry, Worker } from '../../../src/domain/entities';
import { PayrollReport } from '../../../src/services/PayrollService';
import { formatCOP } from '../../../src/utils/currency';
import { toISODate, getWeekRange, formatDate } from '../../../src/utils/dates';

type PeriodType = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';

function getPeriodRange(type: PeriodType): { start: Date; end: Date } {
  const now = new Date();
  if (type === 'SEMANAL') {
    return getWeekRange(now);
  } else if (type === 'QUINCENAL') {
    const day = now.getDate();
    const start = new Date(now.getFullYear(), now.getMonth(), day <= 15 ? 1 : 16);
    const end = new Date(now.getFullYear(), now.getMonth(), day <= 15 ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    return { start, end };
  } else {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end };
  }
}

export default function NominaScreen() {
  const theme = useTheme();
  const { payrollService } = useDI();
  const { workers, loadWorkers } = useWorkerStore();

  const [report, setReport] = useState<PayrollReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<PeriodType>('SEMANAL');

  const loadPayroll = useCallback(async () => {
    setLoading(true);
    try {
      await loadWorkers();
      const { start, end } = getPeriodRange(periodType);
      const data = await payrollService.generateReport(
        toISODate(start),
        toISODate(end),
      );
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [payrollService, loadWorkers, periodType]);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  if (loading) {
    return <LoadingIndicator message="Calculando nomina..." />;
  }

  const workerMap = new Map(workers.map((w) => [w.id, w]));

  return (
    <ScreenContainer>
      {/* H5: Period type selector */}
      <SegmentedButtons
        value={periodType}
        onValueChange={(v) => setPeriodType(v as PeriodType)}
        buttons={[
          { value: 'SEMANAL', label: 'Semanal' },
          { value: 'QUINCENAL', label: 'Quincenal' },
          { value: 'MENSUAL', label: 'Mensual' },
        ]}
        density="small"
        style={{ marginBottom: 12 }}
      />

      {report && (
        <>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            Periodo: {formatDate(report.periodStart)} - {formatDate(report.periodEnd)}
          </Text>

          <PayrollSummary
            totalGross={report.totalGross}
            totalDeductions={report.totalDeductions}
            totalNet={report.totalNet}
            workerCount={report.entries.length}
          />

          <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
            Detalle por Trabajador
          </Text>

          {report.entries.length === 0 ? (
            <EmptyState icon="account-off" title="Sin registros" subtitle="No hay datos de nomina para este periodo" />
          ) : (
            report.entries.map((entry) => {
              const worker = workerMap.get(entry.workerId);
              return (
                <Card key={entry.id} style={styles.card} mode="elevated">
                  <Card.Content>
                    <Text variant="titleSmall" style={{ fontWeight: '600' }}>
                      {worker?.name ?? entry.workerId}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                      {worker?.role ?? ''}
                    </Text>
                    <View style={styles.detailRow}>
                      <Text variant="bodySmall">Horas</Text>
                      <Text variant="bodySmall" style={{ fontWeight: '600' }}>{entry.totalHours}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text variant="bodySmall">Bruto</Text>
                      <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(entry.grossPay)}</Text>
                    </View>
                    {entry.deductions > 0 && (
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall">Deducciones</Text>
                        <Text variant="bodySmall" style={{ fontWeight: '600', color: theme.colors.error }}>
                          -{formatCOP(entry.deductions)}
                        </Text>
                      </View>
                    )}
                    <Divider style={{ marginVertical: 4 }} />
                    <View style={styles.detailRow}>
                      <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Neto</Text>
                      <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                        {formatCOP(entry.netPay)}
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
              );
            })
          )}
        </>
      )}

      {!report && (
        <EmptyState icon="currency-usd-off" title="Sin datos" subtitle="No se pudo calcular la nomina" />
      )}

      <View style={{ height: 80 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
});
