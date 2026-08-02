import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import { Card, Text, Divider, SegmentedButtons, useTheme, Button, TextInput, Chip, Portal, Snackbar, IconButton } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { PayrollSummary } from '../../../src/components/rrhh/PayrollSummary';
import { useDI } from '../../../src/di/providers';
import { useWorkerStore } from '../../../src/stores/useWorkerStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { PayrollEntry, PayrollPeriod, PeriodStatus, PeriodType } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { PayrollReport } from '../../../src/services/PayrollService';
import { formatCOP } from '../../../src/utils/currency';
import { todayColombia, formatDate } from '../../../src/utils/dates';

function getPeriodRange(type: PeriodType): { startDate: string; endDate: string } {
  const today = new Date(`${todayColombia()}T12:00:00-05:00`);
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  if (day <= 15) {
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-15`;
    return { startDate: startStr, endDate: endStr };
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-16`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate: startStr, endDate: endStr };
  }
}

function applyCustomizations(
  entry: PayrollEntry,
  rawDeduction?: string,
  rawHours?: string,
  customNotes?: string,
  payMethod?: PaymentMethod,
  debtMethod?: PaymentMethod,
): PayrollEntry {
  const parsedHours = Number(rawHours);
  const totalHours = Math.max(0, Number.isFinite(parsedHours) ? parsedHours : 0);
  const grossPay = rawHours !== undefined && rawHours !== ''
    ? Math.round(totalHours * entry.hourlyRate)
    : entry.grossPay;

  const parsedDeduction = Number(rawDeduction || 0);
  const debtDeduction = Math.max(0, Math.min(Number.isFinite(parsedDeduction) ? parsedDeduction : 0, entry.activeDebt, grossPay));
  const notes = customNotes !== undefined ? customNotes : entry.notes;

  return {
    ...entry,
    totalHours,
    grossPay,
    debtDeduction,
    deductions: debtDeduction,
    netPay: grossPay - debtDeduction,
    notes: notes?.trim() || undefined,
    paymentMethod: payMethod ?? entry.paymentMethod ?? PaymentMethod.EFECTIVO,
    debtPaymentMethod: debtMethod ?? entry.debtPaymentMethod ?? PaymentMethod.EFECTIVO,
  };
}

function withTotals(
  report: PayrollReport,
  deductionValues: Record<string, string>,
  hoursValues: Record<string, string>,
  notesValues: Record<string, string>,
  paymentMethodValues: Record<string, PaymentMethod>,
  debtPaymentMethodValues: Record<string, PaymentMethod>,
  removedWorkerIds: string[],
): PayrollReport {
  const filteredEntries = report.entries.filter((entry) => !removedWorkerIds.includes(entry.workerId));
  const entries = filteredEntries.map((entry) =>
    applyCustomizations(
      entry,
      deductionValues[entry.workerId] ?? String(entry.debtDeduction),
      hoursValues[entry.workerId],
      notesValues[entry.workerId],
      paymentMethodValues[entry.workerId],
      debtPaymentMethodValues[entry.workerId],
    )
  );

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
  const { selectedStoreId, userRole } = useAppStore();
  const { workers, loadWorkers } = useWorkerStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const canEditOrDelete = userRole === 'GERENTE' || userRole === 'ADMIN_LOCAL';

  const [activeTab, setActiveTab] = useState<'ACTUAL' | 'HISTORICO'>('ACTUAL');
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Locked strictly to QUINCENAL
  const periodType: PeriodType = 'QUINCENAL';

  const [deductionValues, setDeductionValues] = useState<Record<string, string>>({});
  const [hoursValues, setHoursValues] = useState<Record<string, string>>({});
  const [notesValues, setNotesValues] = useState<Record<string, string>>({});
  const [paymentMethodValues, setPaymentMethodValues] = useState<Record<string, PaymentMethod>>({});
  const [debtPaymentMethodValues, setDebtPaymentMethodValues] = useState<Record<string, PaymentMethod>>({});
  const [removedWorkerIds, setRemovedWorkerIds] = useState<string[]>([]);

  // History state
  const [historyPeriods, setHistoryPeriods] = useState<PayrollPeriod[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadPayroll = useCallback(async (customStartDate?: string, customEndDate?: string) => {
    if (!selectedStoreId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await loadWorkers(selectedStoreId);
      const { startDate, endDate } = customStartDate && customEndDate
        ? { startDate: customStartDate, endDate: customEndDate }
        : getPeriodRange(periodType);

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
      setHoursValues(Object.fromEntries(
        data.entries.map((entry) => [entry.workerId, String(entry.totalHours)]),
      ));
      setNotesValues(Object.fromEntries(
        data.entries.map((entry) => [entry.workerId, entry.notes ?? '']),
      ));
      setPaymentMethodValues(Object.fromEntries(
        data.entries.map((entry) => [entry.workerId, entry.paymentMethod ?? PaymentMethod.EFECTIVO]),
      ));
      setDebtPaymentMethodValues(Object.fromEntries(
        data.entries.map((entry) => [entry.workerId, entry.debtPaymentMethod ?? PaymentMethod.EFECTIVO]),
      ));
      setRemovedWorkerIds([]);
    } catch {
      setReport(null);
      showError('No se pudo calcular la nomina');
    } finally {
      setLoading(false);
    }
  }, [loadWorkers, payrollService, periodType, selectedStoreId, showError]);

  const loadHistory = useCallback(async () => {
    if (!selectedStoreId) return;
    setHistoryLoading(true);
    try {
      const list = await payrollService.getPeriodsByStore(selectedStoreId);
      setHistoryPeriods(list);
    } catch {
      showError('No se pudo cargar el historial de nóminas');
    } finally {
      setHistoryLoading(false);
    }
  }, [payrollService, selectedStoreId, showError]);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  useEffect(() => {
    if (activeTab === 'HISTORICO') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  const editableReport = useMemo(() => (
    report ? withTotals(report, deductionValues, hoursValues, notesValues, paymentMethodValues, debtPaymentMethodValues, removedWorkerIds) : null
  ), [deductionValues, hoursValues, notesValues, paymentMethodValues, debtPaymentMethodValues, removedWorkerIds, report]);

  const workerMap = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  const handleSave = useCallback(async (status: PeriodStatus) => {
    if (!editableReport) return;
    setSaving(true);
    try {
      await payrollService.saveReport(editableReport, status);
      showSuccess(status === 'CERRADA' ? 'Nómina cerrada' : 'Borrador guardado');
      await loadPayroll();
      await loadHistory();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'No se pudo guardar la nómina');
    } finally {
      setSaving(false);
    }
  }, [editableReport, loadHistory, loadPayroll, payrollService, showError, showSuccess]);

  const handlePay = useCallback(async () => {
    if (!editableReport) return;
    const confirmMsg = `¿Seguro que deseas efectuar el pago de nómina para ${editableReport.entries.length} trabajador(es) con los métodos de pago configurados?`;
    const doPay = async () => {
      setSaving(true);
      try {
        await payrollService.payReport(editableReport);
        showSuccess('Nómina pagada y cartera actualizada con éxito');
        await loadPayroll();
        await loadHistory();
      } catch (error) {
        showError(error instanceof Error ? error.message : 'No se pudo pagar la nómina');
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doPay();
    } else {
      Alert.alert('Pagar Nómina', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Pagar Nómina', style: 'destructive', onPress: doPay },
      ]);
    }
  }, [editableReport, loadHistory, loadPayroll, payrollService, showError, showSuccess]);

  const handleRemoveEntry = useCallback((workerName: string, workerId: string) => {
    const confirmMsg = `¿Seguro que deseas quitar el registro de nómina de ${workerName}?`;
    const doRemove = () => {
      setRemovedWorkerIds((current) => [...current, workerId]);
      showSuccess(`Registro de ${workerName} quitado de la nómina.`);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doRemove();
    } else {
      Alert.alert('Quitar Registro', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: doRemove },
      ]);
    }
  }, [showSuccess]);

  const handleDeletePeriod = useCallback(async () => {
    if (!editableReport?.periodId) {
      setRemovedWorkerIds([]);
      setHoursValues({});
      setNotesValues({});
      await loadPayroll();
      showSuccess('Borrador restablecido.');
      return;
    }

    const confirmMsg = `¿Seguro que deseas eliminar el borrador de nómina de este período (${editableReport.periodStart} a ${editableReport.periodEnd})?`;
    const doDelete = async () => {
      setSaving(true);
      try {
        await payrollService.deletePeriod(editableReport.periodId!);
        showSuccess('Borrador de nómina eliminado');
        setRemovedWorkerIds([]);
        setHoursValues({});
        setNotesValues({});
        await loadPayroll();
        await loadHistory();
      } catch {
        showError('No se pudo eliminar el período de nómina');
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doDelete();
    } else {
      Alert.alert('Eliminar Nómina', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [editableReport, loadHistory, loadPayroll, payrollService, showError, showSuccess]);

  if (loading && activeTab === 'ACTUAL') {
    return <LoadingIndicator message="Calculando nómina..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        {activeTab === 'ACTUAL' && editableReport && (
          <Chip compact icon="file-document-check">
            {STATUS_LABELS[editableReport.status]}
          </Chip>
        )}
      </View>

      {/* Main Tab Navigation */}
      <SegmentedButtons
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'ACTUAL' | 'HISTORICO')}
        buttons={[
          { value: 'ACTUAL', label: '📑 Nómina Quincenal' },
          { value: 'HISTORICO', label: '📜 Histórico de Nóminas' },
        ]}
        density="small"
        style={{ marginBottom: 16 }}
      />

      {activeTab === 'ACTUAL' ? (
        editableReport ? (
          <>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Período Quincenal: {formatDate(editableReport.periodStart)} - {formatDate(editableReport.periodEnd)}
            </Text>

            <PayrollSummary
              totalGross={editableReport.totalGross}
              totalDeductions={editableReport.totalDeductions}
              totalNet={editableReport.totalNet}
              workerCount={editableReport.entries.length}
            />

            <View style={styles.actionRow}>
              {canEditOrDelete && (
                <Button
                  mode="outlined"
                  icon="delete-outline"
                  textColor="#D32F2F"
                  onPress={handleDeletePeriod}
                  disabled={saving || editableReport.status === 'PAGADA'}
                  style={[styles.actionButton, { borderColor: '#D32F2F' }]}
                >
                  Borrar
                </Button>
              )}
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
              <EmptyState icon="account-off" title="Sin registros" subtitle="No hay registros de nómina para este periodo" />
            ) : (
              editableReport.entries.map((entry) => {
                const worker = workerMap.get(entry.workerId);
                const workerName = worker?.name ?? entry.workerId;
                const canEdit = canEditOrDelete && editableReport.status !== 'PAGADA';
                const currentPayMethod = entry.paymentMethod ?? PaymentMethod.EFECTIVO;
                const currentDebtMethod = entry.debtPaymentMethod ?? PaymentMethod.EFECTIVO;

                return (
                  <Card key={entry.id} style={styles.card} mode="elevated">
                    <Card.Content>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text variant="titleSmall" style={{ fontWeight: '600' }}>
                            {workerName}
                          </Text>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                            {worker?.role ?? ''}{entry.notes ? ` · ${entry.notes}` : ''}
                          </Text>
                        </View>
                        {canEditOrDelete && editableReport.status !== 'PAGADA' && (
                          <IconButton
                            icon="delete-outline"
                            size={20}
                            iconColor="#D32F2F"
                            onPress={() => handleRemoveEntry(workerName, entry.workerId)}
                          />
                        )}
                      </View>

                      {/* Editable inputs for Manager / Local Admin */}
                      {canEdit ? (
                        <View style={{ flexDirection: 'row', gap: 8, marginVertical: 4 }}>
                          <TextInput
                            label="Horas"
                            value={hoursValues[entry.workerId] ?? String(entry.totalHours)}
                            onChangeText={(text) => setHoursValues((current) => ({
                              ...current,
                              [entry.workerId]: text.replace(/[^0-9.]/g, ''),
                            }))}
                            mode="outlined"
                            dense
                            keyboardType="numeric"
                            style={{ flex: 1 }}
                          />
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
                            disabled={entry.activeDebt <= 0}
                            right={<TextInput.Affix text="COP" />}
                            style={{ flex: 1.5 }}
                          />
                        </View>
                      ) : (
                        <>
                          <View style={styles.detailRow}>
                            <Text variant="bodySmall">Horas</Text>
                            <Text variant="bodySmall" style={{ fontWeight: '600' }}>{entry.totalHours}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text variant="bodySmall">Descuento cartera</Text>
                            <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(entry.deductions)}</Text>
                          </View>
                        </>
                      )}

                      {/* Per-worker Payment Method Selector */}
                      <View style={{ marginTop: 8, padding: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, gap: 6 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}>
                          MÉTODO PAGO SALARIO (NETO):
                        </Text>
                        <SegmentedButtons
                          value={currentPayMethod}
                          onValueChange={(val) => setPaymentMethodValues((current) => ({
                            ...current,
                            [entry.workerId]: val as PaymentMethod,
                          }))}
                          density="small"
                          buttons={[
                            { value: PaymentMethod.EFECTIVO, label: '💵 Efectivo', disabled: editableReport.status === 'PAGADA' },
                            { value: PaymentMethod.TRANSFERENCIA, label: '🏦 Banco', disabled: editableReport.status === 'PAGADA' },
                            { value: PaymentMethod.MIXTO, label: '🔀 Mixto', disabled: editableReport.status === 'PAGADA' },
                          ]}
                        />

                        {entry.debtDeduction > 0 && (
                          <>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold', marginTop: 4 }}>
                              MÉTODO ABONO CARTERA (DEDUCCIÓN):
                            </Text>
                            <SegmentedButtons
                              value={currentDebtMethod}
                              onValueChange={(val) => setDebtPaymentMethodValues((current) => ({
                                ...current,
                                [entry.workerId]: val as PaymentMethod,
                              }))}
                              density="small"
                              buttons={[
                                { value: PaymentMethod.EFECTIVO, label: '💵 Efectivo', disabled: editableReport.status === 'PAGADA' },
                                { value: PaymentMethod.TRANSFERENCIA, label: '🏦 Banco', disabled: editableReport.status === 'PAGADA' },
                                { value: PaymentMethod.MIXTO, label: '🔀 Mixto', disabled: editableReport.status === 'PAGADA' },
                              ]}
                            />
                          </>
                        )}
                      </View>

                      {canEdit && (
                        <TextInput
                          label="Notas / Observaciones"
                          value={notesValues[entry.workerId] ?? ''}
                          onChangeText={(text) => setNotesValues((current) => ({
                            ...current,
                            [entry.workerId]: text,
                          }))}
                          mode="outlined"
                          dense
                          style={{ marginTop: 8, marginBottom: 4 }}
                        />
                      )}

                      <View style={[styles.detailRow, { marginTop: 6 }]}>
                        <Text variant="bodySmall">Bruto</Text>
                        <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(entry.grossPay)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall">Deuda activa</Text>
                        <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(entry.activeDebt)}</Text>
                      </View>
                      <Divider style={{ marginVertical: 4 }} />
                      <View style={styles.detailRow}>
                        <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Neto a Pagar</Text>
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
          <EmptyState icon="currency-usd-off" title="Sin datos" subtitle="No se pudo calcular la nómina" />
        )
      ) : (
        /* HISTÓRICO DE NÓMINAS TAB */
        historyLoading ? (
          <LoadingIndicator message="Cargando historial de nóminas..." />
        ) : historyPeriods.length === 0 ? (
          <EmptyState icon="history" title="Sin historial" subtitle="No hay nóminas registradas anteriormente en esta sede" />
        ) : (
          <ScrollView style={{ flex: 1 }}>
            {historyPeriods.map((period) => {
              const statusColor = period.status === 'PAGADA' ? '#4CAF50' : period.status === 'CERRADA' ? '#2196F3' : '#FF9800';
              return (
                <Card key={period.id} style={[styles.card, { backgroundColor: '#1E1E1E' }]} mode="elevated">
                  <Card.Content>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View>
                        <Text variant="titleSmall" style={{ fontWeight: 'bold', color: '#F5F0EB' }}>
                          📅 {formatDate(period.startDate)} - {formatDate(period.endDate)}
                        </Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Tipo: {period.periodType}
                        </Text>
                      </View>
                      <Chip compact style={{ backgroundColor: statusColor }} textStyle={{ color: '#FFF', fontWeight: 'bold' }}>
                        {STATUS_LABELS[period.status]}
                      </Chip>
                    </View>

                    <Divider style={{ marginVertical: 8, borderColor: 'rgba(255,255,255,0.08)' }} />

                    <View style={styles.detailRow}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Total Bruto:</Text>
                      <Text variant="bodySmall" style={{ fontWeight: '600', color: '#F5F0EB' }}>{formatCOP(period.totalGross)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Deducciones:</Text>
                      <Text variant="bodySmall" style={{ fontWeight: '600', color: '#E63946' }}>-{formatCOP(period.totalDeductions)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: '#F5F0EB' }}>Total Neto:</Text>
                      <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: '#4CAF50' }}>{formatCOP(period.totalNet)}</Text>
                    </View>

                    {period.paidAt && (
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        Pagado el: {formatDate(period.paidAt.split('T')[0])}
                      </Text>
                    )}

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                      <Button
                        compact
                        mode="contained-tonal"
                        icon="eye"
                        onPress={async () => {
                          await loadPayroll(period.startDate, period.endDate);
                          setActiveTab('ACTUAL');
                        }}
                      >
                        Ver / Cargar Detalle
                      </Button>
                    </View>
                  </Card.Content>
                </Card>
              );
            })}
          </ScrollView>
        )
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
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
});
