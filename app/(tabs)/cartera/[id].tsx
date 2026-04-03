import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Divider, Chip, Portal, Snackbar, useTheme } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { useSnackbar } from '../../../src/hooks';
import { CreditEntry } from '../../../src/domain/entities';
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
  const { creditService } = useDI();
  const { snackbar, showSuccess, showError, hideSnackbar } = useSnackbar();

  const [credit, setCredit] = useState<CreditEntry | null>(null);
  const [relatedCredits, setRelatedCredits] = useState<CreditEntry[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(0);
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
      }
    } catch {
      setCredit(null);
    } finally {
      setLoading(false);
    }
  }, [id, creditService]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePayment = useCallback(async () => {
    if (!credit || paymentAmount <= 0) {
      showError('Ingresa un monto valido');
      return;
    }

    setSubmitting(true);
    try {
      await creditService.registerPayment(credit.id, paymentAmount);
      showSuccess(`${formatCOP(paymentAmount)} aplicado a ${credit.debtorName}`);
      setPaymentAmount(0);
      loadData();
    } catch {
      showError('No se pudo registrar el pago');
    } finally {
      setSubmitting(false);
    }
  }, [credit, paymentAmount, creditService, loadData, showSuccess, showError]);

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
            <CurrencyInput
              value={paymentAmount}
              onChangeValue={setPaymentAmount}
              label="Monto del pago"
            />
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

      {/* Credit history */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { fontWeight: '600' }]}>
        Historial de Creditos
      </Text>

      {relatedCredits.map((c) => {
        const days = daysSince(c.date);
        const daysColor = getDaysColor(days);
        const daysBgColor = getDaysBgColor(days);
        const followUp = !c.isPaid ? getNextFollowUp(c.date) : null;

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

                  {/* Days pending indicator */}
                  <View style={styles.indicatorRow}>
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
