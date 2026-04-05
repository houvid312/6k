import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card, Button, Chip, Divider, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { DenominationCounter } from '../../../src/components/ventas/DenominationCounter';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { useCashClosingStore } from '../../../src/stores/useCashClosingStore';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, todayColombia } from '../../../src/utils/dates';
import { CashClosing } from '../../../src/domain/entities';
import { ClosingStatus, UserRole } from '../../../src/domain/enums';

const STATUS_CONFIG: Record<ClosingStatus, { label: string; color: string; icon: string }> = {
  [ClosingStatus.DRAFT]: { label: 'Borrador', color: '#F57C00', icon: 'pencil' },
  [ClosingStatus.CONFIRMED]: { label: 'Confirmado', color: '#1976D2', icon: 'check' },
  [ClosingStatus.APPROVED]: { label: 'Aprobado', color: '#388E3C', icon: 'check-all' },
};

export default function CierreCajaScreen() {
  const theme = useTheme();
  const { cashClosingService } = useDI();
  const { selectedStoreId, userRole } = useAppStore();
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
  } = useCashClosingStore();

  const [expectedTotal, setExpectedTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [existingClosing, setExistingClosing] = useState<CashClosing | null>(null);

  const today = todayColombia();
  const actualTotal = getTotal();
  const discrepancy = actualTotal - cashBase - (expectedTotal - expenses);
  const isAdmin = userRole === UserRole.ADMIN;
  const isEditable = !existingClosing || existingClosing.status !== ClosingStatus.APPROVED;

  useEffect(() => {
    (async () => {
      try {
        const summary = await cashClosingService.getDailyExpected(selectedStoreId, today);
        setExpectedTotal(summary.totalAmount);
        setBankTotal(summary.totalBankAmount);

        const existing = await cashClosingService.getClosingByDate(selectedStoreId, today);
        setExistingClosing(existing);
      } catch {
        setExpectedTotal(0);
      }
    })();
  }, [selectedStoreId, today, cashClosingService]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      if (existingClosing && isEditable) {
        // Update existing closing
        const updated = await cashClosingService.updateClosing(
          existingClosing.id,
          selectedStoreId,
          today,
          denominations,
          bankTotal,
          expenses,
        );
        setExistingClosing(updated);
        showSuccess('Cierre actualizado y alertas regeneradas');
      } else {
        // Create new closing
        const closing = await cashClosingService.createClosing(
          selectedStoreId,
          today,
          denominations,
          bankTotal,
          expenses,
        );
        setExistingClosing(closing);
        showSuccess(`Cierre creado como borrador. Discrepancia: ${formatCOP(discrepancy)}`);
      }
      reset();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'No se pudo registrar el cierre');
    } finally {
      setSubmitting(false);
    }
  }, [selectedStoreId, today, denominations, bankTotal, expenses, cashClosingService, existingClosing, isEditable, discrepancy, showSuccess, showError]);

  const handleConfirm = useCallback(async () => {
    if (!existingClosing) return;
    setSubmitting(true);
    try {
      const updated = await cashClosingService.confirmClosing(existingClosing.id, '');
      setExistingClosing(updated);
      showSuccess('Cierre confirmado');
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
      showSuccess('Cierre devuelto a borrador');
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

  return (
    <ScreenContainer>
      <View style={styles.header}>
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
                Cierre del dia {existingClosing.status === ClosingStatus.APPROVED ? 'aprobado' : 'registrado'}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                Discrepancia: {formatCOP(existingClosing.discrepancy)}
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

      {/* Expected */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
            Ventas Esperadas
          </Text>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            {formatCOP(expectedTotal)}
          </Text>
        </Card.Content>
      </Card>

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
          />
          <View style={{ height: 12 }} />
          <CurrencyInput
            value={bankTotal}
            onChangeValue={setBankTotal}
            label="Total Transferencias"
          />
          <View style={{ height: 12 }} />
          <CurrencyInput
            value={expenses}
            onChangeValue={setExpenses}
            label="Gastos del Dia"
          />
        </Card.Content>
      </Card>

      {/* Summary */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
            Resumen
          </Text>
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Base de apertura</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurfaceVariant }}>
              {formatCOP(cashBase)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Efectivo contado</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
              {formatCOP(cashTotal)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Transferencias</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
              {formatCOP(bankTotal)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Total real (- base)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
              {formatCOP(actualTotal - cashBase)}
            </Text>
          </View>
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.summaryRow}>
            <Text variant="bodyMedium">Esperado (- gastos)</Text>
            <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
              {formatCOP(expectedTotal - expenses)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
              Discrepancia
            </Text>
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
          {existingClosing ? 'Actualizar Cierre' : 'Registrar Cierre'}
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
