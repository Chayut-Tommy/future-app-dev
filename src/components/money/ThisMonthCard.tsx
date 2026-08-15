import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Animated, AccessibilityInfo, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { SectionCard } from '../shared/SectionCard';
import { ThisMonthRecordedSummary, ThisMonthSpendingSource } from '../../lib/calculations/monthlySummary';
import { ThisMonthSourcesSheet } from './ThisMonthSourcesSheet';

const FLIP_DURATION_MS = 350;
const COMPACT_ROW_LIMIT = 4;
const COMPACT_TOP_N_WHEN_OVERFLOW = 3;

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

function sanitizeBalance(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Deterministic compact-row shape (PRD ask, "Compact source rule" — one
 * rule, not two unresolved alternatives): 1-4 sources show individually;
 * 5+ show the top 3 individually plus one aggregated overflow row whose
 * amount is the exact sum of everything past the top 3 — never 4
 * individual rows plus a 5th overflow row. `spendingSources` is already
 * sorted deterministically (amount desc, label, key) by
 * computeThisMonthRecordedSummary itself — never re-sorted here. */
function computeCompactRows(sources: ThisMonthSpendingSource[]): {
  rows: ThisMonthSpendingSource[];
  overflow: { count: number; amountCents: number } | null;
} {
  if (sources.length <= COMPACT_ROW_LIMIT) return { rows: sources, overflow: null };
  const rows = sources.slice(0, COMPACT_TOP_N_WHEN_OVERFLOW);
  const rest = sources.slice(COMPACT_TOP_N_WHEN_OVERFLOW);
  return { rows, overflow: { count: rest.length, amountCents: rest.reduce((sum, s) => sum + s.amountCents, 0) } };
}

/**
 * "This Month" — a factual, calendar-month recorded-activity summary (PRD
 * ask, Finding #40), redesigned as a two-face flip card (correction round,
 * 2026-08-10). Front answers "how much qualifying income and spending has
 * been recorded so far this month"; back answers "which recorded funding
 * sources paid for that spending." Complements Available Until Payday
 * rather than altering it — Available Until Payday answers "how much
 * included cash is estimated to remain until payday"; this answers "what
 * have I actually recorded this calendar month." Related but genuinely
 * different questions, never merged into one number (PRD ask).
 *
 * Both faces read from the ONE shared `summary` (ThisMonthRecordedSummary,
 * monthlySummary.ts) — incomeCents/spendingCents/netCents on the front,
 * spendingSources on the back — never independently-rounded broad buckets
 * on one face and exact cents on the other (PRD ask, "Unify the front and
 * back exact-cent contract"). `sum(spendingSources[].amountCents) ===
 * spendingCents` holds exactly, by construction, inside that function.
 */
export function ThisMonthCard({
  summary,
  creditCardBalance,
  hasCreditCards,
  creditCardCount,
  monthStart,
  today,
  onViewTransactions,
  onAddTransaction,
}: {
  summary: ThisMonthRecordedSummary;
  creditCardBalance: number;
  hasCreditCards: boolean;
  creditCardCount: number;
  monthStart: Date;
  today: Date;
  onViewTransactions: () => void;
  onAddTransaction: () => void;
}) {
  const { colors, spacing, typography, radius } = useTheme();

  const hasIncome = summary.incomeCents > 0;
  const hasSpending = summary.spendingCents > 0;
  // Correction round, 2026-08-10 ("Define the invalid-only degraded
  // state"): a month with no valid income/expense transactions but at
  // least one recorded transaction that failed strict validation must NOT
  // fall into the true empty state below — that would say "No transactions
  // recorded yet," which is false (something was recorded, it just
  // couldn't be included) and would hide the disclosure line entirely.
  // Treating hasInvalidRecordedAmounts as activity routes this case into
  // the same safe-zero-values + disclosure + View transactions rendering
  // as the ordinary income-only state below, never the flip (hasSpending
  // stays false either way).
  const hasActivity = hasIncome || hasSpending || summary.hasInvalidRecordedAmounts;

  const monthLabel = `${monthStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} to today`;

  // Sign-aware credit-card snapshot — unchanged arithmetic from the prior
  // single-face card, only the multi-card label (PRD ask, "Multiple-card
  // wording decision") is new. `< 0` (not `<= 0`) deliberately excludes -0
  // from the "in credit" branch.
  const sanitizedCreditCardBalance = sanitizeBalance(creditCardBalance);
  const cardsInCredit = sanitizedCreditCardBalance < 0;
  const displayedCardBalance = Math.round(Math.abs(sanitizedCreditCardBalance));
  const creditCardLabel = creditCardCount > 1 ? 'Current credit-card balances' : 'Current credit-card balance';
  const creditCardSubLabel = cardsInCredit
    ? 'Your cards are currently in credit'
    : creditCardCount > 1
    ? `Across ${creditCardCount} cards`
    : "A snapshot, not this month's spending";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
        subtitle: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
        rowLabel: { ...typography.body, fontSize: 13, color: colors.textSecondary },
        rowValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        sourceLabel: { ...typography.body, fontSize: 13, color: colors.textSecondary, flexShrink: 1, marginRight: spacing.sm },
        sourcePercentage: { ...typography.caption, fontSize: 11, color: colors.textMuted, marginTop: 1 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
        balanceLabel: { ...typography.micro, fontSize: 11, color: colors.textMuted },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.sm },
        addButton: {
          alignSelf: 'flex-start',
          backgroundColor: colors.accentSoft,
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
          minHeight: 44,
          justifyContent: 'center',
        },
        addButtonText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
        disclaimer: { ...typography.micro, fontSize: 10, color: colors.textMuted, marginTop: spacing.sm },
        controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
        pillButton: {
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 44,
          justifyContent: 'center',
        },
        pillButtonText: { ...typography.caption, fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
        linkButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
        linkButtonText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
        faceContainer: { position: 'relative' },
        face: { backfaceVisibility: 'hidden' },
        faceBack: { position: 'absolute', top: 0, left: 0, right: 0 },
      }),
    [colors, spacing, typography, radius]
  );

  // ==========================================================================
  // State A — no income, no spending: the established empty state, no flip
  // control, no back face at all (PRD ask, "no income and no spending").
  // ==========================================================================
  if (!hasActivity) {
    return (
      <SectionCard>
        <Text style={styles.title}>This Month</Text>
        <Text style={styles.subtitle}>Month to date · {monthLabel}</Text>
        <Text style={styles.emptyText}>No transactions recorded yet.</Text>
        <TouchableOpacity style={styles.addButton} onPress={onAddTransaction} accessibilityRole="button" accessibilityLabel="Add transaction">
          <Text style={styles.addButtonText}>Add transaction</Text>
        </TouchableOpacity>
      </SectionCard>
    );
  }

  const netColor = summary.netCents > 0 ? colors.accentStrong : summary.netCents < 0 ? colors.warning : colors.textPrimary;

  const frontFigures = (
    <>
      <Text style={styles.title}>This Month</Text>
      <Text style={styles.subtitle}>Month to date · {monthLabel}</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Income recorded</Text>
        <Text style={[styles.rowValue, { color: colors.accentStrong }]} accessibilityLabel={`Income recorded ${formatCents(summary.incomeCents)}`}>
          {formatCents(summary.incomeCents)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Spending recorded</Text>
        <Text style={styles.rowValue} accessibilityLabel={`Spending recorded ${formatCents(summary.spendingCents)}`}>
          {formatCents(summary.spendingCents)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Net recorded</Text>
        <Text style={[styles.rowValue, { color: netColor }]} accessibilityLabel={`Net recorded ${formatCents(summary.netCents)}`}>
          {formatCents(summary.netCents)}
        </Text>
      </View>
      {hasCreditCards ? (
        <>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>{creditCardLabel}</Text>
              <Text style={styles.balanceLabel}>{creditCardSubLabel}</Text>
            </View>
            <Text style={styles.rowValue}>
              {cardsInCredit ? '-' : ''}
              {`$${displayedCardBalance.toLocaleString()}`}
            </Text>
          </View>
        </>
      ) : null}
    </>
  );

  const disclosureLines = (
    <>
      <Text style={styles.disclaimer}>Based on transactions recorded in Nolie.</Text>
      {summary.hasInvalidRecordedAmounts ? <Text style={styles.disclaimer}>Some recorded amounts couldn't be included.</Text> : null}
    </>
  );

  // ==========================================================================
  // State B — income recorded, no spending: front-only, no flip control, no
  // back face rendered at all (PRD ask, "no spending — no flip; there is no
  // source breakdown to show").
  // ==========================================================================
  if (!hasSpending) {
    return (
      <SectionCard>
        {frontFigures}
        <Text style={styles.emptyText}>No spending recorded yet.</Text>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={onViewTransactions}
            accessibilityRole="button"
            accessibilityLabel="View transactions"
          >
            <Text style={styles.linkButtonText}>View transactions</Text>
          </TouchableOpacity>
        </View>
        {disclosureLines}
      </SectionCard>
    );
  }

  // ==========================================================================
  // States C/D — spending exists: full two-face flip card.
  // ==========================================================================
  return (
    <ThisMonthFlipBody
      summary={summary}
      frontFigures={frontFigures}
      disclosureLines={disclosureLines}
      onViewTransactions={onViewTransactions}
      styles={styles}
      colors={colors}
    />
  );
}

/** Split out from ThisMonthCard so the flip-specific state (Animated.Value,
 * Reduce Motion, measured height, the sources-detail sheet) only exists
 * when there's genuinely something to flip to (spending > 0) — states A/B
 * above never mount any of it. */
function ThisMonthFlipBody({
  summary,
  frontFigures,
  disclosureLines,
  onViewTransactions,
  styles,
  colors,
}: {
  summary: ThisMonthRecordedSummary;
  frontFigures: React.ReactNode;
  disclosureLines: React.ReactNode;
  onViewTransactions: () => void;
  styles: Record<string, any>;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [face, setFace] = useState<'front' | 'back'>('front');
  const [sourcesSheetVisible, setSourcesSheetVisible] = useState(false);
  const flipProgress = useRef(new Animated.Value(0)).current;
  const generationRef = useRef(0);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);
  const frontHeightRef = useRef<number | undefined>(undefined);
  const backHeightRef = useRef<number | undefined>(undefined);

  // Reduce Motion — the same established AccessibilityInfo pattern already
  // used for AddAnythingSheet's push transition, the only other flip/
  // transition surface in this app (PRD ask: reuse, don't reinvent).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  function flipTo(target: 'front' | 'back') {
    if (face === target) return;
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    const toValue = target === 'back' ? 1 : 0;
    if (reduceMotionEnabled) {
      flipProgress.setValue(toValue);
      setFace(target);
      return;
    }
    Animated.timing(flipProgress, { toValue, duration: FLIP_DURATION_MS, useNativeDriver: true }).start(() => {
      if (myGeneration !== generationRef.current) return; // stale-completion guard — rapid-tap safe
      setFace(target);
    });
  }

  function updateMeasuredHeight(face: 'front' | 'back', height: number) {
    if (face === 'front') frontHeightRef.current = height;
    else backHeightRef.current = height;
    const front = frontHeightRef.current;
    const back = backHeightRef.current;
    if (front !== undefined && back !== undefined) {
      const max = Math.max(front, back);
      setContainerHeight((prev) => (prev === max ? prev : max));
    }
  }

  const frontRotateY = flipProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotateY = flipProgress.interpolate({ inputRange: [0, 1], outputRange: ['-180deg', '0deg'] });

  const { rows: compactRows, overflow } = computeCompactRows(summary.spendingSources);

  return (
    <SectionCard>
      <View style={[styles.faceContainer, containerHeight !== undefined ? { height: containerHeight } : null]}>
        {/* FRONT FACE */}
        <Animated.View
          style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: frontRotateY }] }]}
          onLayout={(e) => updateMeasuredHeight('front', e.nativeEvent.layout.height)}
          pointerEvents={face === 'front' ? 'auto' : 'none'}
          accessibilityElementsHidden={face !== 'front'}
          importantForAccessibility={face === 'front' ? 'auto' : 'no-hide-descendants'}
        >
          {frontFigures}
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={styles.pillButton}
              onPress={() => flipTo('back')}
              accessibilityRole="button"
              accessibilityLabel="Show spending sources"
              accessibilityHint="Flips the card to show which sources funded this month's spending"
            >
              <Text style={styles.pillButtonText}>Show spending sources</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.linkButton} onPress={onViewTransactions} accessibilityRole="button" accessibilityLabel="View transactions">
              <Text style={styles.linkButtonText}>View transactions</Text>
            </TouchableOpacity>
          </View>
          {disclosureLines}
        </Animated.View>

        {/* BACK FACE */}
        <Animated.View
          style={[styles.face, styles.faceBack, { transform: [{ perspective: 1000 }, { rotateY: backRotateY }] }]}
          onLayout={(e) => updateMeasuredHeight('back', e.nativeEvent.layout.height)}
          pointerEvents={face === 'back' ? 'auto' : 'none'}
          accessibilityElementsHidden={face !== 'back'}
          importantForAccessibility={face === 'back' ? 'auto' : 'no-hide-descendants'}
        >
          <Text style={styles.title}>How spending was paid</Text>
          <Text style={styles.subtitle}>Month to date · Spending recorded {formatCents(summary.spendingCents)}</Text>
          {compactRows.map((source) => (
            <View key={source.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceLabel} numberOfLines={1} accessibilityLabel={source.label}>
                  {source.label}
                </Text>
                <Text style={styles.sourcePercentage}>{source.percentage}%</Text>
              </View>
              <Text style={styles.rowValue} accessibilityLabel={`${source.label} ${formatCents(source.amountCents)}`}>
                {formatCents(source.amountCents)}
              </Text>
            </View>
          ))}
          {overflow ? (
            <View style={styles.row}>
              <Text style={styles.sourceLabel}>{`+${overflow.count} more sources`}</Text>
              <Text style={styles.rowValue}>{formatCents(overflow.amountCents)}</Text>
            </View>
          ) : null}
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={styles.pillButton}
              onPress={() => flipTo('front')}
              accessibilityRole="button"
              accessibilityLabel="Show monthly summary"
              accessibilityHint="Flips the card back to income, spending and net recorded"
            >
              <Text style={styles.pillButtonText}>Show monthly summary</Text>
            </TouchableOpacity>
            {overflow ? (
              <TouchableOpacity
                style={styles.pillButton}
                onPress={() => setSourcesSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="View all sources"
              >
                <Text style={styles.pillButtonText}>View all</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </View>

      <ThisMonthSourcesSheet
        visible={sourcesSheetVisible}
        onClose={() => setSourcesSheetVisible(false)}
        sources={summary.spendingSources}
        spendingCents={summary.spendingCents}
      />
    </SectionCard>
  );
}
