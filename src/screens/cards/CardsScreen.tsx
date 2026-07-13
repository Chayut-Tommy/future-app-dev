import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { AddCreditCardModal } from '../../components/credit/AddCreditCardModal';
import {
  computeCreditAggregate,
  computeBasicCreditHealthScore,
  computeCardPayoffInsight,
  computeCardUtilisationInsight,
  daysUntilDue,
  utilisationStatus,
  dueDateStatus,
  Tone,
} from '../../lib/calculations/creditHealth';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { Screen } from '../../components/shared/Screen';
import { EmptyState } from '../../components/shared/EmptyState';
import { Button } from '../../components/shared/Button';
import { CreditCard } from '../../types/models';
import { brand } from '../../lib/brand';

export function CardsScreen() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const [visible, setVisible] = useState(false);
  const [editCard, setEditCard] = useState<CreditCard | null>(null);
  const { colors, radius, spacing, typography, cardShadow } = useTheme();

  const toneColor = (tone: Tone) =>
    ({ success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.textSecondary }[tone]);

  const aggregate = useMemo(() => computeCreditAggregate(data.creditCards), [data.creditCards]);
  const healthScore = useMemo(() => computeBasicCreditHealthScore(data.creditCards), [data.creditCards]);
  const overallStatus = utilisationStatus(aggregate.utilisation);
  const canAddCard = data.creditCards.length === 0; // free tier: 1 card

  function openAdd() {
    setEditCard(null);
    setVisible(true);
  }

  function closeModal() {
    setVisible(false);
    setEditCard(null);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        emptyContainer: { flexGrow: 1, justifyContent: 'center' },
        listContent: { paddingBottom: spacing.xxl * 2 },
        aggregateCard: {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          padding: spacing.lg,
          marginBottom: spacing.md,
          ...cardShadow,
        },
        aggregateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
        aggregateRight: { alignItems: 'flex-end' },
        aggregateLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        aggregateValue: { ...typography.title, fontSize: 20, color: colors.textPrimary, marginTop: 2 },
        statusRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
        },
        statusBadge: { ...typography.micro, fontWeight: '600' },
        healthScoreText: { ...typography.micro, color: colors.textSecondary },
        card: {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        cardHeaderRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        },
        cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
        cardTitle: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        dueBadge: { ...typography.micro, fontWeight: '600' },
        cardSubtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
        cardFooterRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
        },
        utilLabel: { ...typography.micro, fontWeight: '600' },
        minPaymentText: { ...typography.micro, color: colors.textMuted },
        insightBox: { flexDirection: 'row', gap: 6, backgroundColor: colors.marketSoft, borderRadius: radius.control, padding: spacing.sm, marginTop: spacing.sm },
        insightText: { ...typography.micro, fontSize: 11, color: colors.textPrimary, flex: 1, lineHeight: 15 },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  return (
    <Screen
      scroll={false}
      title={`${brand.name} Cards`}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      headerRight={canAddCard ? <Button label="+ Add card" onPress={openAdd} /> : undefined}
    >
      {data.creditCards.length > 0 ? (
        <View style={styles.aggregateCard}>
          <View style={styles.aggregateRow}>
            <View>
              <Text style={styles.aggregateLabel}>Total limit</Text>
              <Text style={styles.aggregateValue}>${aggregate.totalLimit.toLocaleString()}</Text>
            </View>
            <View style={styles.aggregateRight}>
              <Text style={styles.aggregateLabel}>Available</Text>
              <Text style={styles.aggregateValue}>${aggregate.availableCredit.toLocaleString()}</Text>
            </View>
          </View>
          <ProgressBar progress={aggregate.utilisation} color={toneColor(overallStatus.tone)} height={8} />
          <View style={styles.statusRow}>
            <Text style={[styles.statusBadge, { color: toneColor(overallStatus.tone) }]}>
              {Math.round(aggregate.utilisation * 100)}% utilised · {overallStatus.label}
            </Text>
            <Text style={styles.healthScoreText}>Credit health {healthScore}/100</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        data={data.creditCards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={data.creditCards.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="card-outline"
            title="No cards added yet"
            body={`Add your cards so ${brand.name} can help you reduce interest, improve utilisation, create payoff plans, and avoid missed payments.`}
            actionLabel="Add a card"
            onAction={openAdd}
          />
        }
        renderItem={({ item }) => {
          const days = daysUntilDue(item.dueDay);
          const due = dueDateStatus(days);
          const util = item.creditLimit > 0 ? item.currentBalance / item.creditLimit : 0;
          const utilStatus = utilisationStatus(util);
          const payoffInsight = computeCardPayoffInsight(item);
          const utilisationInsight = computeCardUtilisationInsight(item);
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => {
                setEditCard(item);
                setVisible(true);
              }}
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                </View>
                <Text style={[styles.dueBadge, { color: toneColor(due.tone) }]}>{due.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
              </View>
              <Text style={styles.cardSubtitle}>
                ${item.currentBalance.toLocaleString()} of ${item.creditLimit.toLocaleString()}
              </Text>
              <ProgressBar progress={util} color={toneColor(utilStatus.tone)} />
              <View style={styles.cardFooterRow}>
                <Text style={[styles.utilLabel, { color: toneColor(utilStatus.tone) }]}>
                  {Math.round(util * 100)}% · {utilStatus.label}
                </Text>
                <Text style={styles.minPaymentText}>min ${item.minimumPayment.toLocaleString()}</Text>
              </View>
              {utilisationInsight ? (
                <View style={styles.insightBox}>
                  <Ionicons name="sparkles" size={13} color={colors.market} />
                  <Text style={styles.insightText}>{utilisationInsight}</Text>
                </View>
              ) : null}
              {payoffInsight ? (
                <View style={styles.insightBox}>
                  <Ionicons name="trending-up" size={13} color={colors.market} />
                  <Text style={styles.insightText}>{payoffInsight}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />

      <AddCreditCardModal visible={visible} onClose={closeModal} editCard={editCard} />
    </Screen>
  );
}
