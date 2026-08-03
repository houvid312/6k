import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card, Button, Chip, Divider, IconButton, Portal, Snackbar, useTheme } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { DenominationCounter } from '../../../src/components/ventas/DenominationCounter';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useSnackbar } from '../../../src/hooks';
import { useCashClosingStore } from '../../../src/stores/useCashClosingStore';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, todayColombia } from '../../../src/utils/dates';
import { CashClosing, Expense } from '../../../src/domain/entities';
import { ClosingStatus, UserRole, PaymentMethod } from '../../../src/domain/enums';

const STATUS_CONFIG: Record<ClosingStatus, { label: string; color: string; icon: string }> = {
  [ClosingStatus.DRAFT]: { label: 'Borrador', color: '#F57C00', icon: 'pencil' },
  [ClosingStatus.CONFIRMED]: { label: 'Confirmado', color: '#1976D2', icon: 'check' },
  [ClosingStatus.APPROVED]: { label: 'Aprobado', color: '#388E3C', icon: 'check-all' },
};

export default function CierreCajaScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const activeDate = params.date || todayColombia();
  const { cashClosingService, expenseRepo } = useDI();
  const { selectedStoreId, userRole } = useAppStore();
  const { workers } = useMasterDataStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();
  const {
    denominations,
    bankTotal,
    expenses,
    cashBase,
    setDenomination,
    setBankTotal,
    setExpenses,
    setCashBase,
    getTotal,
    reset,
    setCurrentStore,
  } = useCashClosingStore();

  const [expectedTotal, setExpectedTotal] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [dayExpenses, setDayExpenses] = useState<Expense[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [existingClosing, setExistingClosing] = useState<CashClosing | null>(null);

  const actualTotal = getTotal();
  const discrepancy = actualTotal - cashBase - (expectedTotal - totalCredit - expenses);
  const isAdmin = userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL;
  const isEditable = !existingClosing || existingClosing.status === ClosingStatus.DRAFT;
  const isReadOnly = !isEditable;

  useEffect(() => {
    setCurrentStore(selectedStoreId);
    (async () => {
      try {
        const summary = await cashClosingService.getDailyExpected(selectedStoreId, activeDate);
        const existing = await cashClosingService.getClosingByDate(selectedStoreId, activeDate);
        setExistingClosing(existing);
        setTotalCredit(summary.totalCreditAmount ?? 0);

        // Auto-load expenses from activeDate (Compra Turno, Adelantos, etc.)
        let totalExpenses = 0;
        try {
          const dbExpenses = await expenseRepo.getByDateRange(selectedStoreId, activeDate, activeDate);
          setDayExpenses(dbExpenses);
          const cashExpenses = dbExpenses.filter(e => e.paymentMethod === PaymentMethod.EFECTIVO);
          totalExpenses = cashExpenses.reduce((sum, e) => sum + e.amount, 0);
        } catch (err) {
          console.error('Error cargando egresos:', err);
        }

        // Auto-load opening base
        try {
          const opening = await cashClosingService.getOpeningByDate(selectedStoreId, activeDate);
          if (opening) setCashBase(opening.total);
        } catch { /* ignore */ }

        if (existing) {
          const shouldRecalculateDraft = existing.status === ClosingStatus.DRAFT;

          for (const [key, count] of Object.entries(existing.denominations)) {
            setDenomination(key as keyof CashClosing['denominations'], count);
          }
          setBankTotal(shouldRecalculateDraft ? summary.totalBankAmount : existing.bankTotal);
          setExpenses(totalExpenses);
          setExpectedTotal(shouldRecalculateDraft ? summary.totalAmount : existing.expectedTotal);
        } else {
          setExpectedTotal(summary.totalAmount);
          setBankTotal(summary.totalBankAmount);
          setExpenses(totalExpenses);
        }
      } catch {
        setExpectedTotal(0);
        setTotalCredit(0);
      }
    })();
  }, [selectedStoreId, activeDate, cashClosingService, expenseRepo, setBankTotal, setCashBase, setDenomination, setExpenses, setCurrentStore]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      if (isAdmin) {
        try {
          await cashClosingService.updateOpeningBase(selectedStoreId, activeDate, cashBase);
        } catch (err) {
          console.error('Error guardando base de apertura:', err);
        }
      }

      if (existingClosing && isEditable) {
        // Update existing closing
        const updated = await cashClosingService.updateClosing(
          existingClosing.id,
          selectedStoreId,
          activeDate,
          denominations,
          bankTotal,
          expenses,
        );
        setExistingClosing(updated);
        showSuccess(`Borrador actualizado (${formatDate(activeDate)}). Discrepancia: ${formatCOP(updated.discrepancy)}`);
      } else {
        // Create new closing
        const closing = await cashClosingService.createClosing(
          selectedStoreId,
          activeDate,
          denominations,
          bankTotal,
          expenses,
        );
        setExistingClosing(closing);
        showSuccess(`Cierre creado (${formatDate(activeDate)}) como borrador. Discrepancia: ${formatCOP(closing.discrepancy)}`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'No se pudo registrar el cierre');
    } finally {
      setSubmitting(false);
    }
  }, [selectedStoreId, activeDate, denominations, bankTotal, expenses, cashBase, isAdmin, cashClosingService, existingClosing, isEditable, discrepancy, showSuccess, showError]);

  const handleConfirm = useCallback(async () => {
    if (!existingClosing) return;
    setSubmitting(true);
    try {
      const updated = await cashClosingService.confirmClosing(existingClosing.id, '');
      setExistingClosing(updated);
      showSuccess('Cierre confirmado y periodo bloqueado');
    } catch {
      showError('No se pudo confirmar el cierre');
    } finally {
      setSubmitting(false);
    }
  }, [existingClosing, cashClosingService, showSuccess, showError]);

  const handleReturnToDraft = useCallback(async () => {
    if (!existingClosing) return;
    setSubmitting(true);
    try {
      const updated = await cashClosingService.returnToDraft(existingClosing.id);
      setExistingClosing(updated);
      showSuccess('Cierre devuelto a borrador; periodo reabierto');
    } catch {
      showError('No se pudo devolver a borrador');
    } finally {
      setSubmitting(false);
    }
  }, [existingClosing, cashClosingService, showSuccess, showError]);

  const handleApprove = useCallback(async () => {
    if (!existingClosing) return;
    setSubmitting(true);
    try {
      const updated = await cashClosingService.approveClosing(existingClosing.id, '');
      setExistingClosing(updated);
      showSuccess('Cierre aprobado y bloqueado');
    } catch {
      showError('No se pudo aprobar el cierre');
    } finally {
      setSubmitting(false);
    }
  }, [existingClosing, cashClosingService, showSuccess, showError]);

  const cashTotal = actualTotal - bankTotal;
  const statusConfig = existingClosing ? STATUS_CONFIG[existingClosing.status] : null;
  const displayedClosingDiscrepancy = existingClosing?.status === ClosingStatus.DRAFT
    ? discrepancy
    : existingClosing?.discrepancy ?? discrepancy;
  const closingTitle = existingClosing?.status === ClosingStatus.DRAFT
    ? 'Cierre del dia en borrador'
    : existingClosing?.status === ClosingStatus.CONFIRMED
      ? 'Cierre del dia confirmado'
      : 'Cierre del dia aprobado';

  const cashAdvances = dayExpenses
    .filter((e) => e.category === 'Adelanto' && e.paymentMethod === PaymentMethod.EFECTIVO)
    .reduce((sum, e) => sum + e.amount, 0);

  const bankAdvances = dayExpenses
    .filter((e) => e.category === 'Adelanto' && e.paymentMethod === PaymentMethod.TRANSFERENCIA)
    .reduce((sum, e) => sum + e.amount, 0);

  const cashPurchases = dayExpenses
    .filter((e) => e.category !== 'Adelanto' && e.paymentMethod === PaymentMethod.EFECTIVO)
    .reduce((sum, e) => sum + e.amount, 0);

  const bankPurchases = dayExpenses
    .filter((e) => e.category !== 'Adelanto' && e.paymentMethod === PaymentMethod.TRANSFERENCIA)
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Button
          mode="text"
          icon="arrow-left"
          compact
          onPress={() => router.replace('/(tabs)/ventas')}
          style={{ marginRight: 8 }}
        >
          Ventas
        </Button>
        <StoreSelector excludeProductionCenter />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDate(new Date())}
        </Text>
      </View>

      {/* Status Banner */}
      {existingClosing && statusConfig && (
        <Card style={[styles.card, { borderColor: statusConfig.color, borderWidth: 2 }]} mode="elevated">
          <Card.Content style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ color: statusConfig.color, fontWeight: 'bold' }}>
                {closingTitle}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                Discrepancia: {formatCOP(displayedClosingDiscrepancy)}
              </Text>
            </View>
            <Chip
              icon={statusConfig.icon}
              textStyle={{ color: statusConfig.color, fontWeight: '600', fontSize: 12 }}
              style={{ backgroundColor: statusConfig.color + '20' }}
            >
              {statusConfig.label}
            </Chip>
          </Card.Content>
        </Card>
      )}



      {/* Denominations */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
            Conteo de Efectivo
          </Text>
          <DenominationCounter
            denominations={denominations}
            onChange={setDenomination}
            total={cashTotal}
            disabled={isReadOnly}
          />
        </Card.Content>
      </Card>

      {/* Base, Bank & Expenses */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <CurrencyInput
            value={cashBase}
            onChangeValue={setCashBase}
            label="Base de Apertura"
            disabled={!isEditable || !isAdmin}
          />
          {isAdmin && isEditable && (
            <Text variant="labelSmall" style={{ color: '#4CAF50', marginTop: 4 }}>
              ✏️ Permiso de Gerencia: Puedes ajustar la base para consignar el excedente a tesorería.
            </Text>
          )}
          <View style={{ height: 12 }} />
          <CurrencyInput
            value={bankTotal}
            onChangeValue={setBankTotal}
            label="Total Transferencias"
            disabled={isReadOnly}
          />
          <View style={{ height: 12 }} />
          <CurrencyInput
            value={expenses}
            onChangeValue={setExpenses}
            label="Gastos del Dia"
            disabled
          />
        </Card.Content>
      </Card>

      {/* Unified Summary Card */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12, color: theme.colors.primary }}>
            Resumen de Jornada
          </Text>

          {/* Base */}
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Base del día (Apertura)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#E2B13C' }}>
              {formatCOP(cashBase)}
            </Text>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          {/* Ventas desglosadas */}
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Total Ventas</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
              {formatCOP(expectedTotal)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { paddingLeft: 12 }]}>
            <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Efectivo Esperado (Ventas)</Text>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
              {formatCOP(expectedTotal - bankTotal - totalCredit)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { paddingLeft: 12 }]}>
            <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Transferencias (Bancos)</Text>
            <Text variant="bodySmall" style={{ color: '#388E3C' }}>
              {formatCOP(bankTotal)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { paddingLeft: 12 }]}>
            <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Fiados (Cartera)</Text>
            <Text variant="bodySmall" style={{ color: '#1976D2' }}>
              {formatCOP(totalCredit)}
            </Text>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          {/* Egresos desglosados */}
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Total Egresos (Compras/Gastos)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: '#D32F2F' }}>
              -{formatCOP(cashPurchases + bankPurchases)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { paddingLeft: 12 }]}>
            <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Compras en Efectivo (Salida de Caja)</Text>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
              {formatCOP(cashPurchases)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { paddingLeft: 12 }]}>
            <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Compras por Banco (Transferencia)</Text>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
              {formatCOP(bankPurchases)}
            </Text>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          {/* Adelantos desglosados */}
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Adelantos a Colaboradores (Cartera)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: '#1976D2' }}>
              {formatCOP(cashAdvances + bankAdvances)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { paddingLeft: 12 }]}>
            <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Adelantos en Efectivo (Salida de Caja)</Text>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
              {formatCOP(cashAdvances)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { paddingLeft: 12 }]}>
            <Text variant="bodySmall" style={{ color: '#aaa' }}>└ Adelantos por Banco (Transferencia)</Text>
            <Text variant="bodySmall" style={{ color: '#F5F0EB' }}>
              {formatCOP(bankAdvances)}
            </Text>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          {/* Efectivo con y sin base */}
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Efectivo esperado (Sin Base)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
              {formatCOP(expectedTotal - bankTotal - totalCredit - expenses)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Efectivo esperado (Con Base)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {formatCOP(cashBase + expectedTotal - bankTotal - totalCredit - expenses)}
            </Text>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          {/* Físico contado vs discrepancia */}
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Efectivo Contado (Físico en Caja)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: '#FFF' }}>
              {formatCOP(cashTotal)}
            </Text>
          </View>
          <View style={[styles.summaryRow, { marginTop: 4 }]}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Discrepancia (Diferencia)</Text>
            <Text
              variant="titleMedium"
              style={{
                fontWeight: 'bold',
                color: Math.abs(discrepancy) < 1000 ? '#388E3C' : '#D32F2F',
              }}
            >
              {formatCOP(discrepancy)}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Matriz de Conciliación Multicanal (Cuadre Global) */}
      <Card style={[styles.card, { borderColor: '#E63946', borderWidth: 1 }]} mode="elevated">
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 12 }}>
            📊 Matriz de Conciliación Multicanal (Cuadre Global)
          </Text>

          <View style={{ gap: 8 }}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#333' }}>
              <Text variant="labelMedium" style={{ flex: 1.4, color: '#aaa', fontWeight: 'bold' }}>Canal</Text>
              <Text variant="labelMedium" style={{ flex: 1, color: '#aaa', textAlign: 'right', fontWeight: 'bold' }}>Esperado</Text>
              <Text variant="labelMedium" style={{ flex: 1, color: '#aaa', textAlign: 'right', fontWeight: 'bold' }}>Real / Audit.</Text>
              <Text variant="labelMedium" style={{ flex: 1, color: '#aaa', textAlign: 'right', fontWeight: 'bold' }}>Diferencia</Text>
            </View>

            {/* Row 1: Cash */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodySmall" style={{ flex: 1.4, color: theme.colors.onSurface }}>💵 Caja Física</Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', color: theme.colors.onSurfaceVariant }}>
                {formatCOP(cashBase + expectedTotal - bankTotal - totalCredit - expenses)}
              </Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', color: '#FFF', fontWeight: 'bold' }}>
                {formatCOP(cashTotal)}
              </Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: discrepancy >= 0 ? '#388E3C' : '#D32F2F' }}>
                {discrepancy > 0 ? '+' : ''}{formatCOP(discrepancy)}
              </Text>
            </View>

            {/* Row 2: Bank Transfers */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodySmall" style={{ flex: 1.4, color: theme.colors.onSurface }}>💳 Bancos / Nequi</Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', color: theme.colors.onSurfaceVariant }}>
                {formatCOP(bankTotal)}
              </Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', color: '#FFF', fontWeight: 'bold' }}>
                {formatCOP(bankTotal)}
              </Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: '#388E3C' }}>
                $0
              </Text>
            </View>

            {/* Row 3: Cartera / Fiados */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodySmall" style={{ flex: 1.4, color: theme.colors.onSurface }}>🚩 Fiados / Cartera</Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', color: theme.colors.onSurfaceVariant }}>
                {formatCOP(totalCredit)}
              </Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', color: '#FFF', fontWeight: 'bold' }}>
                {formatCOP(totalCredit)}
              </Text>
              <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: '#388E3C' }}>
                $0
              </Text>
            </View>

            <Divider style={{ marginVertical: 4 }} />

            {/* Row 4: Total Global */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodyMedium" style={{ flex: 1.4, fontWeight: 'bold', color: theme.colors.onSurface }}>Total Jornada</Text>
              <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                {formatCOP(cashBase + expectedTotal - expenses)}
              </Text>
              <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: theme.colors.primary }}>
                {formatCOP(cashTotal + bankTotal + totalCredit)}
              </Text>
              <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: discrepancy >= 0 ? '#388E3C' : '#D32F2F' }}>
                {discrepancy > 0 ? '+' : ''}{formatCOP(discrepancy)}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Salidas de Caja y Egresos del Día (Desglose Itemizado) */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
              💸 Salidas de Caja y Egresos ({dayExpenses.length})
            </Text>
            <Chip compact textStyle={{ fontSize: 11, fontWeight: 'bold' }} style={{ backgroundColor: '#3E1F1F' }}>
              <Text style={{ color: '#FF8A80' }}>Total: {formatCOP(dayExpenses.reduce((s, e) => s + e.amount, 0))}</Text>
            </Chip>
          </View>

          {dayExpenses.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center', marginVertical: 8 }}>
              No hay salidas de caja o egresos registrados para esta jornada.
            </Text>
          ) : (
            dayExpenses.map((e) => {
              const isCash = e.paymentMethod === PaymentMethod.EFECTIVO;
              const isAdvance = e.category === 'Adelanto';
              const worker = workers.find((w) => w.id === e.workerId);
              const workerName = worker ? worker.name : null;
              return (
                <View
                  key={e.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.colors.outlineVariant,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                      {isAdvance ? '👤' : '💸'} {e.description || e.category}
                    </Text>
                    {isAdvance && workerName && (
                      <Text variant="labelSmall" style={{ color: '#FFB74D', marginTop: 2, fontWeight: 'bold' }}>
                        Trabajador: {workerName}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <Chip
                        compact
                        textStyle={{ fontSize: 10, color: isCash ? '#FF8A80' : '#64B5F6' }}
                        style={{ backgroundColor: isCash ? '#3E1F1F' : '#1A3A5C' }}
                      >
                        {isCash ? '💵 Efectivo (Descuenta Caja)' : '💳 Transferencia (Banco)'}
                      </Chip>
                      <Chip compact textStyle={{ fontSize: 10, color: '#AAA' }} style={{ backgroundColor: '#2A2A2A' }}>
                        {e.category}
                      </Chip>
                    </View>
                  </View>
                  <Text variant="titleSmall" style={{ fontWeight: 'bold', color: isCash ? '#E63946' : '#FFB74D' }}>
                    {formatCOP(e.amount)}
                  </Text>
                </View>
              );
            })
          )}
        </Card.Content>
      </Card>

      {/* Action Buttons */}
      {isEditable && (
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          style={styles.submitBtn}
          icon={existingClosing ? 'content-save' : 'lock-check'}
        >
          {existingClosing ? 'Actualizar Borrador' : 'Registrar Borrador'}
        </Button>
      )}

      {/* Workflow buttons */}
      {existingClosing && existingClosing.status === ClosingStatus.DRAFT && (
        <Button
          mode="contained-tonal"
          onPress={handleConfirm}
          loading={submitting}
          disabled={submitting}
          style={styles.workflowBtn}
          icon="check"
        >
          Confirmar Cierre
        </Button>
      )}

      {existingClosing && existingClosing.status === ClosingStatus.CONFIRMED && isAdmin && (
        <View style={styles.adminActions}>
          <Button
            mode="outlined"
            onPress={handleReturnToDraft}
            loading={submitting}
            disabled={submitting}
            style={[styles.workflowBtn, { flex: 1, marginRight: 8 }]}
            icon="arrow-left"
            textColor="#F57C00"
          >
            Devolver
          </Button>
          <Button
            mode="contained"
            onPress={handleApprove}
            loading={submitting}
            disabled={submitting}
            style={[styles.workflowBtn, { flex: 1 }]}
            icon="check-all"
            buttonColor="#388E3C"
          >
            Aprobar
          </Button>
        </View>
      )}

      {existingClosing && existingClosing.status === ClosingStatus.APPROVED && isAdmin && (
        <Button
          mode="outlined"
          onPress={handleReturnToDraft}
          loading={submitting}
          disabled={submitting}
          style={styles.workflowBtn}
          icon="arrow-left"
          textColor="#F57C00"
        >
          Reabrir para correccion
        </Button>
      )}

      <Button
        mode="text"
        onPress={reset}
        style={{ marginTop: 8 }}
        disabled={!isEditable}
      >
        Limpiar formulario
      </Button>

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  workflowBtn: {
    marginTop: 8,
    borderRadius: 8,
  },
  adminActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
});
