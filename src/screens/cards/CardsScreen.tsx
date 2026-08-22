import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { AddCreditCardModal } from '../../components/credit/AddCreditCardModal';
import {
  computeCreditAggregate,
  computeCardPayoffInsight,
  computeCardUtilisationInsight,
  daysUntilDue,
  resolveExpectedMonthlyRepayment,
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
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import { fontFamilyForWeight } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Nolie Design 5.1 Wave 9a — Cards.
 *
 * WHAT CHANGED (presentation only):
 * - "Credit health {n}/100" is REMOVED (approved copy row, plan §B.1 /
 *   change 21). Nothing replaces it — no other score, grade, eligibility or
 *   creditworthiness wording. The screen states the same utilisation the
 *   engine already computes, as a fact: "{n}% of limit used".
 * - Tone discipline: ordinary utilisation renders neutral/interactive —
 *   success green is NOT awarded merely for a low percentage. Amber appears
 *   only at the engine's existing caution thresholds, urgency only for a
 *   genuinely imminent due date, and neither state is colour-only (each
 *   pairs an icon with its words).
 * - Typography and colour migrate to the Design 5.1 semantic roles;
 *   financial figures are Figtree tabular via the figure roles.
 *
 * WHAT DID NOT CHANGE: every displayed number and its source
 * (computeCreditAggregate, utilisationStatus, dueDateStatus,
 * resolveExpectedMonthlyRepayment, the two insight lines), card-to-liability
 * sync, repayment accounting and routes, the one-card free tier rule, the
 * add/edit modal, and Cards' accepted dock/owner-tab behaviour.
 */

/** Presentation-only mapping from the engines' Tone to Design 5.1 roles.
 * Deliberately maps 'success' to the NEUTRAL treatment for utilisation
 * facts: a low utilisation is ordinary, not an achievement (mint is
 * reserved for genuinely positive outcomes). Time-critical due dates keep
 * their urgency via the urgent role. */
function toneRoles(tone: Tone, semantic: { interactive: string; warning: string; warningAccent: string; urgent: string; textSecondary: string }) {
  switch (tone) {
    case 'warning':
      return { text: semantic.warning, bar: semantic.warningAccent, icon: 'alert-circle-outline' as const };
    case 'danger':
      return { text: semantic.urgent, bar: semantic.urgent, icon: 'alert-circle' as const };
    case 'success':
    case 'neutral':
    default:
      return { text: semantic.textSecondary, bar: semantic.interactive, icon: null };
  }
}

export function CardsScreen() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const [visible, setVisible] = useState(false);
  const [editCard, setEditCard] = useState<CreditCard | null>(null);
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const aggregate = useMemo(() => computeCreditAggregate(data.creditCards), [data.creditCards]);
  const overallStatus = utilisationStatus(aggregate.utilisation);
  const overallRoles = toneRoles(overallStatus.tone, semantic);
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
        listContent: { paddingBottom: designSpacing.huge * 2 },
        surface: {
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
        },
        aggregateRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 56, alignItems: 'center', marginBottom: designSpacing.sm },
        aggregateRight: { alignItems: 'flex-end' },
        aggregateLabel: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        aggregateValue: { ...typeStyle('figureLarge', locale), color: semantic.textFigure, marginTop: 2 },
        statusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.xs,
          marginTop: designSpacing.sm,
        },
        statusText: { ...typeStyle('meta', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600' },
        cardHeaderRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: designSpacing.sm,
          minHeight: designLayout.touchTargetMin,
        },
        cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.sm, flex: 1 },
        cardIconTile: {
          width: 36,
          height: 36,
          borderRadius: designRadius.tile,
          backgroundColor: semantic.interactiveTint,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cardTitle: { ...typeStyle('titleCard', locale), color: semantic.textPrimary, flexShrink: 1 },
        dueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        dueText: { ...typeStyle('meta', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600' },
        balanceRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: designSpacing.xs,
          minHeight: 32,
          marginTop: designSpacing.xs,
        },
        balanceFigure: { ...typeStyle('figureRow', locale), color: semantic.textFigure },
        balanceOf: { ...typeStyle('support', locale), color: semantic.textSecondary },
        cardFooterRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: designSpacing.sm,
          marginTop: designSpacing.sm,
          minHeight: 24,
        },
        utilRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
        utilText: { ...typeStyle('meta', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600' },
        repayText: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        insightBox: {
          flexDirection: 'row',
          gap: designSpacing.sm,
          backgroundColor: semantic.infoTint,
          borderRadius: designRadius.control,
          padding: designSpacing.md,
          marginTop: designSpacing.sm,
        },
        insightText: { ...typeStyle('meta', locale), color: semantic.textPrimary, flex: 1 },
      }),
    [semantic, locale]
  );

  return (
    <Screen
      scroll={false}
      title={`${brand.name} Cards`}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      headerRight={canAddCard ? <Button label="+ Add card" onPress={openAdd} /> : undefined}
    >
      {data.creditCards.length > 0 ? (
        <View style={styles.surface}>
          <View style={styles.aggregateRow}>
            <View>
              <Text style={styles.aggregateLabel}>Total limit</Text>
              <Text style={styles.aggregateValue} maxFontSizeMultiplier={1.6}>${aggregate.totalLimit.toLocaleString()}</Text>
            </View>
            <View style={styles.aggregateRight}>
              <Text style={styles.aggregateLabel}>Available</Text>
              <Text style={styles.aggregateValue} maxFontSizeMultiplier={1.6}>${aggregate.availableCredit.toLocaleString()}</Text>
            </View>
          </View>
          <ProgressBar progress={aggregate.utilisation} color={overallRoles.bar} height={8} />
          <View style={styles.statusRow}>
            {overallRoles.icon ? (
              <Ionicons name={overallRoles.icon} size={14} color={overallRoles.text} importantForAccessibility="no" />
            ) : null}
            <Text style={[styles.statusText, { color: overallRoles.text }]}>
              {Math.round(aggregate.utilisation * 100)}% of limit used · {overallStatus.label}
            </Text>
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
          const dueRoles = toneRoles(due.tone, semantic);
          const util = item.creditLimit > 0 ? item.currentBalance / item.creditLimit : 0;
          const utilStatus = utilisationStatus(util);
          const utilRoles = toneRoles(utilStatus.tone, semantic);
          const payoffInsight = computeCardPayoffInsight(item);
          const utilisationInsight = computeCardUtilisationInsight(item);
          const rowLabel =
            `${item.label}, due ${due.label}, $${item.currentBalance.toLocaleString()} of $${item.creditLimit.toLocaleString()}, ` +
            `${Math.round(util * 100)}% of limit used, ${utilStatus.label}, repay $${Math.round(resolveExpectedMonthlyRepayment(item)).toLocaleString()} per month` +
            `${utilisationInsight ? `. ${utilisationInsight}` : ''}${payoffInsight ? ` ${payoffInsight}` : ''}`;
          return (
            <TouchableOpacity
              style={styles.surface}
              activeOpacity={0.7}
              onPress={() => {
                setEditCard(item);
                setVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={rowLabel}
              accessibilityHint="Opens card details"
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderLeft}>
                  <View style={styles.cardIconTile}>
                    <Ionicons name="card-outline" size={18} color={semantic.interactive} importantForAccessibility="no" />
                  </View>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                </View>
                <View style={styles.dueRow}>
                  {dueRoles.icon ? <Ionicons name={dueRoles.icon} size={14} color={dueRoles.text} importantForAccessibility="no" /> : null}
                  <Text style={[styles.dueText, { color: dueRoles.text }]}>{due.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} importantForAccessibility="no" />
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceFigure}>${item.currentBalance.toLocaleString()}</Text>
                <Text style={styles.balanceOf}>of ${item.creditLimit.toLocaleString()} limit</Text>
              </View>
              <ProgressBar progress={util} color={utilRoles.bar} />
              <View style={styles.cardFooterRow}>
                <View style={styles.utilRow}>
                  {utilRoles.icon ? <Ionicons name={utilRoles.icon} size={14} color={utilRoles.text} importantForAccessibility="no" /> : null}
                  <Text style={[styles.utilText, { color: utilRoles.text }]}>
                    {Math.round(util * 100)}% of limit used · {utilStatus.label}
                  </Text>
                </View>
                <Text style={styles.repayText}>repay ${Math.round(resolveExpectedMonthlyRepayment(item)).toLocaleString()}/mo</Text>
              </View>
              {utilisationInsight ? (
                <View style={styles.insightBox}>
                  <Ionicons name="bulb-outline" size={14} color={semantic.infoText} importantForAccessibility="no" />
                  <Text style={styles.insightText}>{utilisationInsight}</Text>
                </View>
              ) : null}
              {payoffInsight ? (
                <View style={styles.insightBox}>
                  <Ionicons name="trending-up" size={14} color={semantic.infoText} importantForAccessibility="no" />
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
