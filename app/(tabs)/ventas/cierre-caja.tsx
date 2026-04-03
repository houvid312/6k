import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card, Button, Divider, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { DenominationCounter } from '../../../src/components/ventas/DenominationCounter';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { useCashClosingStore } from '../../../src/stores/useCashClosingStore';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, toISODate } from '../../../src/utils/dates';

export default function CierreCajaScreen() {
  const theme = useTheme();
  const { cashClosingService } = useDI();
  const { selectedStoreId } = useAppStore();
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
  const [closed, setClosed] = useState(false);

  const today = toISODate(new Date());
  const actualTotal = getTotal();
  const discrepancy = actualTotal - cashBase - (expectedTotal - expenses);

  useEffect(() => {
    (async () => {
      try {
        const summary = await cashClosingService.getDailyExpected(selectedStoreId, today);
        setExpectedTotal(summary.totalAmount);

        const existing = await cashClosingService.getClosingByDate(selectedStoreId, today);
        if (existing) {
          setClosed(true);
        }
      } catch {
        setExpectedTotal(0);
      }
    })();
  }, [selectedStoreId, today, cashClosingService]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await cashClosingService.createClosing(
        selectedStoreId,
        today,
        denominations,
        bankTotal,
        expenses,
      );
      setClosed(true);
      showSuccess(`Cierre completado. Discrepancia: ${formatCOP(discrepancy)}`);
    } catch {
      showError('No se pudo registrar el cierre');
    } finally {
      setSubmitting(false);
    }
  }, [selectedStoreId, today, denominations, bankTotal, expenses, cashClosingService, discrepancy, showSuccess, showError]);

  const cashTotal = actualTotal - bankTotal;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDate(new Date())}
        </Text>
      </View>

      {closed && (
        <Card style={[styles.card, { borderColor: '#388E3C', borderWidth: 2 }]} mode="elevated">
          <Card.Content>
            <Text variant="titleMedium" style={{ color: '#388E3C', fontWeight: 'bold' }}>
              Cierre del dia ya registrado
            </Text>
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

      {!closed && (
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          style={styles.submitBtn}
          icon="lock-check"
        >
          Registrar Cierre
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
