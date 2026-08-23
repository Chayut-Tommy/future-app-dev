import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { computeDebtCoachSummary, computeHasAnyDebt } from '../../lib/calculations/debtCoach';
import { buildDebtFreeCelebration } from '../../lib/celebrations';
import { LiabilityType } from '../../types/models';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { AddCreditCardModal } from '../credit/AddCreditCardModal';
import { brand } from '../../lib/brand';
import { DEBT_SCENARIO_PROMPT } from '../../lib/creditCardPresentation';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function monthsLabel(months: number): string {
  if (months < 1) return 'less than a month';
  const years = Math.floor(months / 12);
  const remMonths = Math.round(months % 12);
  if (years === 0) return `${remMonths} month${remMonths === 1 ? '' : 's'}`;
  if (remMonths === 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} year${years === 1 ? '' : 's'} ${remMonths} month${remMonths === 1 ? '' : 's'}`;
}

const DEBT_TYPE_OPTIONS: { type: LiabilityType | 'credit_card'; label: string; emoji: string }[] = [
  { type: 'credit_card', label: 'Credit card', emoji: '💳' },
  { type: 'mortgage', label: 'Mortgage', emoji: '🏠' },
  { type: 'car_loan', label: 'Car loan', emoji: '🚗' },
  { type: 'personal_loan', label: 'Personal loan', emoji: '💰' },
];

/**
 * "Reduce Debt" should feel like coaching, never like a forced add-a-
 * liability form (PRD ask). Two real states: if Lulu already knows about
 * debt, show a Debt Coach with real numbers and real payoff math; if not,
 * ask first — adding a liability only happens once Lulu actually needs
 * that information, and choosing "no debt" is celebrated, not ignored.
 */
export function DebtCoachSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateUser } = useAppState();
  const { celebrate } = useCelebration();
  const { colors, semantic, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [addLiabilityType, setAddLiabilityType] = useState<LiabilityType | null>(null);
  const [addCardVisible, setAddCardVisible] = useState(false);

  const hasDebt = computeHasAnyDebt(data);
  const summary = useMemo(() => computeDebtCoachSummary(data), [data]);

  // Wave 9a closure, Correction A — eligibility comes from the AUTHORITATIVE
  // card collection, never from a row's display copy or its icon name. The
  // same collection is what debtCoach.ts consults (via `l.creditCardId`) to
  // stamp a DebtEntry `kind: 'credit_card'`, so the two can never disagree
  // about what a genuine card is. Reading `data.creditCards` rather than
  // `summary.debts` keeps the ONLY stable route to Cards independent of any
  // balance: paying a card down to zero drops it out of the debt list, and
  // tying reachability to that would recreate the very defect this fixes.
  const hasCreditCards = data.creditCards.length > 0;

  // Guards a double tap: the first press latches, so a second press landing
  // before this sheet has actually gone cannot push Cards a second time.
  // Reset whenever the sheet is presented again, mirroring OptionsSheet's
  // own on-visible reset of its pending-selection lifecycle.
  const navigatingRef = useRef(false);
  useEffect(() => {
    if (visible) navigatingRef.current = false;
  }, [visible]);

  function handleViewCreditCards() {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    // Close the hosting sheet BEFORE navigating, never after — the exact
    // ordering (and reason) SmartReminderCard's "View card" already uses:
    // navigating first leaves a still-visible, now-empty sheet rendered on
    // top of Cards. Cards is a plain stack screen, not a modal
    // presentation, so this is an ordinary push behind a dismissing
    // transparent Modal — no native modal-vs-modal race, and therefore no
    // deferral to onDismiss and no timer.
    onClose();
    navigation.navigate('Cards');
  }

  function handleNoDebt() {
    updateUser({ confirmedNoDebt: true });
    onClose();
    celebrate(buildDebtFreeCelebration());
  }

  function handleDebtType(type: LiabilityType | 'credit_card') {
    onClose();
    if (type === 'credit_card') setAddCardVisible(true);
    else setAddLiabilityType(type);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: semantic.scrim, justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          maxHeight: '85%',
        },
        grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
        title: { ...typography.heading, fontSize: 18, color: colors.textPrimary, marginBottom: spacing.xs },
        subtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.lg },
        debtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.sm },
        debtTextBlock: { flex: 1 },
        debtLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        debtSub: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        // Wave 9a closure, Correction A. `typography.caption` from the token
        // set carries NO fontFamily, so it renders in the platform default —
        // the Wave 8 trap. This new surface resolves Figtree through the
        // shared role resolver instead. Ocean interactive is the existing
        // semantic role for a navigating link (YourFutureCard uses the same
        // pairing). `flexWrap` plus a shrinking label is what keeps the row
        // legible at 320pt and 200% Dynamic Type instead of clipping.
        cardsLink: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing.xs,
          alignSelf: 'flex-start',
          minHeight: 44,
          minWidth: 44,
          paddingVertical: spacing.xs,
          paddingRight: spacing.sm,
          marginBottom: spacing.sm,
        },
        cardsLinkText: { ...typeStyle('support', locale), fontWeight: '700', color: semantic.interactive, flexShrink: 1 },
        suggestionsBlock: { marginTop: spacing.sm, marginBottom: spacing.md },
        suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
        suggestionText: { ...typography.caption, fontSize: 13, color: colors.textPrimary, flex: 1, lineHeight: 18 },
        optionGrid: { gap: spacing.sm, marginBottom: spacing.md },
        optionTile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
        optionEmoji: { fontSize: 20 },
        optionLabel: { ...typography.body, fontSize: 15, color: colors.textPrimary },
        noDebtRow: { alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.control, backgroundColor: colors.accentSoft, marginBottom: spacing.sm },
        noDebtText: { ...typography.body, fontSize: 15, color: colors.accentStrong, fontWeight: '600' },
        disclosure: { ...typography.micro, fontSize: 10, color: colors.textMuted, lineHeight: 14, marginTop: spacing.xs },
        closeButton: { alignSelf: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
        closeText: { color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, semantic, radius, spacing, typography, insets.bottom, locale]
  );

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            {hasDebt ? (
              <>
                <Text style={styles.title}>Your debt overview</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {summary.debts.map((d) => (
                    <View key={d.id} style={styles.debtRow}>
                      <Ionicons name={d.icon} size={18} color={colors.textSecondary} />
                      <View style={styles.debtTextBlock}>
                        <Text style={styles.debtLabel}>{d.label}</Text>
                        <Text style={styles.debtSub}>
                          {formatMoney(d.balance)} remaining
                          {d.monthlyRepayment ? ` · ${formatMoney(d.monthlyRepayment)}/month` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}

                  <View style={styles.suggestionsBlock}>
                    {summary.payoffAcceleration ? (
                      <View style={styles.suggestionRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                        <Text style={styles.suggestionText}>
                          Scenario: an additional {formatMoney(summary.payoffAcceleration.extraMonthly)}/month toward{' '}
                          {summary.payoffAcceleration.debt.label} may shorten the estimated repayment period by approximately{' '}
                          {monthsLabel(summary.payoffAcceleration.monthsSaved)}, based on the information entered.
                        </Text>
                      </View>
                    ) : null}
                    {summary.highestInterestDebt ? (
                      <View style={styles.suggestionRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                        <Text style={styles.suggestionText}>
                          {summary.highestInterestDebt.label} carries your highest recorded interest rate (
                          {Math.round((summary.highestInterestDebt.interestRate ?? 0) * 100)}%) — a common focus area when comparing
                          repayment options.
                        </Text>
                      </View>
                    ) : null}
                    {summary.debtToIncomeRatio !== null ? (
                      <View style={styles.suggestionRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                        <Text style={styles.suggestionText}>
                          Recorded debt repayments are about {Math.round(summary.debtToIncomeRatio * 100)}% of recorded income —
                          general reference: staying below 30–35% may leave more flexibility for other expenses.
                        </Text>
                      </View>
                    ) : null}
                    {/* Wave 9a closure, Correction B — "…can show real payoff
                        scenarios here" overstated what the recorded inputs
                        support and read as a plan rather than an
                        illustration. The disclosure below stays visible
                        alongside it. */}
                    {!summary.payoffAcceleration && !summary.highestInterestDebt && summary.debtToIncomeRatio === null ? (
                      <Text style={styles.suggestionText}>{DEBT_SCENARIO_PROMPT}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.disclosure}>
                    Educational estimate only. Interest, fees, repayment rules and your circumstances may change the result.
                  </Text>
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.title}>Let's understand your debt first</Text>
                <Text style={styles.subtitle}>Do you currently have any debt?</Text>
                <View style={styles.optionGrid}>
                  {DEBT_TYPE_OPTIONS.map((o) => (
                    <TouchableOpacity key={o.type} style={styles.optionTile} onPress={() => handleDebtType(o.type)}>
                      <Text style={styles.optionEmoji}>{o.emoji}</Text>
                      <Text style={styles.optionLabel}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.noDebtRow} onPress={handleNoDebt}>
                  <Text style={styles.noDebtText}>❌ I have no debt</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Wave 9a closure, Correction A — the ONE stable customer route
                to Cards. Before it, Cards was reachable only from the
                transient `card_due_soon` reminder, so ordering, snoozing or
                dismissing that reminder removed the only way in (confirmed
                P2 on device).

                DELIBERATELY OUTSIDE BOTH BRANCHES. It first shipped inside
                the `hasDebt` overview, which reintroduced the same class of
                defect from the other side: a customer whose cards are all at
                $0 and who has no other liability falls into the no-debt
                branch, and the route vanished again — even though the card
                records plainly still exist. A zero balance means a card is
                not DEBT; it never means the card is not THERE. Eligibility is
                therefore the authoritative collection (`data.creditCards`),
                and this shared footer position is the one place present in
                both presentations, so exactly one action renders either way.
                `hasDebt` keeps its financial meaning untouched, and a $0 card
                is still never counted or labelled as debt.

                Still a single action for the whole card set rather than a
                per-row affordance: making rows tappable would imply loan rows
                navigate somewhere too, and they do not. */}
            {hasCreditCards ? (
              <TouchableOpacity
                style={styles.cardsLink}
                activeOpacity={0.7}
                onPress={handleViewCreditCards}
                accessibilityRole="button"
                accessibilityLabel="View credit cards"
                accessibilityHint="Opens your recorded credit card details"
                testID="debt-overview-view-cards"
              >
                <Ionicons name="card" size={16} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
                <Text style={styles.cardsLinkText}>View credit cards</Text>
                {/* Non-colour navigation cue: the chevron carries the "goes
                    somewhere" meaning for anyone who cannot use the Ocean
                    tint alone. */}
                <Ionicons name="chevron-forward" size={13} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AddWealthItemModal
        visible={addLiabilityType !== null}
        kind="liability"
        presetLiabilityType={addLiabilityType ?? undefined}
        onClose={() => setAddLiabilityType(null)}
      />
      <AddCreditCardModal visible={addCardVisible} onClose={() => setAddCardVisible(false)} />
    </>
  );
}
