import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { Card, Text, FAB, Chip, Divider, Button, useTheme } from 'react-native-paper';
import { Link, router } from 'expo-router';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingIndicator } from '../../../src/components/common/LoadingIndicator';
import { useDI } from '../../../src/di/providers';
import { CreditEntry } from '../../../src/domain/entities';
import { formatCOP } from '../../../src/utils/currency';

type FilterOption = 'todos' | 'vencidos' | 'semana' | 'historico';

interface DebtorSummary {
  name: string;
  type: string;
  totalBalance: number;
  totalAmount: number;
  creditCount: number;
  activeCreditCount: number;
  paidCreditCount: number;
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

function buildDebtorSummaries(credits: CreditEntry[]): DebtorSummary[] {
  const grouped = new Map<string, DebtorSummary>();

  for (const credit of credits) {
    const existing = grouped.get(credit.debtorName);
    const creditOverdue = isOverdue(credit);
    const balance = credit.isPaid ? 0 : credit.balance;

    if (existing) {
      existing.totalBalance += balance;
      existing.totalAmount += credit.amount;
      existing.creditCount += 1;
      existing.activeCreditCount += credit.isPaid ? 0 : 1;
      existing.paidCreditCount += credit.isPaid ? 1 : 0;
      existing.credits.push(credit);
      if (creditOverdue) {
        existing.hasOverdue = true;
        existing.overdueCount += 1;
      }
    } else {
      grouped.set(credit.debtorName, {
        name: credit.debtorName,
        type: credit.debtorType,
        totalBalance: balance,
        totalAmount: credit.amount,
        creditCount: 1,
        activeCreditCount: credit.isPaid ? 0 : 1,
        paidCreditCount: credit.isPaid ? 1 : 0,
        credits: [credit],
        hasOverdue: creditOverdue,
        overdueCount: creditOverdue ? 1 : 0,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.totalBalance !== a.totalBalance) return b.totalBalance - a.totalBalance;
    return b.totalAmount - a.totalAmount;
  });
}

export default function CarteraScreen() {
  const theme = useTheme();
  const { creditService } = useDI();

  const [allCredits, setAllCredits] = useState<CreditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('todos');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const all = await creditService.getAllCredits();
      setAllCredits(all);
    } catch {
      setAllCredits([]);
    } finally {
      setLoading(false);
    }
  }, [creditService]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeDebtors = useMemo(
    () => buildDebtorSummaries(allCredits.filter((c) => !c.isPaid)),
    [allCredits],
  );

  const historicalDebtors = useMemo(
    () => buildDebtorSummaries(allCredits),
    [allCredits],
  );

  const totalCartera = activeDebtors.reduce((sum, d) => sum + d.totalBalance, 0);

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
        return activeDebtors.filter((d) => d.hasOverdue);
      case 'semana':
        return activeDebtors.filter((d) =>
          d.credits.some((c) => needsFollowUpThisWeek(c)),
        );
      case 'historico':
        return historicalDebtors;
      default:
        return activeDebtors;
    }
  }, [activeDebtors, historicalDebtors, activeFilter]);

  const emptyTitle = activeFilter === 'historico'
    ? 'Sin historico'
    : activeFilter === 'todos'
      ? 'Sin deudas pendientes'
      : 'Sin resultados';

  const emptySubtitle = activeFilter === 'historico'
    ? 'Aun no hay creditos registrados'
    : activeFilter === 'todos' && allCredits.length > 0
      ? 'Hay creditos historicos disponibles'
      : activeFilter === 'todos'
        ? 'No hay creditos registrados'
        : `No hay creditos ${activeFilter === 'vencidos' ? 'vencidos' : 'para esta semana'}`;

  const showHistoricalFallback =
    activeFilter === 'todos' && activeDebtors.length === 0 && historicalDebtors.length > 0;
  const isHistoricalView = activeFilter === 'historico' || showHistoricalFallback;
  const visibleDebtors = showHistoricalFallback ? historicalDebtors : filteredDebtors;

  const renderDebtor = ({ item }: { item: DebtorSummary }) => {
    const isHistorical = isHistoricalView;
    const displayedAmount = isHistorical ? item.totalAmount : item.totalBalance;
    const firstCredit = isHistorical
      ? item.credits[0]
      : item.credits.find((credit) => !credit.isPaid) ?? item.credits[0];

    return (
    <Card
      style={[
        styles.card,
        item.hasOverdue && styles.cardOverdue,
      ]}
      mode="elevated"
      onPress={() => {
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
              {isHistorical && item.activeCreditCount > 0 && (
                <Chip compact textStyle={{ fontSize: 10, color: '#D32F2F' }}>
                  {item.activeCreditCount} pendiente{item.activeCreditCount !== 1 ? 's' : ''}
                </Chip>
              )}
              {isHistorical && item.paidCreditCount > 0 && (
                <Chip
                  compact
                  textStyle={{ fontSize: 10, color: '#388E3C' }}
                  style={{ backgroundColor: '#E8F5E9' }}
                >
                  {item.paidCreditCount} pagado{item.paidCreditCount !== 1 ? 's' : ''}
                </Chip>
              )}
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
          <View style={styles.amountColumn}>
            <Text
              variant="titleMedium"
              style={{
                fontWeight: 'bold',
                color: isHistorical ? theme.colors.onSurface : theme.colors.error,
              }}
            >
              {formatCOP(displayedAmount)}
            </Text>
            {firstCredit && (
              <Link
                href={`/(tabs)/cartera/${firstCredit.id}`}
                style={styles.detailLink}
              >
                Ver detalle
              </Link>
            )}
          </View>
        </View>
      </Card.Content>
    </Card>
    );
  };

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
            {activeDebtors.length} deudor{activeDebtors.length !== 1 ? 'es' : ''}
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
            { key: 'historico', label: 'Historico' },
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
      ) : visibleDebtors.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <EmptyState
            icon="account-check"
            title={emptyTitle}
            subtitle={emptySubtitle}
          />
          {activeFilter === 'todos' && allCredits.length > 0 && (
            <Button
              mode="outlined"
              icon="history"
              onPress={() => setActiveFilter('historico')}
              style={styles.historyButton}
            >
              Ver historico
            </Button>
          )}
        </View>
      ) : (
        <>
          {showHistoricalFallback && (
            <View style={styles.historyHeader}>
              <Text variant="titleSmall" style={{ fontWeight: '700' }}>
                Historico de cartera
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                No hay saldos pendientes, pero puedes consultar creditos pagados.
              </Text>
            </View>
          )}
          <FlatList
            data={visibleDebtors}
            renderItem={renderDebtor}
            keyExtractor={(item) => item.name}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </>
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
  emptyWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  historyButton: {
    marginTop: 12,
    borderRadius: 8,
  },
  historyHeader: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
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
  amountColumn: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  detailLink: {
    color: '#E63946',
    fontWeight: '700',
    marginTop: 4,
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
