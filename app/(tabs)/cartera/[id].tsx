import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Divider, Chip, Portal, Snackbar, useTheme } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { useAppStore } from '../../../src/stores/useAppStore';
import { CreditEntry, Expense } from '../../../src/domain/entities';
import { PaymentMethod } from '../../../src/domain/enums';
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
  const { selectedStoreId, stores } = useAppStore();

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

  const isProduction = useMemo(() => {
    if (!selectedStoreId) return false;
    const currentStore = stores.find(s => s.id === selectedStoreId);
    return currentStore?.isProductionCenter ?? false;
  }, [selectedStoreId, stores]);

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

    const isLocal = credit.debtorType === 'LOCAL';

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
      if (isLocal) {
        // Local transfer billing payment flow (Generates pending payment & local expense)
        if (paymentMethod === 'EFECTIVO') {
          await creditService.registerLocalPayment(credit.id, paymentAmount, PaymentMethod.EFECTIVO, 'Abono de traslado en Efectivo (Pendiente)');
          showSuccess(`Pago de ${formatCOP(paymentAmount)} en Efectivo registrado. Pendiente de confirmación.`);
        } else if (paymentMethod === 'TRANSFERENCIA') {
          await creditService.registerLocalPayment(credit.id, paymentAmount, PaymentMethod.TRANSFERENCIA, 'Abono de traslado por Transferencia (Pendiente)');
          showSuccess(`Pago de ${formatCOP(paymentAmount)} por Transferencia registrado. Pendiente de confirmación.`);
        } else {
          if (cashPart > 0) {
            await creditService.registerLocalPayment(credit.id, cashPart, PaymentMethod.EFECTIVO, 'Abono de traslado en Efectivo (Parte de pago Mixto, Pendiente)');
          }
          if (bankPart > 0) {
            await creditService.registerLocalPayment(credit.id, bankPart, PaymentMethod.TRANSFERENCIA, 'Abono de traslado por Transferencia (Parte de pago Mixto, Pendiente)');
          }
          showSuccess(`Pago mixto de ${formatCOP(cashPart + bankPart)} registrado. Pendiente de confirmación.`);
        }
      } else {
        // Standard credit payment flow (Directly applies and updates balance)
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

  const handleConfirmPayment = useCallback(async (paymentId: string) => {
    setSubmitting(true);
    try {
      await creditService.confirmLocalPayment(paymentId);
      showSuccess('Abono confirmado y registrado como ingreso.');
      loadData();
    } catch (err: any) {
      showError(err instanceof Error ? err.message : 'No se pudo confirmar el abono');
    } finally {
      setSubmitting(false);
    }
  }, [creditService, loadData, showSuccess, showError]);

  const handleRejectPayment = useCallback(async (paymentId: string) => {
    setSubmitting(true);
    try {
      await creditService.rejectLocalPayment(paymentId);
      showSuccess('Abono rechazado y egreso del local revertido.');
      loadData();
    } catch (err: any) {
      showError(err instanceof Error ? err.message : 'No se pudo rechazar el abono');
    } finally {
      setSubmitting(false);
    }
  }, [creditService, loadData, showSuccess, showError]);

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

  const isLocalDebt = credit.debtorType === 'LOCAL';
  const displayName = isLocalDebt && !isProduction 
    ? 'Centro de Producción' 
    : credit.debtorName;

  return (
    <ScreenContainer>
      {/* Debtor info */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
            {displayName}
          </Text>
          <View style={styles.chipRow}>
            <Chip compact style={isLocalDebt && { backgroundColor: 'rgba(230, 57, 70, 0.15)' }}>
              {isLocalDebt && !isProduction ? 'CUENTA POR PAGAR' : credit.debtorType}
            </Chip>
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
      {!credit.isPaid && (!isLocalDebt || !isProduction) && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleSmall" style={{ fontWeight: '600', marginBottom: 12 }}>
              {isLocalDebt ? 'Registrar Pago al Centro de Producción' : 'Registrar Pago'}
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
              {isLocalDebt ? 'Enviar Pago para Confirmación' : 'Registrar Pago'}
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
            creditPayments.map((p) => {
              const isLocal = credit.debtorType === 'LOCAL';
              const isPending = p.status === 'PENDING';
              const isConfirmed = p.status === 'CONFIRMED';
              const isRejected = p.status === 'REJECTED';

              let statusColor = '#E63946';
              let statusLabel = '';
              if (isPending) {
                statusColor = '#F57C00';
                statusLabel = 'Pendiente';
              } else if (isConfirmed) {
                statusColor = '#4CAF50';
                statusLabel = 'Confirmado';
              } else if (isRejected) {
                statusColor = '#D32F2F';
                statusLabel = 'Rechazado';
              }

              return (
                <View key={p.id} style={{ borderBottomWidth: 1, borderBottomColor: '#222', paddingVertical: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '500', color: '#F5F0EB' }}>
                        {p.notes || 'Abono manual'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                          Fecha: {formatDate(p.date)}
                        </Text>
                        {p.paymentMethod && (
                          <View style={{ backgroundColor: '#333', borderRadius: 4, paddingHorizontal: 6, height: 18, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '600', lineHeight: 11 }}>
                              {p.paymentMethod}
                            </Text>
                          </View>
                        )}
                        {isLocal && (
                          <View style={{ backgroundColor: statusColor, borderRadius: 4, paddingHorizontal: 6, height: 18, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '600', lineHeight: 11 }}>
                              {statusLabel}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: isConfirmed || !isLocal ? '#4CAF50' : '#888', marginLeft: 8 }}>
                      +{formatCOP(p.amount)}
                    </Text>
                  </View>
                  
                  {/* Actions for CP when status is PENDING */}
                  {isLocal && isPending && isProduction && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <Button
                        mode="contained"
                        compact
                        icon="check"
                        buttonColor="#388E3C"
                        textColor="#FFF"
                        onPress={() => handleConfirmPayment(p.id)}
                        disabled={submitting}
                        style={{ borderRadius: 6 }}
                      >
                        Confirmar Recibo
                      </Button>
                      <Button
                        mode="outlined"
                        compact
                        icon="close"
                        textColor="#D32F2F"
                        style={{ borderColor: '#D32F2F', borderRadius: 6 }}
                        onPress={() => handleRejectPayment(p.id)}
                        disabled={submitting}
                      >
                        Rechazar
                      </Button>
                    </View>
                  )}
                </View>
              );
            })
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
