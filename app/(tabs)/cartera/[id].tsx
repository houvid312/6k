import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, Button, Divider, Chip, Portal, Snackbar, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { useAppStore } from '../../../src/stores/useAppStore';
import { CreditEntry } from '../../../src/domain/entities';
import { PaymentMethod, UserRole } from '../../../src/domain/enums';
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
  if (daysUntil === 1) return { daysUntil: 1, label: 'Mañana' };
  return { daysUntil, label: `En ${daysUntil} días` };
}

export default function DebtorDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { creditService, expenseRepo } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();
  const { selectedStoreId, stores, userRole } = useAppStore();

  const [credit, setCredit] = useState<CreditEntry | null>(null);
  const [relatedCredits, setRelatedCredits] = useState<CreditEntry[]>([]);
  const [selectedCreditIds, setSelectedCreditIds] = useState<Set<string>>(new Set());

  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [cashPart, setCashPart] = useState(0);
  const [bankPart, setBankPart] = useState(0);

  const [creditPayments, setCreditPayments] = useState<any[]>([]);
  const [creditMethods, setCreditMethods] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isProduction = useMemo(() => {
    if (!selectedStoreId) return false;
    const currentStore = stores.find((s) => s.id === selectedStoreId);
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

        // Pre-seleccionar todos los créditos con saldo pendiente por defecto
        const unpaid = related.filter((c) => !c.isPaid && c.balance > 0);
        setSelectedCreditIds(new Set(unpaid.map((c) => c.id)));

        // Cargar todos los pagos de todos los créditos de este deudor
        const allIds = related.map((c) => c.id);
        const payments = await creditService.getPaymentsByCreditIds(allIds);
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

  // Créditos pendientes vs pagados
  const pendingCredits = useMemo(
    () => relatedCredits.filter((c) => !c.isPaid && c.balance > 0),
    [relatedCredits]
  );

  const paidCredits = useMemo(
    () => relatedCredits.filter((c) => c.isPaid || c.balance <= 0),
    [relatedCredits]
  );

  const selectedCredits = useMemo(
    () => pendingCredits.filter((c) => selectedCreditIds.has(c.id)),
    [pendingCredits, selectedCreditIds]
  );

  const selectedTotalBalance = useMemo(
    () => selectedCredits.reduce((sum, c) => sum + c.balance, 0),
    [selectedCredits]
  );

  const totalBalance = useMemo(
    () => pendingCredits.reduce((sum, c) => sum + c.balance, 0),
    [pendingCredits]
  );

  // Alternar selección de un crédito
  const toggleSelectCredit = (creditId: string) => {
    setSelectedCreditIds((prev) => {
      const next = new Set(prev);
      if (next.has(creditId)) {
        next.delete(creditId);
      } else {
        next.add(creditId);
      }
      return next;
    });
  };

  const selectAllPending = () => {
    setSelectedCreditIds(new Set(pendingCredits.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedCreditIds(new Set());
  };

  const handlePayment = useCallback(async () => {
    if (selectedCredits.length === 0) {
      showError('Selecciona al menos un traslado o crédito para pagar');
      return;
    }

    const isLocal = credit?.debtorType === 'LOCAL';
    const totalToPay = paymentMethod === 'MIXTO' ? cashPart + bankPart : paymentAmount;

    if (paymentMethod === 'MIXTO') {
      if (cashPart <= 0 && bankPart <= 0) {
        showError('Por favor ingresa montos válidos para pago mixto');
        return;
      }
      if (totalToPay > selectedTotalBalance) {
        showError(`El total del abono (${formatCOP(totalToPay)}) supera el saldo seleccionado (${formatCOP(selectedTotalBalance)})`);
        return;
      }
    } else {
      if (paymentAmount <= 0) {
        showError('Ingresa un monto válido');
        return;
      }
      if (paymentAmount > selectedTotalBalance) {
        showError(`El abono (${formatCOP(paymentAmount)}) supera el saldo seleccionado (${formatCOP(selectedTotalBalance)})`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const creditIds = selectedCredits.map((c) => c.id);

      if (isLocal) {
        await creditService.registerMultipleLocalPayments({
          creditIds,
          paymentMethod,
          paymentAmount,
          cashPart,
          bankPart,
        });
        showSuccess(`Pago de ${formatCOP(totalToPay)} registrado para ${selectedCredits.length} traslado(s). Pendiente de confirmación.`);
      } else {
        await creditService.registerMultiplePayments({
          creditIds,
          paymentMethod,
          paymentAmount,
          cashPart,
          bankPart,
        });
        showSuccess(`Abono de ${formatCOP(totalToPay)} aplicado a ${selectedCredits.length} crédito(s)`);
      }

      setPaymentAmount(0);
      setCashPart(0);
      setBankPart(0);
      await loadData();
    } catch (err: any) {
      showError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setSubmitting(false);
    }
  }, [selectedCredits, selectedTotalBalance, credit, paymentMethod, paymentAmount, cashPart, bankPart, creditService, loadData, showSuccess, showError]);

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

  const handleConfirmAllPending = useCallback(async () => {
    const pendingIds = creditPayments
      .filter((p) => p.status === 'PENDING')
      .map((p) => p.id);
    if (pendingIds.length === 0) return;

    setSubmitting(true);
    try {
      await creditService.confirmMultipleLocalPayments(pendingIds);
      showSuccess(`${pendingIds.length} abono(s) confirmado(s) exitosamente.`);
      loadData();
    } catch (err: any) {
      showError(err instanceof Error ? err.message : 'No se pudieron confirmar los abonos');
    } finally {
      setSubmitting(false);
    }
  }, [creditPayments, creditService, loadData, showSuccess, showError]);

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

  const handleDeleteRejectedPayment = useCallback(async (paymentId: string) => {
    setSubmitting(true);
    try {
      await creditService.deleteRejectedPayment(paymentId);
      showSuccess('Registro de abono rechazado eliminado del historial.');
      loadData();
    } catch (err: any) {
      showError(err instanceof Error ? err.message : 'No se pudo eliminar el registro');
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
        <Text variant="bodyLarge">Crédito no encontrado</Text>
        <Button onPress={() => router.back()}>Volver</Button>
      </ScreenContainer>
    );
  }

  const isLocalDebt = credit.debtorType === 'LOCAL';
  const displayName = isLocalDebt && !isProduction 
    ? 'Centro de Producción' 
    : credit.debtorName;

  const pendingPaymentsCount = creditPayments.filter((p) => p.status === 'PENDING').length;

  return (
    <ScreenContainer>
      {/* Debtor info */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>
                {displayName}
              </Text>
              <View style={styles.chipRow}>
                <Chip compact style={isLocalDebt && { backgroundColor: 'rgba(230, 57, 70, 0.15)' }}>
                  {isLocalDebt && !isProduction ? 'CUENTA POR PAGAR' : credit.debtorType}
                </Chip>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, alignSelf: 'center', marginLeft: 8 }}>
                  {relatedCredits.length} traslado{relatedCredits.length !== 1 ? 's' : ''} en total
                </Text>
              </View>
            </View>
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
      {totalBalance > 0 && (!isLocalDebt || !isProduction) && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text variant="titleSmall" style={{ fontWeight: '700' }}>
                {isLocalDebt ? 'Registrar Pago al Centro de Producción' : 'Registrar Pago'}
              </Text>
              {selectedCredits.length > 0 && (
                <Chip compact style={{ backgroundColor: '#2A2A2A' }} textStyle={{ color: '#FFB74D', fontSize: 11 }}>
                  {selectedCredits.length} seleccionado{selectedCredits.length !== 1 ? 's' : ''}
                </Chip>
              )}
            </View>

            {/* Quick Summary & Fill button */}
            <View style={{ backgroundColor: '#252020', borderRadius: 8, padding: 10, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text variant="labelSmall" style={{ color: '#AAA' }}>
                  Total a pagar seleccionado:
                </Text>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#E63946' }}>
                  {formatCOP(selectedTotalBalance)}
                </Text>
              </View>
              {selectedTotalBalance > 0 && (
                <Button
                  mode="outlined"
                  compact
                  textColor="#FFB74D"
                  style={{ borderColor: '#FFB74D', borderRadius: 6 }}
                  onPress={() => {
                    if (paymentMethod === 'MIXTO') {
                      setBankPart(selectedTotalBalance);
                      setCashPart(0);
                    } else {
                      setPaymentAmount(selectedTotalBalance);
                    }
                  }}
                >
                  Copiar Total
                </Button>
              )}
            </View>

            {/* Medio de Pago Selector */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
              {[PaymentMethod.TRANSFERENCIA, PaymentMethod.EFECTIVO, PaymentMethod.MIXTO].map((method) => (
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
                  {method === PaymentMethod.TRANSFERENCIA ? 'Bancos' : method === PaymentMethod.EFECTIVO ? 'Efectivo' : 'Mixto'}
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
              disabled={submitting || selectedCredits.length === 0}
              style={styles.payBtn}
              icon="cash"
            >
              {selectedCredits.length === 0
                ? 'Selecciona al menos un traslado'
                : isLocalDebt
                ? `Enviar Pago (${formatCOP(paymentMethod === 'MIXTO' ? cashPart + bankPart : paymentAmount)})`
                : `Registrar Pago (${formatCOP(paymentMethod === 'MIXTO' ? cashPart + bankPart : paymentAmount)})`}
            </Button>
          </Card.Content>
        </Card>
      )}

      {/* Traslados / Créditos Pendientes con Checkboxes */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 10 }}>
        <Text variant="titleMedium" style={{ fontWeight: '700', color: '#F5F0EB' }}>
          {isLocalDebt ? 'Traslados Pendientes de Pago' : 'Créditos Pendientes'} ({pendingCredits.length})
        </Text>
        {pendingCredits.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button
              mode="text"
              compact
              onPress={selectedCreditIds.size === pendingCredits.length ? clearSelection : selectAllPending}
              textColor="#64B5F6"
              style={{ margin: 0 }}
            >
              {selectedCreditIds.size === pendingCredits.length ? 'Deseleccionar' : 'Seleccionar Todos'}
            </Button>
          </View>
        )}
      </View>

      {pendingCredits.length === 0 ? (
        <Card style={styles.historyCard} mode="elevated">
          <Card.Content style={{ paddingVertical: 14, alignItems: 'center' }}>
            <MaterialCommunityIcons name="check-circle-outline" size={32} color="#4CAF50" />
            <Text variant="bodyMedium" style={{ color: '#4CAF50', fontWeight: '600', marginTop: 4 }}>
              ¡No hay traslados ni créditos pendientes de pago!
            </Text>
          </Card.Content>
        </Card>
      ) : (
        pendingCredits.map((c) => {
          const isSelected = selectedCreditIds.has(c.id);
          const days = daysSince(c.date);
          const daysColor = getDaysColor(days);
          const daysBgColor = getDaysBgColor(days);
          const followUp = getNextFollowUp(c.date);

          return (
            <TouchableOpacity
              key={c.id}
              activeOpacity={0.7}
              onPress={() => toggleSelectCredit(c.id)}
            >
              <Card
                style={[
                  styles.historyCard,
                  isSelected && {
                    borderColor: '#E63946',
                    borderWidth: 1.5,
                    backgroundColor: '#261C1D',
                  },
                ]}
                mode="elevated"
              >
                <Card.Content style={{ paddingVertical: 10 }}>
                  <View style={styles.historyRow}>
                    <View style={{ marginRight: 10, justifyContent: 'center' }}>
                      <MaterialCommunityIcons
                        name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                        size={24}
                        color={isSelected ? '#E63946' : '#666'}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '700', color: isSelected ? '#FFFFFF' : '#F5F0EB' }}>
                        {c.concept}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Fecha: {formatDate(c.date)}
                      </Text>
                      {c.transferId && (
                        <Text variant="labelSmall" style={{ color: '#FFB74D', marginTop: 2, fontWeight: '600' }}>
                          Traslado #{c.transferId.slice(-6).toUpperCase()}
                        </Text>
                      )}

                      <View style={styles.indicatorRow}>
                        <Chip
                          compact
                          textStyle={{ fontSize: 10, color: daysColor }}
                          style={{ backgroundColor: daysBgColor }}
                        >
                          {`${days} día${days !== 1 ? 's' : ''} pendiente`}
                        </Chip>

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

                    <View style={{ alignItems: 'flex-end', marginLeft: 8, justifyContent: 'center' }}>
                      <Text variant="bodySmall" style={{ color: '#888' }}>
                        Total: {formatCOP(c.amount)}
                      </Text>
                      <Text variant="bodyMedium" style={{ color: '#E63946', fontWeight: '800' }}>
                        Debe: {formatCOP(c.balance)}
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            </TouchableOpacity>
          );
        })
      )}

      {/* Extracto de Abonos (Credit extract) */}
      <Card style={[styles.card, { marginTop: 16 }]} mode="elevated">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>
              Extracto de Abonos ({creditPayments.length})
            </Text>

            {/* Acción de confirmación masiva para CP o Gerente */}
            {isLocalDebt && (isProduction || userRole === UserRole.GERENTE) && pendingPaymentsCount > 1 && (
              <Button
                mode="contained"
                compact
                icon="check-all"
                buttonColor="#388E3C"
                textColor="#FFF"
                onPress={handleConfirmAllPending}
                disabled={submitting}
                style={{ borderRadius: 6 }}
              >
                Confirmar Todos ({pendingPaymentsCount})
              </Button>
            )}
          </View>

          {creditPayments.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic' }}>
              No se han registrado abonos para este deudor aún.
            </Text>
          ) : (
            creditPayments.map((p) => {
              const isLocal = isLocalDebt;
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
                      <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#F5F0EB' }}>
                        {p.notes || 'Abono manual'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
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

                  {/* Actions for CP or GERENTE when status is PENDING */}
                  {isLocal && isPending && (isProduction || userRole === UserRole.GERENTE) && (
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

                  {/* Actions when status is REJECTED */}
                  {isRejected && (isProduction || userRole === UserRole.GERENTE || userRole === UserRole.ADMIN_LOCAL) && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <Button
                        mode="text"
                        compact
                        icon="trash-can-outline"
                        textColor="#D32F2F"
                        onPress={() => handleDeleteRejectedPayment(p.id)}
                        disabled={submitting}
                      >
                        Descartar Registro
                      </Button>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card.Content>
      </Card>

      {/* Historial de Créditos Pagados (si existen) */}
      {paidCredits.length > 0 && (
        <>
          <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '700', marginTop: 16 }]}>
            Historial de Traslados Pagados ({paidCredits.length})
          </Text>

          {paidCredits.map((c) => {
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
                <Card.Content style={{ paddingVertical: 10 }}>
                  <View style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#AAA' }}>
                        {c.concept}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Fecha: {formatDate(c.date)}
                      </Text>
                      {c.transferId && (
                        <Text variant="labelSmall" style={{ color: '#888', marginTop: 2 }}>
                          Traslado #{c.transferId.slice(-6).toUpperCase()}
                        </Text>
                      )}

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
                          textStyle={{ fontSize: 10, color: '#388E3C' }}
                          style={{ backgroundColor: '#E8F5E9' }}
                        >
                          Pagado
                        </Chip>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', marginLeft: 8, justifyContent: 'center' }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#888' }}>
                        {formatCOP(c.amount)}
                      </Text>
                      <Text variant="labelSmall" style={{ color: '#388E3C', fontWeight: '700' }}>
                        Saldo: $0
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </>
      )}

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
    marginBottom: 10,
  },
  historyCard: {
    borderRadius: 8,
    marginBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
});
