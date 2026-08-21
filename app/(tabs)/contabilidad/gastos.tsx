import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform, Alert, Pressable } from 'react-native';
import { TextInput, Button, Text, Card, Menu, Divider, Portal, Snackbar, useTheme, Chip, IconButton } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { PaymentMethodPicker } from '../../../src/components/ventas/PaymentMethodPicker';
import { CalendarPickerModal } from '../../../src/components/common/CalendarPickerModal';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { useSnackbar } from '../../../src/hooks';
import { Expense } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
import { EXPENSE_CATEGORIES } from '../../../src/utils/constants';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate, todayColombia, getColombiaDateString } from '../../../src/utils/dates';

export default function GastosScreen() {
  const theme = useTheme();
  const { expenseRepo, purchaseRepo, supplyRepo } = useDI();
  const { selectedStoreId } = useAppStore();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseDate, setExpenseDate] = useState(todayColombia());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [category, setCategory] = useState('');
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [isFixed, setIsFixed] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [suppliesMap, setSuppliesMap] = useState<Record<string, string>>({});

  const loadExpenses = useCallback(async () => {
    try {
      const [allExpenses, allPurchases, allSupplies] = await Promise.all([
        expenseRepo.getAll(selectedStoreId),
        purchaseRepo.getAll(selectedStoreId),
        supplyRepo.getAll(),
      ]);

      const supMap: Record<string, string> = {};
      allSupplies.forEach(s => {
        supMap[s.id] = s.name;
      });
      setSuppliesMap(supMap);

      // Map purchases to look like Expense items for display
      const mappedPurchases: Expense[] = allPurchases.map(p => ({
        id: p.id,
        storeId: p.storeId,
        date: p.timestamp ? getColombiaDateString(p.timestamp) : todayColombia(),
        category: 'Compra Insumo',
        description: `${supMap[p.supplyId] || 'Insumo'} (${p.quantityGrams}g) - Prov: ${p.supplier}`,
        amount: p.priceCOP,
        paymentMethod: p.paymentMethod,
        isFixed: false,
        createdAt: p.timestamp || todayColombia(),
      }));

      // Combine both lists and sort by date descending
      const combined = [...allExpenses, ...mappedPurchases];
      combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setExpenses(combined);
    } catch (err) {
      console.error('Error loading expenses and purchases:', err);
      setExpenses([]);
    }
  }, [selectedStoreId, expenseRepo, purchaseRepo, supplyRepo]);

  useFocusEffect(
    useCallback(() => {
      loadExpenses();
    }, [loadExpenses])
  );

  const handleSubmit = useCallback(async () => {
    if (!category) {
      showError('Selecciona una categoria');
      return;
    }
    if (amount <= 0) {
      showError('Ingresa un monto valido');
      return;
    }

    setSubmitting(true);
    try {
      await expenseRepo.create({
        date: expenseDate || todayColombia(),
        storeId: selectedStoreId,
        category,
        description: description || category,
        amount,
        paymentMethod,
        isFixed,
      });
      setCategory('');
      setDescription('');
      setAmount(0);
      showSuccess(`${category}: ${formatCOP(amount)} registrado`);
      loadExpenses();
    } catch {
      showError('No se pudo registrar el gasto');
    } finally {
      setSubmitting(false);
    }
  }, [category, description, amount, paymentMethod, isFixed, expenseDate, selectedStoreId, expenseRepo, loadExpenses, showSuccess, showError]);

  const handleDeleteExpense = useCallback((item: Expense) => {
    const isPurchase = item.category === 'Compra Insumo';
    const confirmMsg = `¿Seguro que deseas eliminar este egreso (${item.category}: ${formatCOP(item.amount)})?`;
    const doDelete = async () => {
      try {
        if (isPurchase) {
          await purchaseRepo.delete(item.id);
        } else {
          await expenseRepo.delete(item.id);
        }
        showSuccess('Egreso eliminado');
        loadExpenses();
      } catch (err: any) {
        showError(err?.message || 'No se pudo eliminar el egreso');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) doDelete();
    } else {
      Alert.alert('Eliminar egreso', confirmMsg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [expenseRepo, purchaseRepo, loadExpenses, showSuccess, showError]);

  return (
    <ScreenContainer>
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Registrar Gasto
      </Text>

      <Pressable
        onPress={() => setCalendarVisible(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#1E1E1E',
          borderWidth: 1,
          borderColor: '#333',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          marginBottom: 12,
        }}
      >
        <IconButton icon="calendar" size={18} iconColor="#E63946" style={{ margin: 0, marginRight: 6 }} />
        <View style={{ flex: 1 }}>
          <Text variant="bodySmall" style={{ color: '#999' }}>Fecha del Gasto:</Text>
          <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#F5F0EB' }}>
            {formatDate(expenseDate)}
          </Text>
        </View>
        <Text variant="bodySmall" style={{ color: '#E63946', fontWeight: 'bold' }}>Cambiar</Text>
      </Pressable>

      <CalendarPickerModal
        visible={calendarVisible}
        selectedDate={expenseDate}
        maxDate={todayColombia()}
        onSelect={(d) => {
          setExpenseDate(d);
          setCalendarVisible(false);
        }}
        onDismiss={() => setCalendarVisible(false)}
      />

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
              setIsFixed(['Arriendo', 'Servicios', 'Nomina'].includes(cat));
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
        Tipo de Gasto (Estructura de Costos)
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip
          selected={isFixed}
          onPress={() => setIsFixed(true)}
          mode={isFixed ? 'flat' : 'outlined'}
          icon="lock"
          style={isFixed ? { backgroundColor: theme.colors.primaryContainer } : undefined}
        >
          Fijo
        </Chip>
        <Chip
          selected={!isFixed}
          onPress={() => setIsFixed(false)}
          mode={!isFixed ? 'flat' : 'outlined'}
          icon="chart-bell-curve-cumulative"
          style={!isFixed ? { backgroundColor: theme.colors.primaryContainer } : undefined}
        >
          Variable
        </Chip>
      </View>

      <Text variant="bodyMedium" style={{ fontWeight: '600', marginVertical: 8 }}>
        Metodo de Pago
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
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{expense.category}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {expense.description} - {formatDate(expense.date)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.error }}>
                  {formatCOP(expense.amount)}
                </Text>
                <IconButton
                  icon="delete-outline"
                  size={18}
                  iconColor="#D32F2F"
                  onPress={() => handleDeleteExpense(expense)}
                  style={{ margin: 0 }}
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
