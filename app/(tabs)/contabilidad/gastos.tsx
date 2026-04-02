import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { TextInput, Button, Text, Card, Menu, Divider, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { PaymentMethodPicker } from '../../../src/components/ventas/PaymentMethodPicker';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Expense } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { EXPENSE_CATEGORIES } from '../../../src/utils/constants';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate } from '../../../src/utils/dates';

export default function GastosScreen() {
  const theme = useTheme();
  const { expenseRepo } = useDI();
  const { selectedStoreId } = useAppStore();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState('');
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [submitting, setSubmitting] = useState(false);

  const loadExpenses = useCallback(async () => {
    try {
      const all = await expenseRepo.getAll(selectedStoreId);
      setExpenses(all.reverse());
    } catch {
      setExpenses([]);
    }
  }, [selectedStoreId, expenseRepo]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const handleSubmit = useCallback(async () => {
    if (!category) {
      Alert.alert('Error', 'Selecciona una categoria');
      return;
    }
    if (amount <= 0) {
      Alert.alert('Error', 'Ingresa un monto valido');
      return;
    }

    setSubmitting(true);
    try {
      await expenseRepo.create({
        date: new Date().toISOString(),
        storeId: selectedStoreId,
        category,
        description: description || category,
        amount,
        paymentMethod,
      });
      setCategory('');
      setDescription('');
      setAmount(0);
      Alert.alert('Gasto registrado', `${category}: ${formatCOP(amount)}`);
      loadExpenses();
    } catch {
      Alert.alert('Error', 'No se pudo registrar el gasto');
    } finally {
      setSubmitting(false);
    }
  }, [category, description, amount, paymentMethod, selectedStoreId, expenseRepo, loadExpenses]);

  return (
    <ScreenContainer>
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Registrar Gasto
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
            {category || 'Seleccionar categoria'}
          </Button>
        }
      >
        {EXPENSE_CATEGORIES.map((cat) => (
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
        label="Descripcion"
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
        Metodo de Pago
      </Text>
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitBtn}
        icon="check"
      >
        Registrar Gasto
      </Button>

      <Divider style={styles.divider} />

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Gastos Registrados
      </Text>

      {expenses.length === 0 ? (
        <EmptyState icon="wallet" title="Sin gastos" subtitle="No hay gastos registrados" />
      ) : (
        expenses.map((expense) => (
          <Card key={expense.id} style={styles.expenseCard} mode="elevated">
            <Card.Content style={styles.expenseRow}>
              <View>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{expense.category}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {expense.description} - {formatDate(expense.date)}
                </Text>
              </View>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.error }}>
                {formatCOP(expense.amount)}
              </Text>
            </Card.Content>
          </Card>
        ))
      )}

      <View style={{ height: 32 }} />
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
  expenseCard: {
    borderRadius: 8,
    marginBottom: 8,
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
