import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Divider, SegmentedButtons, useTheme, Button, TextInput, Chip, Portal, Snackbar } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { PayrollSummary } from '../../../src/components/rrhh/PayrollSummary';
import { useDI } from '../../../src/di/providers';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { PayrollEntry, PeriodStatus, PeriodType } from '../../../src/domain/entities';
import { PayrollReport } from '../../../src/services/PayrollService';
import { formatCOP } from '../../../src/utils/currency';
import { todayColombia, toISODate, formatDate } from '../../../src/utils/dates';

function getPeriodRange(type: PeriodType): { startDate: string; endDate: string } {
  const today = new Date(`${todayColombia()}T12:00:00-05:00`);
  if (type === 'SEMANAL') {
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(today);
    start.setDate(today.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: toISODate(start), endDate: toISODate(end) };
  }

  if (type === 'QUINCENAL') {
    const day = today.getDate();
    const start = new Date(today.getFullYear(), today.getMonth(), day <= 15 ? 1 : 16);
    const end = new Date(today.getFullYear(), today.getMonth() + (day <= 15 ? 0 : 1), day <= 15 ? 15 : 0);
    return { startDate: toISODate(start), endDate: toISODate(end) };
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

function applyDeduction(entry: PayrollEntry, rawValue: string): PayrollEntry {
  const parsed = Number(rawValue || 0);
  const debtDeduction = Math.max(0, Math.min(Number.isFinite(parsed) ? parsed : 0, entry.activeDebt, entry.grossPay));
  return {
    ...entry,
    debtDeduction,
    deductions: debtDeduction,
    netPay: entry.grossPay - debtDeduction,
  };
}

function withTotals(report: PayrollReport, deductionValues: Record<string, string>): PayrollReport {
  const entries = report.entries.map((entry) => (
    applyDeduction(entry, deductionValues[entry.workerId] ?? String(entry.debtDeduction))
  ));
  return {
    ...report,
    entries,
    totalGross: entries.reduce((sum, entry) => sum + entry.grossPay, 0),
    totalDeductions: entries.reduce((sum, entry) => sum + entry.deductions, 0),
    totalNet: entries.reduce((sum, entry) => sum + entry.netPay, 0),
  };
}

const STATUS_LABELS: Record<PeriodStatus, string> = {
  BORRADOR: 'Borrador',
  CERRADA: 'Cerrada',
  PAGADA: 'Pagada',
};

export default function NominaScreen() {
  const theme = useTheme();
  const { payrollService } = useDI();
  const { selectedStoreId } = useAppStore();
  const { workers, loadWorkers } = useWorkerStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [report, setReport] = useState<PayrollReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>('SEMANAL');
  const [deductionValues, setDeductionValues] = useState<Record<string, string>>({});

  const loadPayroll = useCallback(async () => {
    if (!selectedStoreId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await loadWorkers(selectedStoreId);
      const { startDate, endDate } = getPeriodRange(periodType);
      const data = await payrollService.generateReport(
        selectedStoreId,
        periodType,
        startDate,
        endDate,
      );
      setReport(data);
      setDeductionValues(Object.fromEntries(
        data.entries.map((entry) => [entry.workerId, String(entry.debtDeduction)]),
      ));
    } catch {
      setReport(null);
      showError('No se pudo calcular la nomina');
    } finally {
      setLoading(false);
    }
  }, [loadWorkers, payrollService, periodType, selectedStoreId, showError]);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  const editableReport = useMemo(() => (
    report ? withTotals(report, deductionValues) : null
  ), [deductionValues, report]);

  const workerMap = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  const handleSave = useCallback(async (status: PeriodStatus) => {
    if (!editableReport) return;
    setSaving(true);
    try {
      await payrollService.saveReport(editableReport, status);
      showSuccess(status === 'CERRADA' ? 'Nomina cerrada' : 'Borrador guardado');
      await loadPayroll();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'No se pudo guardar la nomina');
    } finally {
      setSaving(false);
    }
  }, [editableReport, loadPayroll, payrollService, showError, showSuccess]);

  const handlePay = useCallback(async () => {
    if (!editableReport) return;
    setSaving(true);
    try {
      await payrollService.payReport(editableReport);
      showSuccess('Nomina pagada y cartera actualizada');
      await loadPayroll();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'No se pudo pagar la nomina');
    } finally {
      setSaving(false);
    }
  }, [editableReport, loadPayroll, payrollService, showError, showSuccess]);

  if (loading) {
    return <LoadingIndicator message="Calculando nomina..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        {editableReport && (
          <Chip compact icon="file-document-check">
            {STATUS_LABELS[editableReport.status]}
          </Chip>
        )}
      </View>

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

      {editableReport ? (
        <>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            Periodo: {formatDate(editableReport.periodStart)} - {formatDate(editableReport.periodEnd)}
          </Text>

          <PayrollSummary
            totalGross={editableReport.totalGross}
            totalDeductions={editableReport.totalDeductions}
            totalNet={editableReport.totalNet}
            workerCount={editableReport.entries.length}
          />

          <View style={styles.actionRow}>
            <Button
              mode="outlined"
              icon="content-save"
              onPress={() => handleSave('BORRADOR')}
              disabled={saving || editableReport.status !== 'BORRADOR'}
              style={styles.actionButton}
            >
              Guardar
            </Button>
            <Button
              mode="outlined"
              icon="lock"
              onPress={() => handleSave('CERRADA')}
              disabled={saving || editableReport.status !== 'BORRADOR'}
              style={styles.actionButton}
            >
              Cerrar
            </Button>
            <Button
              mode="contained"
              icon="cash-check"
              onPress={handlePay}
              loading={saving}
              disabled={saving || editableReport.status === 'PAGADA' || editableReport.entries.length === 0}
              style={styles.actionButton}
            >
              Pagar
            </Button>
          </View>

          <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
            Detalle por Trabajador
          </Text>

          {editableReport.entries.length === 0 ? (
            <EmptyState icon="account-off" title="Sin registros" subtitle="No hay asistencia confirmada para este periodo" />
          ) : (
            editableReport.entries.map((entry) => {
              const worker = workerMap.get(entry.workerId);
              const canEdit = editableReport.status === 'BORRADOR';
              return (
                <Card key={entry.id} style={styles.card} mode="elevated">
                  <Card.Content>
                    <Text variant="titleSmall" style={{ fontWeight: '600' }}>
                      {worker?.name ?? entry.workerId}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                      {worker?.role ?? ''}{entry.notes ? ` · ${entry.notes}` : ''}
                    </Text>
                    <View style={styles.detailRow}>
                      <Text variant="bodySmall">Horas</Text>
                      <Text variant="bodySmall" style={{ fontWeight: '600' }}>{entry.totalHours}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text variant="bodySmall">Bruto</Text>
                      <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(entry.grossPay)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text variant="bodySmall">Deuda activa</Text>
                      <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(entry.activeDebt)}</Text>
                    </View>
                    <TextInput
                      label="Descuento cartera"
                      value={deductionValues[entry.workerId] ?? '0'}
                      onChangeText={(text) => setDeductionValues((current) => ({
                        ...current,
                        [entry.workerId]: text.replace(/[^0-9]/g, ''),
                      }))}
                      mode="outlined"
                      dense
                      keyboardType="numeric"
                      disabled={!canEdit || entry.activeDebt <= 0}
                      right={<TextInput.Affix text="COP" />}
                      style={{ marginVertical: 8 }}
                    />
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
      ) : (
        <EmptyState icon="currency-usd-off" title="Sin datos" subtitle="No se pudo calcular la nomina" />
      )}

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

      <View style={{ height: 80 }} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
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
