import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Card, Text, FAB, Chip, Divider, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { CreditEntry } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';

interface DebtorSummary {
  name: string;
  type: string;
  totalBalance: number;
  creditCount: number;
  credits: CreditEntry[];
}

export default function CarteraScreen() {
  const theme = useTheme();
  const { creditService } = useDI();

  const [debtors, setDebtors] = useState<DebtorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const all = await creditService.getAllCredits();
      const active = all.filter((c) => !c.isPaid);

      // Group by debtor name
      const grouped = new Map<string, DebtorSummary>();
      for (const credit of active) {
        const existing = grouped.get(credit.debtorName);
        if (existing) {
          existing.totalBalance += credit.balance;
          existing.creditCount += 1;
          existing.credits.push(credit);
        } else {
          grouped.set(credit.debtorName, {
            name: credit.debtorName,
            type: credit.debtorType,
            totalBalance: credit.balance,
            creditCount: 1,
            credits: [credit],
          });
        }
      }

      setDebtors(
        Array.from(grouped.values()).sort((a, b) => b.totalBalance - a.totalBalance),
      );
    } catch {
      setDebtors([]);
    } finally {
      setLoading(false);
    }
  }, [creditService]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalCartera = debtors.reduce((sum, d) => sum + d.totalBalance, 0);

  const renderDebtor = ({ item }: { item: DebtorSummary }) => (
    <Card
      style={styles.card}
      mode="elevated"
      onPress={() => {
        const firstCredit = item.credits[0];
        if (firstCredit) {
          router.push(`/(tabs)/cartera/${firstCredit.id}`);
        }
      }}
    >
      <Card.Content>
        <View style={styles.debtorRow}>
          <View style={styles.debtorInfo}>
            <Text variant="titleSmall" style={{ fontWeight: '600' }}>
              {item.name}
            </Text>
            <View style={styles.chipRow}>
              <Chip compact textStyle={{ fontSize: 10 }}>
                {item.type}
              </Chip>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {item.creditCount} credito{item.creditCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.error }}>
            {formatCOP(item.totalBalance)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Total banner */}
      <Card style={[styles.totalCard, { backgroundColor: theme.colors.primaryContainer }]} mode="contained">
        <Card.Content style={styles.totalContent}>
          <Text variant="bodyMedium">Total Cartera</Text>
          <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>
            {formatCOP(totalCartera)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {debtors.length} deudor{debtors.length !== 1 ? 'es' : ''}
          </Text>
        </Card.Content>
      </Card>

      {loading ? (
        <LoadingIndicator message="Cargando cartera..." />
      ) : debtors.length === 0 ? (
        <EmptyState icon="account-check" title="Sin deudas" subtitle="No hay creditos pendientes" />
      ) : (
        <FlatList
          data={debtors}
          renderItem={renderDebtor}
          keyExtractor={(item) => item.name}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <FAB
        icon="plus"
        onPress={() => router.push('/(tabs)/cartera/nuevo')}
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  totalCard: {
    margin: 16,
    borderRadius: 12,
  },
  totalContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  list: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 12,
    marginBottom: 8,
  },
  debtorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debtorInfo: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    borderRadius: 28,
  },
});
