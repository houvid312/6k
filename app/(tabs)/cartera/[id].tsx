import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Divider, Chip, Portal, Snackbar, useTheme } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { CreditEntry, Expense } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate } from '../../../src/utils/dates';

/** Calculate days since a date string */
function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Get color for days pending: green < 7, orange 7-14, red > 14 */
function getDaysColor(days: number): string {
  if (days <= 7) return '#388E3C';
  if (days <= 14) return '#E65100';
  return '#D32F2F';
}

/** Get background color for days pending chip */
function getDaysBgColor(days: number): string {
  if (days <= 7) return '#E8F5E9';
  if (days <= 14) return '#FFF3E0';
  return '#FFEBEE';
}

/** Calculate next follow-up date (every 7 days from creation) */
function getNextFollowUp(dateStr: string): { daysUntil: number; label: string } {
  const days = daysSince(dateStr);
  const nextMultiple = Math.ceil((days + 1) / 7) * 7;
  const daysUntil = nextMultiple - days;

  if (daysUntil === 0) return { daysUntil: 0, label: 'Hoy' };
  if (daysUntil === 1) return { daysUntil: 1, label: 'Manana' };
  return { daysUntil, label: `En ${daysUntil} dias` };
}

export default function DebtorDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { creditService, expenseRepo } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [credit, setCredit] = useState<CreditEntry | null>(null);
  const [relatedCredits, setRelatedCredits] = useState<CreditEntry[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'MIXTO'>('TRANSFERENCIA');
  const [cashPart, setCashPart] = useState(0);
  const [bankPart, setBankPart] = useState(0);
  const [creditPayments, setCreditPayments] = useState<any[]>([]);
  const [creditMethods, setCreditMethods] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const all = await creditService.getAllCredits();
      const found = all.find((c) => c.id === id);
      setCredit(found ?? null);

      if (found) {
        const related = await creditService.getCreditsByDebtor(found.debtorName);
        setRelatedCredits(related);

        const payments = await creditService.getPaymentsByCredit(found.id);
        setCreditPayments(payments);

        // Fetch payment methods for related credits
        const methods: Record<string, string> = {};
        await Promise.all(
          related.map(async (c) => {
            if (c.expenseId) {
              try {
                const exp = await expenseRepo.getById(c.expenseId);
                if (exp) {
                  methods[c.id] = exp.paymentMethod;
                }
              } catch (e) {
                console.error('Error fetching associated expense:', e);
              }
            } else if (c.saleId) {
              methods[c.id] = 'VENTA';
            } else if (c.transferId) {
              methods[c.id] = 'TRASLADO';
            } else {
              methods[c.id] = 'MANUAL';
            }
          })
        );
        setCreditMethods(methods);
      }
    } catch {
      setCredit(null);
    } finally {
      setLoading(false);
    }
  }, [id, creditService, expenseRepo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePayment = useCallback(async () => {
    if (!credit) return;

    if (paymentMethod === 'MIXTO') {
      if (cashPart <= 0 && bankPart <= 0) {
        showError('Por favor ingresa montos válidos para pago mixto.');
        return;
      }
      if (cashPart + bankPart > credit.balance) {
        showError(`El total del abono (${formatCOP(cashPart + bankPart)}) supera el saldo pendiente del crédito (${formatCOP(credit.balance)})`);
        return;
      }
    } else {
      if (paymentAmount <= 0) {
        showError('Ingresa un monto válido');
        return;
      }
      if (paymentAmount > credit.balance) {
        showError(`El abono (${formatCOP(paymentAmount)}) supera el saldo pendiente del crédito (${formatCOP(credit.balance)})`);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (paymentMethod === 'EFECTIVO') {
        await creditService.registerPayment(credit.id, paymentAmount, 'Abono manual en Efectivo');
        showSuccess(`${formatCOP(paymentAmount)} en Efectivo aplicado a ${credit.debtorName}`);
      } else if (paymentMethod === 'TRANSFERENCIA') {
        await creditService.registerPayment(credit.id, paymentAmount, 'Abono manual por Transferencia');
        showSuccess(`${formatCOP(paymentAmount)} por Transferencia aplicado a ${credit.debtorName}`);
      } else {
        if (cashPart > 0) {
          await creditService.registerPayment(credit.id, cashPart, 'Abono manual en Efectivo (Parte de pago Mixto)');
        }
        if (bankPart > 0) {
          await creditService.registerPayment(credit.id, bankPart, 'Abono manual por Transferencia (Parte de pago Mixto)');
        }
        showSuccess(`Abono mixto de ${formatCOP(cashPart + bankPart)} aplicado a ${credit.debtorName}`);
      }

      setPaymentAmount(0);
      setCashPart(0);
      setBankPart(0);
      loadData();
    } catch (err: any) {
      showError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setSubmitting(false);
    }
  }, [credit, paymentAmount, paymentMethod, cashPart, bankPart, creditService, loadData, showSuccess, showError]);

  if (loading) {
    return <LoadingIndicator message="Cargando deuda..." />;
  }

  if (!credit) {
    return (
      <ScreenContainer>
        <Text variant="bodyLarge">Credito no encontrado</Text>
        <Button onPress={() => router.back()}>Volver</Button>
      </ScreenContainer>
    );
  }

  const totalBalance = relatedCredits
    .filter((c) => !c.isPaid)
    .reduce((sum, c) => sum + c.balance, 0);

  return (
    <ScreenContainer>
      {/* Debtor info */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
            {credit.debtorName}
          </Text>
          <View style={styles.chipRow}>
            <Chip compact>{credit.debtorType}</Chip>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.balanceRow}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Saldo pendiente total
            </Text>
            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.error }}>
              {formatCOP(totalBalance)}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Register payment */}
      {!credit.isPaid && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
              Registrar Pago
            </Text>

            {/* Medio de Pago Selector */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
              {(['TRANSFERENCIA', 'EFECTIVO', 'MIXTO'] as const).map((method) => (
                <Chip
                  key={method}
                  selected={paymentMethod === method}
                  onPress={() => setPaymentMethod(method)}
                  style={{ 
                    backgroundColor: paymentMethod === method ? '#E63946' : '#2A2A2A',
                    borderRadius: 8
                  }}
                  textStyle={{ color: '#FFF', fontSize: 11 }}
                  showSelectedOverlay={false}
                >
                  {method === 'TRANSFERENCIA' ? 'Bancos' : method === 'EFECTIVO' ? 'Efectivo' : 'Mixto'}
                </Chip>
              ))}
            </View>

            {paymentMethod === 'MIXTO' ? (
              <View>
                <CurrencyInput
                  value={cashPart}
                  onChangeValue={setCashPart}
                  label="Monto en Efectivo"
                />
                <View style={{ height: 12 }} />
                <CurrencyInput
                  value={bankPart}
                  onChangeValue={setBankPart}
                  label="Monto por Transferencia"
                />
              </View>
            ) : (
              <CurrencyInput
                value={paymentAmount}
                onChangeValue={setPaymentAmount}
                label={paymentMethod === 'EFECTIVO' ? "Monto en Efectivo" : "Monto por Transferencia"}
              />
            )}

            <Button
              mode="contained"
              onPress={handlePayment}
              loading={submitting}
              disabled={submitting}
              style={styles.payBtn}
              icon="cash"
            >
              Registrar Pago
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Extracto de Abonos (Credit extract) */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
            Extracto de Abonos a este Crédito
          </Text>
          {creditPayments.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic' }}>
              No se han registrado abonos para este crédito aún.
            </Text>
          ) : (
            creditPayments.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#222' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '500', color: '#F5F0EB' }}>
                    {p.notes || 'Abono manual'}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                    Fecha: {formatDate(p.date)}
                  </Text>
                </View>
                <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: '#4CAF50', marginLeft: 8 }}>
                  +{formatCOP(p.amount)}
                </Text>
              </View>
            ))
          )}
        </Card.Content>
      </Card>

      {/* Credit history */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Historial de Creditos
      </Text>

      {relatedCredits.map((c) => {
        const days = daysSince(c.date);
        const daysColor = getDaysColor(days);
        const daysBgColor = getDaysBgColor(days);
        const followUp = !c.isPaid ? getNextFollowUp(c.date) : null;

        const method = creditMethods[c.id];
        let mediumLabel = '';
        let mediumColor = '#555';
        if (method === 'EFECTIVO') {
          mediumLabel = 'Efectivo';
          mediumColor = '#E2B13C';
        } else if (method === 'TRANSFERENCIA') {
          mediumLabel = 'Transferencia';
          mediumColor = '#1976D2';
        } else if (method === 'VENTA') {
          mediumLabel = 'Venta';
          mediumColor = '#E63946';
        } else if (method === 'TRASLADO') {
          mediumLabel = 'Traslado';
          mediumColor = '#8E24AA';
        } else if (method === 'MANUAL') {
          mediumLabel = 'Manual';
          mediumColor = '#757575';
        }

        return (
          <Card key={c.id} style={styles.historyCard} mode="elevated">
            <Card.Content>
              <View style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                    {c.concept}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {formatDate(c.date)}
                  </Text>
                  {c.transferId && (
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                      Traslado {c.transferId.slice(-6)}
                    </Text>
                  )}

                  {/* Days pending indicator */}
                  <View style={styles.indicatorRow}>
                    {mediumLabel && (
                      <Chip
                        compact
                        textStyle={{ fontSize: 10, color: '#FFF' }}
                        style={{ backgroundColor: mediumColor }}
                      >
                        {mediumLabel}
                      </Chip>
                    )}

                    <Chip
                      compact
                      textStyle={{ fontSize: 10, color: c.isPaid ? '#388E3C' : daysColor }}
                      style={{ backgroundColor: c.isPaid ? '#E8F5E9' : daysBgColor }}
                    >
                      {c.isPaid ? 'Pagado' : `${days} dia${days !== 1 ? 's' : ''} pendiente`}
                    </Chip>

                    {/* Next follow-up indicator */}
                    {followUp && (
                      <Chip
                        compact
                        icon="calendar-clock"
                        textStyle={{ fontSize: 10, color: '#F5F0EB' }}
                        style={{ backgroundColor: 'rgba(245, 240, 235, 0.1)' }}
                      >
                        {followUp.label}
                      </Chip>
                    )}
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                    {formatCOP(c.amount)}
                  </Text>
                  {!c.isPaid && (
                    <Text variant="labelSmall" style={{ color: '#D32F2F' }}>
                      Debe: {formatCOP(c.balance)}
                    </Text>
                  )}
                </View>
              </View>
            </Card.Content>
          </Card>
        );
      })}

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
  card: {
    borderRadius: 12,
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  divider: {
    marginVertical: 12,
  },
  balanceRow: {
    alignItems: 'center',
  },
  payBtn: {
    marginTop: 12,
    borderRadius: 8,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  historyCard: {
    borderRadius: 8,
    marginBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
});
