import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Card, Text, Button, Divider, Chip, useTheme } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { CurrencyInput } from '../../../src/components/common/CurrencyInput';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { CreditEntry } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';
import { formatDate } from '../../../src/utils/dates';

export default function DebtorDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { creditService } = useDI();

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
      Alert.alert('Error', 'Ingresa un monto valido');
      return;
    }

    setSubmitting(true);
    try {
      await creditService.registerPayment(credit.id, paymentAmount);
      Alert.alert('Pago registrado', `${formatCOP(paymentAmount)} aplicado a ${credit.debtorName}`);
      setPaymentAmount(0);
      loadData();
    } catch {
      Alert.alert('Error', 'No se pudo registrar el pago');
    } finally {
      setSubmitting(false);
    }
  }, [credit, paymentAmount, creditService, loadData]);

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

      {relatedCredits.map((c) => (
        <Card key={c.id} style={styles.historyCard} mode="elevated">
          <Card.Content>
            <View style={styles.historyRow}>
              <View>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                  {c.concept}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {formatDate(c.date)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                  {formatCOP(c.amount)}
                </Text>
                <Chip
                  compact
                  textStyle={{ fontSize: 10, color: c.isPaid ? '#388E3C' : '#D32F2F' }}
                  style={{ backgroundColor: c.isPaid ? '#E8F5E9' : '#FFEBEE' }}
                >
                  {c.isPaid ? 'Pagado' : `Debe: ${formatCOP(c.balance)}`}
                </Chip>
              </View>
            </View>
          </Card.Content>
        </Card>
      ))}

      <View style={{ height: 32 }} />
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
    alignItems: 'center',
  },
});
