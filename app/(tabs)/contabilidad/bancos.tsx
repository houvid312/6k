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
  const { cashAuditRepo, cashClosingService, expenseRepo, purchaseRepo, creditRepo } = useDI();
  const { selectedStoreId, stores } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [totalBank, setTotalBank] = useState(0);
  const [movements, setMovements] = useState<BankMovement[]>([]);

  const loadData = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const today = todayColombia();
      const lastAudit = await cashAuditRepo.getLastAuditBeforeDate(selectedStoreId, today);
      const anchorDate = lastAudit ? lastAudit.date : '2020-01-01';
      const endDateTime = `${today}T23:59:59`;

      const [closings, audits, ledgerExpenses, ledgerPurchases, creditPaymentsRes, credits] = await Promise.all([
        cashClosingService.getClosingsByDateRange(selectedStoreId, anchorDate, today),
        cashAuditRepo.getByDateRange(selectedStoreId, anchorDate, today),
        expenseRepo.getByDateRange(selectedStoreId, anchorDate, endDateTime),
        purchaseRepo.getByDateRange(anchorDate, endDateTime, selectedStoreId),
        supabase
          .from('credit_payments')
          .select('*, credit_entries(debtor_type, store_id, debtor_name)')
          .gte('date', anchorDate)
          .lte('date', today),
        creditRepo.getAll(),
      ]);

      const appliedStore = stores.find((s) => s.id === selectedStoreId);
      const isProd = appliedStore?.isProductionCenter ?? false;

      const initialBank = lastAudit ? lastAudit.bankTotal : 0;
      let runningBank = initialBank;

      const dates = getDatesInRange(anchorDate, today);
      const closingsByDate = new Map(closings.map((c) => [c.date, c]));
      const auditsByDate = new Map(audits.map((a) => [a.date, a]));

      // Segment expenses and purchases by date and payment method
      const bankExpensesByDate = new Map<string, any[]>();
      for (const exp of ledgerExpenses) {
        const isRegister = exp.category === 'Compra Turno' || exp.category === 'Adelanto';
        if (!isRegister && exp.paymentMethod !== PaymentMethod.EFECTIVO) {
          const expDate = exp.date.split('T')[0];
          const list = bankExpensesByDate.get(expDate) ?? [];
          list.push(exp);
          bankExpensesByDate.set(expDate, list);
        }
      }

      const bankPurchasesByDate = new Map<string, any[]>();
      for (const pur of ledgerPurchases) {
        if (pur.paymentMethod !== PaymentMethod.EFECTIVO) {
          const purDate = pur.timestamp.split('T')[0];
          const list = bankPurchasesByDate.get(purDate) ?? [];
          list.push(pur);
          bankPurchasesByDate.set(purDate, list);
        }
      }

      // Segment credit payments (abonos) by date and payment method
      const bankPaymentsByDate = new Map<string, any[]>();
      const cpOutflowPaymentsByDate = new Map<string, any[]>();

      const creditPayments = (creditPaymentsRes.data || []) as any[];
      for (const p of creditPayments) {
        const entry = p.credit_entries;
        if (!entry) continue;

        const pDate = p.date;
        const isCpCredit = entry.debtor_type === 'LOCAL';

        if (isProd) {
          if (isCpCredit) {
            const list = bankPaymentsByDate.get(pDate) ?? [];
            list.push({ ...p, debtorName: entry.debtor_name });
            bankPaymentsByDate.set(pDate, list);
          }
        } else {
          if (entry.store_id === selectedStoreId) {
            if (isCpCredit) {
              const list = cpOutflowPaymentsByDate.get(pDate) ?? [];
              list.push(p);
              cpOutflowPaymentsByDate.set(pDate, list);
            } else {
              const isCash = p.notes?.toLowerCase().includes('efectivo') ?? false;
              if (!isCash) {
                const list = bankPaymentsByDate.get(pDate) ?? [];
                list.push({ ...p, debtorName: entry.debtor_name });
                bankPaymentsByDate.set(pDate, list);
              }
            }
          }
        }
      }

      const allMovements: BankMovement[] = [];

      if (lastAudit) {
        allMovements.push({
          id: `audit-start-${lastAudit.id}`,
          date: lastAudit.date,
          type: 'Saldo Inicial Arqueado',
          concept: `Arqueo físico de bancos registrado el ${lastAudit.date}`,
          amount: lastAudit.bankTotal,
        });
      }

      for (const date of dates) {
        const closing = closingsByDate.get(date);
        const audit = auditsByDate.get(date);

        const isApproved = closing && closing.status === ClosingStatus.APPROVED;
        const salesTransferBank = isApproved ? closing.bankTotal : 0;

        if (salesTransferBank > 0) {
          allMovements.push({
            id: `closing-bank-${closing!.id}`,
            date,
            type: 'Depósito Cierre Ventas',
            concept: `Cierre del turno del día (aprobado)`,
            amount: salesTransferBank,
          });
          runningBank += salesTransferBank;
        }

        const exps = bankExpensesByDate.get(date) ?? [];
        for (const exp of exps) {
          allMovements.push({
            id: `exp-${exp.id}`,
            date,
            type: 'Gasto Bancario',
            concept: `${exp.category} - ${exp.description}`,
            amount: -exp.amount,
          });
          runningBank -= exp.amount;
        }

        const purs = bankPurchasesByDate.get(date) ?? [];
        for (const pur of purs) {
          allMovements.push({
            id: `pur-${pur.id}`,
            date,
            type: 'Compra Insumo',
            concept: `${pur.supplier || 'Proveedor'}`,
            amount: -pur.priceCOP,
          });
          runningBank -= pur.priceCOP;
        }

        const pays = bankPaymentsByDate.get(date) ?? [];
        for (const pay of pays) {
          allMovements.push({
            id: `pay-in-${pay.id}`,
            date,
            type: 'Abono Recibido (Cartera)',
            concept: `Abono de ${pay.debtorName || 'Deudor'}`,
            amount: pay.amount,
          });
          runningBank += pay.amount;
        }

        const cpOuts = cpOutflowPaymentsByDate.get(date) ?? [];
        for (const cpOut of cpOuts) {
          allMovements.push({
            id: `pay-out-${cpOut.id}`,
            date,
            type: 'Pago Franquicia (CP)',
            concept: `Abono enviado al Centro de Producción`,
            amount: -cpOut.amount,
          });
          runningBank -= cpOut.amount;
        }

        if (audit) {
          const diff = audit.bankTotal - runningBank;
          if (Math.abs(diff) > 0.01) {
            allMovements.push({
              id: `audit-adj-${audit.id}`,
              date,
              type: 'Ajuste de Arqueo',
              concept: `Diferencia de conciliación física (Arqueado: ${formatCOP(audit.bankTotal)} vs Teórico: ${formatCOP(runningBank)})`,
              amount: diff,
            });
          }
          runningBank = audit.bankTotal;
        }
      }

      setTotalBank(runningBank);
      allMovements.reverse();
      setMovements(allMovements);
    } catch (e) {
      console.error(e);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, cashAuditRepo, cashClosingService, expenseRepo, purchaseRepo, creditRepo, stores]);

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

      <KpiCard
        icon="bank"
        label="Total en Banco"
        value={formatCOP(totalBank)}
        color="#1976D2"
      />

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
