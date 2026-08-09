import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { TextInput, Button, Text, Card, Menu, Divider, Portal, Snackbar, useTheme, IconButton } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { PaymentMethodPicker } from '../../../src/components/ventas/PaymentMethodPicker';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { Income } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, todayColombia } from '../../../src/utils/dates';

const INCOME_CATEGORIES = ['Capital Inicial', 'Capitalización', 'Inversión', 'Otro'];

export default function IngresosScreen() {
  const theme = useTheme();
  const { incomeRepo } = useDI();
  const { selectedStoreId } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [category, setCategory] = useState('');
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [submitting, setSubmitting] = useState(false);

  const loadIncomes = useCallback(async () => {
    try {
      const all = await incomeRepo.getAll(selectedStoreId);
      setIncomes(all.reverse());
    } catch {
      setIncomes([]);
    }
  }, [selectedStoreId, incomeRepo]);

  useEffect(() => {
    loadIncomes();
  }, [loadIncomes]);

  const handleSubmit = useCallback(async () => {
    if (!category) {
      showError('Selecciona una categoría');
      return;
    }
    if (amount <= 0) {
      showError('Ingresa un monto válido');
      return;
    }

    setSubmitting(true);
    try {
      await incomeRepo.create({
        date: todayColombia(),
        storeId: selectedStoreId,
        category,
        description: description || category,
        amount,
        paymentMethod,
      });
      setCategory('');
      setDescription('');
      setAmount(0);
      showSuccess(`${category}: ${formatCOP(amount)} registrado`);
      loadIncomes();
    } catch {
      showError('No se pudo registrar el ingreso');
    } finally {
      setSubmitting(false);
    }
  }, [category, description, amount, paymentMethod, selectedStoreId, incomeRepo, loadIncomes, showSuccess, showError]);

  const handleDelete = useCallback((id: string, concept: string, val: number) => {
    const confirmMsg = `¿Seguro que deseas eliminar el ingreso de ${concept} por ${formatCOP(val)}?`;
    const doDelete = async () => {
      try {
        await incomeRepo.delete(id);
        showSuccess('Ingreso eliminado');
        loadIncomes();
      } catch (err: any) {
        showError(err.message || 'No se pudo eliminar el ingreso');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doDelete();
    } else {
      Alert.alert('Eliminar ingreso', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [incomeRepo, loadIncomes, showSuccess, showError]);

  return (
    <ScreenContainer>
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Registrar Ingreso (No Operacional)
      </Text>

      <Menu
        visible={categoryMenuVisible}
        onDismiss={() => setCategoryMenuVisible(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setCategoryMenuVisible(true)}
            icon="tag"
            style={styles.categoryBtn}
            contentStyle={{ justifyContent: 'flex-start' }}
          >
            {category || 'Seleccionar categoría'}
          </Button>
        }
      >
        {INCOME_CATEGORIES.map((cat) => (
          <Menu.Item
            key={cat}
            onPress={() => {
              setCategory(cat);
              setCategoryMenuVisible(false);
            }}
            title={cat}
          />
        ))}
      </Menu>

      <TextInput
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        mode="outlined"
        style={styles.input}
      />

      <CurrencyInput
        value={amount}
        onChangeValue={setAmount}
        label="Monto"
        style={styles.input}
      />

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginVertical: 8 }}>
        Método de Recepción
      </Text>
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitBtn}
        icon="check"
      >
        Registrar Ingreso
      </Button>

      <Divider style={styles.divider} />

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Ingresos Registrados
      </Text>

      {incomes.length === 0 ? (
        <EmptyState icon="wallet-giftcard" title="Sin ingresos" subtitle="No hay ingresos no operacionales registrados" />
      ) : (
        incomes.map((income) => (
          <Card key={income.id} style={styles.incomeCard} mode="elevated">
            <Card.Content style={styles.incomeRow}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{income.category}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {income.description} - {formatDate(income.date)} ({income.paymentMethod === PaymentMethod.EFECTIVO ? 'Efectivo' : 'Banco'})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginRight: 8 }}>
                  {formatCOP(income.amount)}
                </Text>
                <IconButton
                  icon="delete-outline"
                  iconColor={theme.colors.error}
                  size={20}
                  onPress={() => handleDelete(income.id, income.category, income.amount)}
                />
              </View>
            </Card.Content>
          </Card>
        ))
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
    marginBottom: 12,
  },
  categoryBtn: {
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  submitBtn: {
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 4,
  },
  divider: {
    marginVertical: 24,
    height: 2,
  },
  incomeCard: {
    borderRadius: 8,
    marginBottom: 8,
  },
  incomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 0,
  },
});
