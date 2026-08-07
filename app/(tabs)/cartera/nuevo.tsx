import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text, SegmentedButtons, Portal, Snackbar, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { SearchableSelect } from '../../../src/components/common/SearchableSelect';
import { useMasterDataStore } from '../../../src/stores/useMasterDataStore';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { DebtorType, Customer } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';
import { todayColombia } from '../../../src/utils/dates';

export default function NuevoCreditoScreen() {
  const theme = useTheme();
  const { creditService, customerRepo } = useDI();
  const { workers } = useMasterDataStore();
  const { selectedStoreId } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [debtorName, setDebtorName] = useState('');
  const [debtorType, setDebtorType] = useState<string>('CLIENTE');
  const [debtorWorkerId, setDebtorWorkerId] = useState('');
  const [debtorCustomerId, setDebtorCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await customerRepo.getAll();
        setCustomers(list.filter((c) => c.isActive));
      } catch (e) {
        console.error('Error loading customers in Cartera:', e);
      }
    })();
  }, [customerRepo]);

  const handleSubmit = useCallback(async () => {
    if (debtorType === 'TRABAJADOR' && !debtorWorkerId) {
      showError('Por favor selecciona el trabajador');
      return;
    }
    if (debtorType === 'CLIENTE' && !debtorCustomerId) {
      showError('Por favor selecciona el cliente');
      return;
    }
    if (amount <= 0) {
      showError('Ingresa un monto válido');
      return;
    }

    setSubmitting(true);
    try {
      await creditService.createCredit(
        debtorName.trim(),
        debtorType as DebtorType,
        concept || 'Crédito',
        amount,
        todayColombia(),
        debtorType === 'TRABAJADOR' ? debtorWorkerId : undefined,
        undefined,
        undefined,
        selectedStoreId || undefined,
        debtorType === 'CLIENTE' ? debtorCustomerId : undefined,
      );
      showSuccess(`Crédito de ${formatCOP(amount)} registrado para ${debtorName.trim()}`);
      setTimeout(() => router.back(), 1200);
    } catch {
      showError('No se pudo registrar el crédito');
    } finally {
      setSubmitting(false);
    }
  }, [debtorName, debtorType, debtorWorkerId, debtorCustomerId, concept, amount, selectedStoreId, creditService, showSuccess, showError]);

  return (
    <ScreenContainer>
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Nuevo Crédito
      </Text>

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginBottom: 8 }}>
        Tipo de deudor
      </Text>
      <SegmentedButtons
        value={debtorType}
        onValueChange={(val) => {
          setDebtorType(val);
          setDebtorName('');
          setDebtorWorkerId('');
          setDebtorCustomerId('');
        }}
        buttons={[
          { value: 'CLIENTE', label: 'Cliente' },
          { value: 'TRABAJADOR', label: 'Trabajador' },
        ]}
        style={styles.segments}
      />

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginBottom: 8 }}>
        Deudor
      </Text>
      {debtorType === 'TRABAJADOR' ? (
        <View style={{ marginBottom: 12 }}>
          <SearchableSelect
            options={workers
              .filter((w) => w.isActive && (!selectedStoreId || w.storeIds?.includes(selectedStoreId)))
              .map((w) => ({ value: w.id, label: w.name, subtitle: w.role }))}
            selectedValue={debtorWorkerId}
            placeholder="Seleccionar Trabajador"
            icon="account"
            onSelect={(id) => {
              setDebtorWorkerId(id);
              const w = workers.find((x) => x.id === id);
              setDebtorName(w ? w.name : '');
            }}
          />
        </View>
      ) : (
        <View style={{ marginBottom: 12 }}>
          <SearchableSelect
            options={customers
              .filter((c) => c.isActive && (!c.storeId || c.storeId === selectedStoreId))
              .map((c) => ({ value: c.id, label: c.name, subtitle: c.phone || 'Sin teléfono' }))}
            selectedValue={debtorCustomerId}
            placeholder="Seleccionar Cliente"
            icon="account-tie"
            onSelect={(id) => {
              setDebtorCustomerId(id);
              const c = customers.find((x) => x.id === id);
              setDebtorName(c ? c.name : '');
            }}
          />
        </View>
      )}

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
        Registrar Crédito
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
