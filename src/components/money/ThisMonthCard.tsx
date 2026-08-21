import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { ThisMonthRecordedSummary } from '../../lib/calculations/monthlySummary';
import { ThisMonthSourcesSheet } from './ThisMonthSourcesSheet';
import {
  MONEY_MEASURE_DEFINITIONS,
  OtherCardBalance,
  SourceCardContext,
  isAccessibilityText,
} from '../../lib/calculations/moneyComposition';
import { Ionicons } from '@expo/vector-icons';
import { AddIconTone } from '../../lib/addIcons';

/** One recent transaction, already resolved for display by the caller. */
export interface RecentActivityRow {
  id: string;
  label: string;
  dateLabel: string;
  amountLabel: string;
  isIncome: boolean;
  /** From the canonical addIcons category map — never a generic arrow and
   * never an emoji. */
  icon: keyof typeof Ionicons.glyphMap;
  tone: AddIconTone;
}

/** One compact insight — icon, short label, value. Never a paragraph. */
export interface ActivityInsight {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/** `$60` for an exact whole dollar, `$60.25` when cents exist, `-$` prefix
 * for a negative value — never independently re-rounds a value that was
 * already computed in exact integer cents (PRD ask, "Currency display"). */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const remainder = abs % 100;
  return remainder === 0 ? `${sign}$${whole.toLocaleString()}` : `${sign}$${whole.toLocaleString()}.${String(remainder).padStart(2, '0')}`;
}

/** Design 5.1 Wave 6 — the default page's content budget: a preview, not
 * a list. The full journey is one tap away. */
const MAX_RECENT_ROWS = 3;
const MAX_INSIGHTS = 2;

/** Restrained tint tiles. Icons carry a low-intensity tinted surface so the
 * rows are differentiable at a glance; the AMOUNTS stay neutral unless the
 * money itself is genuinely positive. Colour communicates type, not
 * judgement — ordinary spending never turns red. */
function toneTint(tone: AddIconTone, semantic: any): { bg: string; ink: string } {
  switch (tone) {
    case 'mint':
      return { bg: semantic.successTint, ink: semantic.success };
    case 'teal':
      return { bg: semantic.infoTint, ink: semantic.infoText };
    case 'amber':
      return { bg: semantic.warningTint, ink: semantic.warning };
    case 'violet':
      return { bg: semantic.interactiveTint, ink: semantic.interactive };
    case 'coral':
      return { bg: semantic.urgentTint, ink: semantic.urgentText };
    case 'ocean':
    default:
      return { bg: semantic.interactiveTint, ink: semantic.interactive };
  }
}

/**
 * "This Month" — a factual, calendar-month recorded-activity summary.
 *
 * WAVE 6: THE FLIP IS RETIRED.
 *
 * This was a two-face 3D flip card. The front carried income, spending and
 * net recorded; the back carried the funding-source breakdown, reachable
 * only by flipping — and the complete, untruncated source list was reachable
 * only by a "View all" control that itself only appeared on the back face,
 * and only when there were enough sources to overflow. Three levels of
 * disclosure for one list.
 *
 * It is now a static summary with one explicit "Spending sources" control
 * that opens ThisMonthSourcesSheet directly. Nothing was lost: the sheet
 * already showed EVERY source with its label, percentage and amount plus a
 * reconciling total, so what the compact back face could only show as
 * "+N more sources" is now always fully available in one step.
 *
 * Retired with the flip: the shared Animated.Value, both rotateY
 * interpolations, `backfaceVisibility`, the absolute back face, the
 * measured-height container, per-face `pointerEvents`/accessibility
 * hiding, the `face` state, and the Reduce Motion branch that existed
 * solely to make the flip instant. Reduce Motion now needs no special case
 * here at all, because nothing moves.
 *
 * Every figure still comes from `summary` (computeThisMonthRecordedSummary,
 * unmodified). This component performs no financial arithmetic.
 */
export function ThisMonthCard({
  summary,
  monthStart,
  recent = [],
  insights = [],
  cardContexts = [],
  otherCardBalances = [],
  onViewTransactions,
  onAddTransaction,
}: {
  summary: ThisMonthRecordedSummary;
  monthStart: Date;
  /** Wave 6 final pass — Recent activity was a SEPARATE top-level section
   * repeating this card's own month-to-date framing. It is now a
   * subsection here: at most three rows, preview only, no nested scroll.
   * Already selected and ordered by the caller; this card re-sorts
   * nothing. */
  recent?: RecentActivityRow[];
  /** Joined from the caller's own card list by stable id — never computed
   * here, and never added to any total. */
  cardContexts?: SourceCardContext[];
  otherCardBalances?: OtherCardBalance[];
  /** At most two compact insights, already computed by the existing
   * spending-insights engine. */
  insights?: ActivityInsight[];
  onViewTransactions: () => void;
  onAddTransaction: () => void;
}) {
  const { semantic } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  // At accessibility sizes — or on a genuinely narrow phone — the metric
  // cells and the action buttons become full-width blocks rather than
  // shrinking their labels into micro-text.
  const stackMetrics = isAccessibilityText(fontScale);
  const stackActions = stackMetrics || width <= designLayout.breakpoints.compactMax;
  const [sourcesSheetVisible, setSourcesSheetVisible] = useState(false);

  const hasIncome = summary.incomeCents > 0;
  const hasSpending = summary.spendingCents > 0;
  // A month with no valid income/expense transactions but at least one
  // recorded transaction that failed strict validation must NOT fall into
  // the true empty state — that would say "No transactions recorded yet,"
  // which is false, and would hide the disclosure line entirely.
  const hasActivity = hasIncome || hasSpending || summary.hasInvalidRecordedAmounts;

  const monthLabel = `${monthStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} to today`;


  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
        },
        subtitle: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginBottom: designSpacing.xs },
        definition: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginBottom: designSpacing.md },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: designSpacing.md, paddingVertical: 6 },
        // Three compact metric cells. They reflow to full-width blocks at
        // accessibility sizes rather than shrinking their labels.
        metricGrid: {
          flexDirection: stackMetrics ? 'column' : 'row',
          gap: designSpacing.md,
          marginBottom: designSpacing.sm,
        },
        metricCell: { flex: stackMetrics ? undefined : 1, minWidth: 0 },
        metricTile: {
          width: 26,
          height: 26,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: designSpacing.xs,
        },
        // Readable, never micro-text.
        metricLabel: { ...typeStyle('meta', locale), color: semantic.textSecondary },
        metricValue: { ...typeStyle('figureRow', locale), marginTop: 2, flexShrink: 0 },
        rowLabel: { ...typeStyle('support', locale), color: semantic.textSecondary, flexShrink: 1 },
        rowValue: { ...typeStyle('figureRow', locale), color: semantic.textPrimary, flexShrink: 0 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border, marginVertical: designSpacing.sm },
        balanceLabel: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        emptyText: { ...typeStyle('support', locale), color: semantic.textSecondary, marginBottom: designSpacing.sm },
        actionRow: {
          flexDirection: stackActions ? 'column' : 'row',
          gap: designSpacing.sm,
          marginTop: designSpacing.md,
        },
        // The owner asked for borders that are unmistakably visible — a
        // deliberate 2pt, not a hairline that reads as a divider.
        outlineButton: {
          flex: stackActions ? undefined : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: designSpacing.xs,
          minHeight: designLayout.touchTargetMin,
          paddingHorizontal: designSpacing.md,
          borderRadius: designRadius.control,
          borderWidth: 2,
          borderColor: semantic.interactive,
        },
        outlineButtonText: { ...typeStyle('labelButton', locale), color: semantic.interactive, flexShrink: 1 },
        action: {
          minHeight: designLayout.touchTargetMin,
          justifyContent: 'center',
          paddingHorizontal: designSpacing.md,
          borderRadius: designRadius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
        },
        actionText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        linkButton: { minHeight: designLayout.touchTargetMin, justifyContent: 'center', alignSelf: 'flex-start' },
        linkButtonText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        disclaimer: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.sm },
        // Recent activity — a subsection of this card, separated by the
        // card's own divider rather than becoming another white card.
        subHeading: { ...typeStyle('meta', locale), color: semantic.textSecondary, fontWeight: '600', marginBottom: designSpacing.xs },
        txnRow: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.md, paddingVertical: designSpacing.xs },
        txnIcon: {
          width: 28,
          height: 28,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
        },
        txnBody: { flex: 1 },
        txnLabel: { ...typeStyle('support', locale), color: semantic.textPrimary },
        txnDate: { ...typeStyle('meta', locale), color: semantic.textTertiary },
        txnAmount: { ...typeStyle('figureRow', locale), flexShrink: 0 },
        // Icon + short label + value. No prose.
        insightStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: designSpacing.md, marginTop: designSpacing.md },
        insightItem: { flexDirection: 'row', alignItems: 'center', gap: designSpacing.xs, flexShrink: 1 },
        insightText: { ...typeStyle('meta', locale), color: semantic.textSecondary, flexShrink: 1 },
      }),
    [semantic, locale, stackMetrics, stackActions]
  );

  // ==========================================================================
  // State A — nothing recorded at all.
  // ==========================================================================
  if (!hasActivity) {
    return (
      <View style={styles.card} testID="money-this-month-card">
        <Text style={styles.subtitle}>Month to date · {monthLabel}</Text>
        <Text style={styles.emptyText}>No transactions recorded yet.</Text>
        <TouchableOpacity style={styles.linkButton} onPress={onAddTransaction} accessibilityRole="button" accessibilityLabel="Add transaction">
          <Text style={styles.linkButtonText}>Add transaction</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Positive net reads in the success role, negative in caution — never
  // urgent red, which is reserved for genuinely time-sensitive items.
  const netColor =
    summary.netCents > 0 ? semantic.success : summary.netCents < 0 ? semantic.warning : semantic.textPrimary;

  return (
    <View style={styles.card} testID="money-this-month-card">
      <Text style={styles.subtitle}>Month to date · {monthLabel}</Text>
      <Text style={styles.definition}>{MONEY_MEASURE_DEFINITIONS.thisMonth}</Text>

      {/* Wave 6 final refinement — three compact metric cells rather than
          three identical label/value rows. Each carries a restrained tinted
          icon tile so the measures are differentiable at a glance; only the
          amounts that are genuinely positive money take the success role,
          and ordinary spending stays neutral ink. */}
      <View style={styles.metricGrid}>
        {[
          {
            key: 'income',
            testID: 'this-month-income',
            label: 'Income recorded',
            value: formatCents(summary.incomeCents),
            icon: 'cash-outline' as keyof typeof Ionicons.glyphMap,
            tile: semantic.successTint,
            tileInk: semantic.success,
            valueInk: semantic.success,
          },
          {
            key: 'spending',
            testID: 'this-month-spending',
            label: 'Spending recorded',
            value: formatCents(summary.spendingCents),
            icon: 'receipt-outline' as keyof typeof Ionicons.glyphMap,
            tile: semantic.interactiveTint,
            tileInk: semantic.interactive,
            valueInk: semantic.textPrimary,
          },
          {
            key: 'net',
            testID: 'this-month-net',
            label: 'Net recorded',
            value: formatCents(summary.netCents),
            icon: (summary.netCents < 0 ? 'trending-down-outline' : 'trending-up-outline') as keyof typeof Ionicons.glyphMap,
            tile: summary.netCents < 0 ? semantic.warningTint : semantic.interactiveTint,
            tileInk: summary.netCents < 0 ? semantic.warning : semantic.interactive,
            valueInk: netColor,
          },
        ].map((m) => (
          <View key={m.key} style={styles.metricCell} testID={m.testID}>
            <View style={[styles.metricTile, { backgroundColor: m.tile }]} importantForAccessibility="no-hide-descendants">
              <Ionicons name={m.icon} size={14} color={m.tileInk} />
            </View>
            <Text style={styles.metricLabel} numberOfLines={2}>{m.label}</Text>
            <Text
              style={[styles.metricValue, { color: m.valueInk }]}
              numberOfLines={1}
              accessibilityLabel={`${m.label} ${m.value}`}
            >
              {m.value}
            </Text>
          </View>
        ))}
      </View>

      {/* Wave 6 final refinement — the standalone "Current credit-card
          balance" line is gone from this card. It sat directly beneath
          three month-to-date measures while being a present-moment
          snapshot, which invited exactly the misreading it carried a
          disclaimer about. It now lives inside Spending sources, attached
          to the card it belongs to, where "paid this month" and "current
          balance" are two labelled lines on one row and can no longer be
          confused for each other. */}

      {!hasSpending ? <Text style={styles.emptyText}>No spending recorded yet.</Text> : null}

      {/* Wave 6 final pass — Recent activity, merged in from its retired
          standalone section. Preview only: at most three rows, no nested
          scroll, and the full journey stays one tap away below. */}
      {recent.length > 0 ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.subHeading}>Recent activity</Text>
          {recent.slice(0, MAX_RECENT_ROWS).map((t) => (
            <View
              key={t.id}
              style={styles.txnRow}
              testID={`this-month-recent-${t.id}`}
              accessible
              accessibilityLabel={`${t.label}, ${t.dateLabel}, ${t.amountLabel}`}
            >
              {/* Canonical category glyph and its designed domain tone, so
                  Groceries, Dining out and Bonus are distinguishable at a
                  glance without any of them shouting. */}
              <View
                style={[styles.txnIcon, { backgroundColor: toneTint(t.tone, semantic).bg }]}
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons name={t.icon} size={14} color={toneTint(t.tone, semantic).ink} />
              </View>
              <View style={styles.txnBody}>
                <Text style={styles.txnLabel} numberOfLines={1}>{t.label}</Text>
                <Text style={styles.txnDate}>{t.dateLabel}</Text>
              </View>
              {/* Income may read as success; ordinary spending is neutral
                  ink, never urgent red. */}
              <Text
                style={[styles.txnAmount, { color: t.isIncome ? semantic.success : semantic.textPrimary }]}
                numberOfLines={1}
              >
                {t.amountLabel}
              </Text>
            </View>
          ))}
          {insights.length > 0 ? (
            <View style={styles.insightStrip} testID="this-month-insights">
              {insights.slice(0, MAX_INSIGHTS).map((i) => (
                <View key={i.key} style={styles.insightItem}>
                  <Ionicons name={i.icon} size={13} color={semantic.textTertiary} importantForAccessibility="no" />
                  <Text style={styles.insightText} numberOfLines={2}>
                    {i.label} · {i.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {/* Wave 6 final refinement — two explicit outline buttons. These
          were plain text links, which read as captions rather than
          controls. A deliberately thick 2pt interactive border makes them
          unmistakably tappable without the filled treatment a confirmation
          would use. */}
      <View style={styles.actionRow}>
        {hasSpending ? (
          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => setSourcesSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Spending sources"
            accessibilityHint="Opens which accounts and cards paid for this month's spending"
            testID="money-spending-sources-action"
          >
            <Ionicons name="pie-chart-outline" size={16} color={semantic.interactive} importantForAccessibility="no" />
            <Text style={styles.outlineButtonText} numberOfLines={1}>Spending sources</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.outlineButton}
          onPress={onViewTransactions}
          accessibilityRole="button"
          accessibilityLabel="View all transactions"
          testID="money-view-transactions-action"
        >
          <Ionicons name="receipt-outline" size={16} color={semantic.interactive} importantForAccessibility="no" />
          {/* Wave 6 closure — "View all transactions" beside "Spending
              sources" cannot fit two full labels in half a 390pt card, and
              the device review showed it truncating. Rather than shrink
              the type or ellipsise meaning, the VISIBLE label shortens to
              "Transactions" while the accessible name stays complete — so
              nothing is lost to a screen reader, and nothing is clipped on
              screen. Side by side it reads "Spending sources /
              Transactions", which is unambiguous in context. */}
          <Text style={styles.outlineButtonText} numberOfLines={1}>
            {stackActions ? 'View all transactions' : 'Transactions'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>Based on transactions recorded in Nolie.</Text>
      {summary.hasInvalidRecordedAmounts ? (
        <Text style={styles.disclaimer}>Some recorded amounts couldn't be included.</Text>
      ) : null}

      <ThisMonthSourcesSheet
        visible={sourcesSheetVisible}
        onClose={() => setSourcesSheetVisible(false)}
        sources={summary.spendingSources}
        spendingCents={summary.spendingCents}
        cardContexts={cardContexts}
        otherCardBalances={otherCardBalances}
      />
    </View>
  );
}
