import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Card, Text, Button, Chip, Divider, IconButton, Portal, Modal, TextInput, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { Sale, Expense } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';
import { formatDateTime, toISODate, todayColombia } from '../../../src/utils/dates';

export default function ContabilidadScreen() {
  const theme = useTheme();
  const { dashboardService, saleService, expenseRepo, saleRepo, cashClosingService } = useDI();
  const { selectedStoreId } = useAppStore();

  type ContaPeriod = 'hoy' | 'ayer' | 'semana' | 'mes';
  const [period, setPeriod] = useState<ContaPeriod>('hoy');

  const [ingresos, setIngresos] = useState(0);
  const [egresos, setEgresos] = useState(0);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // C1: Daily audit
  const [openingBase, setOpeningBase] = useState(0);
  const [todayCashSales, setTodayCashSales] = useState(0);
  const [todayCashExpenses, setTodayCashExpenses] = useState(0);
  const [closingActual, setClosingActual] = useState<number | null>(null);

  // Edit expense modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = todayColombia();
      let startDate: string;
      let endDate: string;

      if (period === 'hoy') {
        startDate = today;
        endDate = today;
      } else if (period === 'ayer') {
        const yesterday = new Date(today + 'T12:00:00');
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = toISODate(yesterday);
        startDate = yStr;
        endDate = yStr;
      } else if (period === 'semana') {
        const weekAgo = new Date(today + 'T12:00:00');
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = toISODate(weekAgo);
        endDate = today;
      } else {
        const d = new Date(today + 'T12:00:00');
        startDate = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
        endDate = today;
      }

      const sales = await saleService.getSalesByDateRange(selectedStoreId, startDate, `${endDate}T23:59:59`);
      const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

      const allExpenses = await expenseRepo.getByDateRange(selectedStoreId, startDate, `${endDate}T23:59:59`);
      const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);

      setIngresos(totalRevenue);
      setEgresos(totalExpenses);

      // Transacciones del periodo (últimas 10)
      setRecentSales(sales.slice(0, 10));
      setRecentExpenses(allExpenses.slice(0, 10));

      // C1: Daily audit data (solo para hoy)
      if (period === 'hoy') {
        try {
          const opening = await cashClosingService.getOpeningByDate(selectedStoreId, today);
          setOpeningBase(opening?.total ?? 0);

          const dailySales = await saleService.getDailySummary(selectedStoreId, today);
          setTodayCashSales(dailySales.totalCashAmount ?? dailySales.totalAmount ?? 0);

          const dailyExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
          setTodayCashExpenses(dailyExpenses);

          const closing = await cashClosingService.getClosingByDate(selectedStoreId, today);
          setClosingActual(closing?.actualTotal ?? null);
        } catch { /* ignore */ }
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, saleService, expenseRepo, cashClosingService, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const utilidad = ingresos - egresos;

  const handleDeleteSale = useCallback((sale: Sale) => {
    Alert.alert(
      'Eliminar venta',
      `¿Seguro que deseas eliminar esta venta de ${formatCOP(sale.totalAmount)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await saleRepo.delete(sale.id);
              loadData();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la venta');
            }
          },
        },
      ],
    );
  }, [saleRepo, loadData]);

  const handleDeleteExpense = useCallback((expense: Expense) => {
    Alert.alert(
      'Eliminar gasto',
      `¿Seguro que deseas eliminar "${expense.description}" (${formatCOP(expense.amount)})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await expenseRepo.delete(expense.id);
              loadData();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el gasto');
            }
          },
        },
      ],
    );
  }, [expenseRepo, loadData]);

  const handleEditExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setEditDescription(expense.description);
    setEditAmount(expense.amount);
    setEditModalVisible(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingExpense) return;
    try {
      await expenseRepo.update(editingExpense.id, {
        description: editDescription,
        amount: editAmount,
      });
      setEditModalVisible(false);
      setEditingExpense(null);
      loadData();
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el gasto');
    }
  }, [editingExpense, editDescription, editAmount, expenseRepo, loadData]);

  if (loading) {
    return <LoadingIndicator message="Cargando datos contables..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      {/* Period filter */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        {(['hoy', 'ayer', 'semana', 'mes'] as const).map((p) => (
          <Chip
            key={p}
            selected={period === p}
            onPress={() => setPeriod(p)}
            mode={period === p ? 'flat' : 'outlined'}
            style={period === p ? { backgroundColor: theme.colors.primaryContainer } : undefined}
          >
            {p === 'hoy' ? 'Hoy' : p === 'ayer' ? 'Ayer' : p === 'semana' ? 'Semana' : 'Mes'}
          </Chip>
        ))}
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <KpiCard icon="arrow-down-circle" label="Ingresos" value={formatCOP(ingresos)} color="#388E3C" />
        <KpiCard icon="arrow-up-circle" label="Egresos" value={formatCOP(egresos)} color="#D32F2F" />
      </View>
      <View style={styles.kpiRow}>
        <KpiCard
          icon="chart-line"
          label="Utilidad"
          value={formatCOP(utilidad)}
          color={utilidad >= 0 ? '#388E3C' : '#D32F2F'}
        />
      </View>

      {/* Nav buttons */}
      <View style={styles.navRow}>
        <Button
          mode="outlined"
          icon="wallet"
          onPress={() => router.push('/(tabs)/contabilidad/gastos')}
        >
          Gastos
        </Button>
        <Button
          mode="outlined"
          icon="bank"
          onPress={() => router.push('/(tabs)/contabilidad/bancos')}
        >
          Bancos
        </Button>
        <Button
          mode="outlined"
          icon="calendar-check"
          onPress={() => router.push('/(tabs)/contabilidad/cierres')}
        >
          Cierres
        </Button>
        <Button
          mode="outlined"
          icon="cart"
          onPress={() => router.push('/(tabs)/inventario/compras')}
        >
          Compras
        </Button>
        <Button
          mode="outlined"
          icon="scale-balance"
          onPress={() => router.push('/(tabs)/contabilidad/balances')}
        >
          Balances
        </Button>
      </View>

      {/* C1: Daily Audit / Arqueo Diario — solo para Hoy */}
      {period === 'hoy' && <Card style={styles.txCard} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 8 }}>
            Arqueo Diario
          </Text>
          <View style={styles.txRow}>
            <Text variant="bodySmall">Apertura</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(openingBase)}</Text>
          </View>
          <View style={styles.txRow}>
            <Text variant="bodySmall">+ Ventas Efectivo</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#388E3C' }}>{formatCOP(todayCashSales)}</Text>
          </View>
          <View style={styles.txRow}>
            <Text variant="bodySmall">- Egresos Efectivo</Text>
            <Text variant="bodySmall" style={{ fontWeight: '600', color: '#D32F2F' }}>{formatCOP(todayCashExpenses)}</Text>
          </View>
          <View style={[styles.txRow, { borderTopWidth: 1, borderTopColor: '#333', paddingTop: 6, marginTop: 4 }]}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Saldo Teorico</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {formatCOP(openingBase + todayCashSales - todayCashExpenses)}
            </Text>
          </View>
          {closingActual !== null && (
            <View style={styles.txRow}>
              <Text variant="bodySmall">Conteo Fisico (cierre)</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600' }}>{formatCOP(closingActual)}</Text>
            </View>
          )}
        </Card.Content>
      </Card>}

      {/* Recent transactions */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Transacciones Recientes
      </Text>

      {recentSales.map((sale) => (
        <Card key={sale.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Venta</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatDateTime(sale.timestamp)}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#388E3C', flexShrink: 0, marginRight: 4 }}>
              +{formatCOP(sale.totalAmount)}
            </Text>
            <IconButton
              icon="delete-outline"
              size={18}
              iconColor="#D32F2F"
              onPress={() => handleDeleteSale(sale)}
              style={{ margin: 0 }}
            />
          </Card.Content>
        </Card>
      ))}

      {recentExpenses.map((expense) => (
        <Card key={expense.id} style={styles.txCard} mode="elevated">
          <Card.Content style={styles.txRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{expense.category}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                {expense.description}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#D32F2F', flexShrink: 0, marginRight: 4 }}>
              -{formatCOP(expense.amount)}
            </Text>
            <IconButton
              icon="pencil-outline"
              size={18}
              iconColor="#FF9800"
              onPress={() => handleEditExpense(expense)}
              style={{ margin: 0 }}
            />
            <IconButton
              icon="delete-outline"
              size={18}
              iconColor="#D32F2F"
              onPress={() => handleDeleteExpense(expense)}
              style={{ margin: 0 }}
            />
          </Card.Content>
        </Card>
      ))}

      <View style={{ height: 100 }} />

      {/* Edit Expense Modal */}
      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleLarge" style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Editar Gasto
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            {editingExpense?.category}
          </Text>
          <TextInput
            label="Descripcion"
            value={editDescription}
            onChangeText={setEditDescription}
            mode="outlined"
            style={{ marginBottom: 12 }}
          />
          <CurrencyInput
            value={editAmount}
            onChangeValue={setEditAmount}
            label="Monto"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <Button mode="text" onPress={() => setEditModalVisible(false)}>
              Cancelar
            </Button>
            <Button
              mode="contained"
              buttonColor="#E63946"
              textColor="#FFFFFF"
              onPress={handleSaveEdit}
            >
              Guardar
            </Button>
          </View>
        </Modal>
      </Portal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  txCard: {
    borderRadius: 8,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modal: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
});
