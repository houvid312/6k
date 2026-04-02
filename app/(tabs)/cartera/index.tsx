import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Card, Text, FAB, Chip, Divider, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { CreditEntry } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';

type FilterOption = 'todos' | 'vencidos' | 'semana';

interface DebtorSummary {
  name: string;
  type: string;
  totalBalance: number;
  creditCount: number;
  credits: CreditEntry[];
  hasOverdue: boolean;
  overdueCount: number;
}

/** Calculate days since a date string (YYYY-MM-DD or ISO) */
function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Check if a credit is overdue (unpaid and > 7 days old) */
function isOverdue(credit: CreditEntry): boolean {
  return !credit.isPaid && daysSince(credit.date) > 7;
}

/** Check if a credit needs follow-up this week (next follow-up within 7 days from now) */
function needsFollowUpThisWeek(credit: CreditEntry): boolean {
  if (credit.isPaid) return false;
  const days = daysSince(credit.date);
  const nextFollowUp = Math.ceil(days / 7) * 7;
  const daysUntilFollowUp = nextFollowUp - days;
  return daysUntilFollowUp >= 0 && daysUntilFollowUp <= 7;
}

export default function CarteraScreen() {
  const theme = useTheme();
  const { creditService } = useDI();

  const [allCredits, setAllCredits] = useState<CreditEntry[]>([]);
  const [debtors, setDebtors] = useState<DebtorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('todos');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const all = await creditService.getAllCredits();
      setAllCredits(all);
      const active = all.filter((c) => !c.isPaid);

      // Group by debtor name
      const grouped = new Map<string, DebtorSummary>();
      for (const credit of active) {
        const existing = grouped.get(credit.debtorName);
        const creditOverdue = isOverdue(credit);

        if (existing) {
          existing.totalBalance += credit.balance;
          existing.creditCount += 1;
          existing.credits.push(credit);
          if (creditOverdue) {
            existing.hasOverdue = true;
            existing.overdueCount += 1;
          }
        } else {
          grouped.set(credit.debtorName, {
            name: credit.debtorName,
            type: credit.debtorType,
            totalBalance: credit.balance,
            creditCount: 1,
            credits: [credit],
            hasOverdue: creditOverdue,
            overdueCount: creditOverdue ? 1 : 0,
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

  /** Summary stats */
  const stats = useMemo(() => {
    const activeCredits = allCredits.filter((c) => !c.isPaid);
    const overdueCredits = activeCredits.filter((c) => isOverdue(c));
    const followUpCredits = activeCredits.filter((c) => needsFollowUpThisWeek(c));

    return {
      overdueCount: overdueCredits.length,
      followUpCount: followUpCredits.length,
    };
  }, [allCredits]);

  /** Filtered debtors based on active filter */
  const filteredDebtors = useMemo(() => {
    switch (activeFilter) {
      case 'vencidos':
        return debtors.filter((d) => d.hasOverdue);
      case 'semana':
        return debtors.filter((d) =>
          d.credits.some((c) => needsFollowUpThisWeek(c)),
        );
      default:
        return debtors;
    }
  }, [debtors, activeFilter]);

  const renderDebtor = ({ item }: { item: DebtorSummary }) => (
    <Card
      style={[
        styles.card,
        item.hasOverdue && styles.cardOverdue,
      ]}
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
              {item.hasOverdue && (
                <Chip
                  compact
                  textStyle={{ fontSize: 10, color: '#D32F2F' }}
                  style={{ backgroundColor: '#FFEBEE' }}
                >
                  {item.overdueCount} vencido{item.overdueCount !== 1 ? 's' : ''}
                </Chip>
              )}
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
          <Divider style={{ marginVertical: 8, width: '100%' }} />
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#D32F2F' }}>
                {stats.overdueCount}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Vencidos (+7d)
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#E65100' }}>
                {stats.followUpCount}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Seguimiento
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Filter toggles */}
      <View style={styles.filterRow}>
        {(
          [
            { key: 'todos', label: 'Todos' },
            { key: 'vencidos', label: 'Vencidos' },
            { key: 'semana', label: 'Esta semana' },
          ] as const
        ).map((filter) => (
          <Chip
            key={filter.key}
            selected={activeFilter === filter.key}
            showSelectedOverlay
            onPress={() => setActiveFilter(filter.key)}
            compact
            style={[
              styles.filterChip,
              activeFilter === filter.key && { backgroundColor: '#E63946' },
            ]}
            textStyle={{
              fontSize: 12,
              color: activeFilter === filter.key ? '#FFFFFF' : '#F5F0EB',
            }}
          >
            {filter.label}
          </Chip>
        ))}
      </View>

      {loading ? (
        <LoadingIndicator message="Cargando cartera..." />
      ) : filteredDebtors.length === 0 ? (
        <EmptyState
          icon="account-check"
          title={activeFilter === 'todos' ? 'Sin deudas' : 'Sin resultados'}
          subtitle={
            activeFilter === 'todos'
              ? 'No hay creditos pendientes'
              : `No hay creditos ${activeFilter === 'vencidos' ? 'vencidos' : 'para esta semana'}`
          }
        />
      ) : (
        <FlatList
          data={filteredDebtors}
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(245, 240, 235, 0.15)',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: 20,
  },
  list: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 100,
  },
  card: {
    borderRadius: 12,
    marginBottom: 8,
  },
  cardOverdue: {
    borderWidth: 1.5,
    borderColor: '#D32F2F',
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
