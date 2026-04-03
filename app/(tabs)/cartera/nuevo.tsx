import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text, SegmentedButtons, Portal, Snackbar, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { DebtorType } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';
import { toISODate } from '../../../src/utils/dates';

export default function NuevoCreditoScreen() {
  const theme = useTheme();
  const { creditService } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [debtorName, setDebtorName] = useState('');
  const [debtorType, setDebtorType] = useState<string>('CLIENTE');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!debtorName.trim()) {
      showError('Ingresa el nombre del deudor');
      return;
    }
    if (amount <= 0) {
      showError('Ingresa un monto valido');
      return;
    }

    setSubmitting(true);
    try {
      await creditService.createCredit(
        debtorName.trim(),
        debtorType as DebtorType,
        concept || 'Credito',
        amount,
        toISODate(new Date()),
      );
      showSuccess(`Credito de ${formatCOP(amount)} registrado para ${debtorName.trim()}`);
      setTimeout(() => router.back(), 1200);
    } catch {
      showError('No se pudo registrar el credito');
    } finally {
      setSubmitting(false);
    }
  }, [debtorName, debtorType, concept, amount, creditService, showSuccess, showError]);

  return (
    <ScreenContainer>
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Nuevo Credito
      </Text>

      <TextInput
        label="Nombre del deudor"
        value={debtorName}
        onChangeText={setDebtorName}
        mode="outlined"
        style={styles.input}
      />

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginBottom: 8 }}>
        Tipo de deudor
      </Text>
      <SegmentedButtons
        value={debtorType}
        onValueChange={setDebtorType}
        buttons={[
          { value: 'CLIENTE', label: 'Cliente' },
          { value: 'TRABAJADOR', label: 'Trabajador' },
        ]}
        style={styles.segments}
      />

      <TextInput
        label="Concepto"
        value={concept}
        onChangeText={setConcept}
        mode="outlined"
        style={styles.input}
      />

      <CurrencyInput
        value={amount}
        onChangeValue={setAmount}
        label="Monto"
        style={styles.input}
      />

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitBtn}
        icon="check"
      >
        Registrar Credito
      </Button>

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
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  segments: {
    marginBottom: 16,
  },
  submitBtn: {
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 4,
  },
});
