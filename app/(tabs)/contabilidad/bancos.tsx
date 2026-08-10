import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Divider, useTheme } from 'react-native-paper';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { StoreSelector } from '../../../src/components/common/StoreSelector';
import { KpiCard } from '../../../src/components/common/KpiCard';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useAppStore } from '../../../src/stores/useAppStore';
import { PaymentMethod, ClosingStatus } from '../../../src/domain/enums';
import { formatCOP } from '../../../src/utils/currency';
import { todayColombia } from '../../../src/utils/dates';
import { supabase } from '../../../src/lib/supabase';

interface BankMovement {
  id: string;
  date: string;
  type: string;
  concept: string;
  amount: number;
}

function getDatesInRange(startStr: string, endStr: string) {
  const dates: string[] = [];
  const curr = new Date(`${startStr}T12:00:00`);
  const end = new Date(`${endStr}T12:00:00`);
  while (curr <= end) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

export default function BancosScreen() {
  const theme = useTheme();
  const { cashClosingService, expenseRepo, purchaseRepo, creditRepo, incomeRepo } = useDI();
  const { selectedStoreId, stores } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [totalBank, setTotalBank] = useState(0);
  const [movements, setMovements] = useState<BankMovement[]>([]);

  const loadData = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const today = todayColombia();
      const startDate = '2020-01-01';

      const [closings, ledgerExpenses, ledgerPurchases, creditPaymentsRes, incomes] = await Promise.all([
        cashClosingService.getClosingsByDateRange(selectedStoreId, startDate, today),
        expenseRepo.getByDateRange(selectedStoreId, startDate, today),
        purchaseRepo.getByDateRange(startDate, today, selectedStoreId),
        supabase
          .from('credit_payments')
          .select('*, credit_entries(debtor_type, store_id, debtor_name)')
          .gte('date', startDate)
          .lte('date', today),
        incomeRepo.getAll(selectedStoreId),
      ]);

      const appliedStore = stores.find((s) => s.id === selectedStoreId);
      const isProd = appliedStore?.isProductionCenter ?? false;

      const allMovements: BankMovement[] = [];

      // 1. General Incomes (Capitalización, Inversión, etc.) via Bank
      for (const inc of incomes) {
        if (inc.paymentMethod !== PaymentMethod.EFECTIVO) {
          const incDate = inc.date ? inc.date.split('T')[0] : today;
          allMovements.push({
            id: `inc-${inc.id}`,
            date: incDate,
            type: `Ingreso Bancario (${inc.category || 'General'})`,
            concept: inc.description || inc.category || 'Ingreso bancario',
            amount: inc.amount,
          });
        }
      }

      // 2. Sales Closings (Approved or Confirmed with bank transfer total)
      for (const closing of closings) {
        if ((closing.status === ClosingStatus.APPROVED || closing.status === ClosingStatus.CONFIRMED) && closing.bankTotal > 0) {
          allMovements.push({
            id: `closing-bank-${closing.id}`,
            date: closing.date,
            type: 'Depósito Cierre Ventas',
            concept: `Cierre del turno del día (${closing.date})`,
            amount: closing.bankTotal,
          });
        }
      }

      // 3. Bank Expenses
      for (const exp of ledgerExpenses) {
        const isRegister = exp.category === 'Compra Turno' || exp.category === 'Adelanto';
        if (!isRegister && exp.paymentMethod !== PaymentMethod.EFECTIVO) {
          const expDate = exp.date.split('T')[0];
          allMovements.push({
            id: `exp-${exp.id}`,
            date: expDate,
            type: 'Gasto Bancario',
            concept: `${exp.category} - ${exp.description}`,
            amount: -exp.amount,
          });
        }
      }

      // 4. Bank Purchases
      for (const pur of ledgerPurchases) {
        if (pur.paymentMethod !== PaymentMethod.EFECTIVO) {
          const purDate = pur.timestamp.split('T')[0];
          allMovements.push({
            id: `pur-${pur.id}`,
            date: purDate,
            type: 'Compra Insumo',
            concept: `${pur.supplier || 'Proveedor'}`,
            amount: -pur.priceCOP,
          });
        }
      }

      // 5. Bank Credit Payments (Abonos de Cartera)
      const creditPayments = (creditPaymentsRes.data || []) as any[];
      for (const p of creditPayments) {
        const entry = p.credit_entries;
        if (!entry) continue;

        const pDate = p.date;
        const isCpCredit = entry.debtor_type === 'LOCAL';

        if (isProd) {
          if (isCpCredit) {
            // El ingreso por traslado al CP ya fue contabilizado en Ingreso Bancario (incomes con categoría 'Traslado').
            // Solo se suma si el pago NO tiene un registro de income asociado para evitar la doble suma.
            if (!p.income_id && !p.incomeId) {
              allMovements.push({
                id: `pay-in-${p.id}`,
                date: pDate,
                type: 'Abono Recibido (Local)',
                concept: `Abono de ${entry.debtor_name || 'Local'}`,
                amount: p.amount,
              });
            }
          }
        } else {
          if (entry.store_id === selectedStoreId) {
            if (isCpCredit) {
              // El egreso de traslado ya fue contabilizado en Gasto Bancario (ledgerExpenses con categoría 'Traslado').
              // No se resta por segunda vez aquí para evitar el doble cobro en bancos.
            } else {
              const isCash = p.notes?.toLowerCase().includes('efectivo') ?? false;
              if (!isCash) {
                allMovements.push({
                  id: `pay-in-${p.id}`,
                  date: pDate,
                  type: 'Abono Recibido (Cartera)',
                  concept: `Abono de ${entry.debtor_name || 'Deudor'}`,
                  amount: p.amount,
                });
              }
            }
          }
        }
      }

      // Sort movements chronologically (oldest first) to compute running total
      allMovements.sort((a, b) => a.date.localeCompare(b.date));

      let runningBank = 0;
      for (const m of allMovements) {
        runningBank += m.amount;
      }

      setTotalBank(runningBank);

      // Display newest movements first
      allMovements.reverse();
      setMovements(allMovements);
    } catch (e) {
      console.error('Error cargando movimientos de banco:', e);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, cashClosingService, expenseRepo, purchaseRepo, creditRepo, incomeRepo, stores]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingIndicator message="Conciliando banco..." />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <StoreSelector />
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <KpiCard
          icon="bank"
          label="Total en Banco"
          value={formatCOP(totalBank)}
          color="#1976D2"
        />
      </View>

      <Divider style={styles.divider} />

      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Movimientos Bancarios Conciliados
      </Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        {movements.length === 0 ? (
          <EmptyState
            icon="bank-off"
            title="Sin movimientos"
            subtitle="No hay transacciones bancarias registradas o aprobadas"
          />
        ) : (
          movements.map((m) => (
            <Card key={m.id} style={styles.txCard} mode="elevated">
              <Card.Content style={styles.txRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#FFF' }}>
                    {m.type}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                    {m.concept}
                  </Text>
                  <Text variant="bodySmall" style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
                    {m.date}
                  </Text>
                </View>
                <Text variant="bodyMedium" style={{ fontWeight: '700', color: m.amount >= 0 ? '#4CAF50' : '#E63946' }}>
                  {m.amount >= 0 ? '+' : ''}{formatCOP(m.amount)}
                </Text>
              </Card.Content>
            </Card>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  divider: {
    marginVertical: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  txCard: {
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#1E1E1E',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
