import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { SectionCard } from '../shared/SectionCard';
import { ProgressBar } from '../shared/ProgressBar';
import { Button } from '../shared/Button';
import { AddGoalModal } from '../goals/AddGoalModal';
import { AddIncomeModal } from '../income/AddIncomeModal';
import { DebtCoachSheet } from '../debt/DebtCoachSheet';
import { AddAnythingSheet, AddAnythingKind } from '../navigation/AddAnythingSheet';
// The CTA's deterministic priority resolver and the structured completion
// predicates — RN-free in lib/setupChecklist so every rule is directly
// executable evidence (see that module's own doc comments).
import { hasEverydayAccount, hasSavingsAccount, hasWealthAsset, resolveNextSetupStep } from '../../lib/setupChecklist';

/**
 * First-run "complete your setup" checklist (PRD ask): after onboarding, a
 * brand-new customer sees the concrete next steps that make the app real.
 * Every step's completion derives from actual data — never a fabricated
 * percentage or local display state — and honest "not for me" answers and
 * deferrals (the existing persisted confirmed* flags) complete a step
 * without forcing a fake entry.
 *
 * Wave 9c final correction pass (on top of the accepted closure rebuild):
 *
 * CTA PROMINENCE — one full-width "Continue setup" primary action resolves
 * deterministically (resolveNextSetupStep above) to the highest-priority
 * incomplete step; rows remain direct secondary paths. Progress reads
 * "{n} of {m} complete", never "added" — a deferred optional goal is
 * complete without anything having been added. Each incomplete row states
 * its factual value; completed rows read "Added" (or their truthful
 * answer), deferred rows read "Later" with a time glyph, never a check.
 *
 * INCOME COMPLETION — an income the legacy onboarding build persisted
 * without a payday (`nextDueDateUnknown` on a predictable cadence) makes
 * the income step INCOMPLETE again, and its action opens that SAME record
 * in the canonical editor (stable id, updated in place) instead of any add
 * flow — the checklist can never invite a duplicate.
 *
 * COMPLETION — everything done or deferred shows a calm "Setup complete"
 * state; the customer closes the card themselves. No timer, no
 * auto-dismissal (supersedes the auto-dismiss-with-toast effect).
 *
 * TRANSITIONS (accepted closure correction, preserved verbatim): a row's
 * primary action opens the ONE canonical AddAnythingSheet workspace
 * directly at its destination (`initialKind`) — no teaser modals, no
 * root-screen flash, one intent, one dismissal.
 */
export function MoneyPictureChecklistCard() {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  const [completeIncomeVisible, setCompleteIncomeVisible] = useState(false);
  // The one workspace host. A row's primary action sets the destination;
  // null means closed. Rapid double-taps just re-set the same state — one
  // sheet, one intent.
  const [workspaceKind, setWorkspaceKind] = useState<AddAnythingKind | null>(null);

  // Wave 9c visual/checklist correction — SEPARATED structured predicates
  // (lib/setupChecklist): one record can only ever complete one account
  // step. The old broad sweeps let an Everyday account satisfy Assets and
  // a Savings record double-count, jumping progress two steps at once.
  const hasEveryday = hasEverydayAccount(data.assets);
  const hasSavings = hasSavingsAccount(data.assets);
  const hasGenuineAsset = hasWealthAsset(data.assets);
  const hasRealDebt = data.liabilities.some((l) => l.currentBalance > 0) || data.creditCards.some((c) => c.currentBalance > 0);
  const hasRealIncome = data.user.monthlyIncome > 0;
  const hasBills = data.recurringItems.some((r) => r.type === 'expense');
  const hasGoal = data.goals.length > 0;

  // Correction B's structured "unscheduled income" definition, applied
  // here too: an active income on a PREDICTABLE cadence whose date the
  // legacy onboarding build stamped unknown. An irregular income with an
  // unknown date is the accepted canonical state and stays complete. With
  // more than one (not creatable by any shipped path — onboarding wrote at
  // most one), the first in stored creation order is offered; Money's own
  // prompt hosts the full per-record chooser.
  const unscheduledIncome =
    data.recurringItems.find((r) => r.type === 'income' && r.active && r.nextDueDateUnknown === true && r.frequency !== 'irregular') ?? null;
  const incomeComplete = hasRealIncome && !unscheduledIncome;

  type Step = {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    status: string;
    done: boolean;
    deferred: boolean;
    onAdd: () => void;
    defer?: { label: string; onDefer: () => void };
  };

  const steps: Step[] = [
    {
      key: 'income',
      icon: 'cash-outline',
      title: 'Add your income',
      status: incomeComplete
        ? 'Added'
        : unscheduledIncome
        ? `Finish setting up ${unscheduledIncome.label} — add its next expected payday.`
        : data.user.confirmedNoIncome
        ? "No income yet — that's okay"
        : 'Places expected pay in your timeline.',
      done: incomeComplete || (!unscheduledIncome && !!data.user.confirmedNoIncome),
      deferred: false,
      // Completion before creation: an existing unscheduled record opens
      // ITSELF in the canonical editor; only a genuinely absent income
      // opens the add workspace.
      onAdd: () => (unscheduledIncome ? setCompleteIncomeVisible(true) : setWorkspaceKind('income')),
      defer: unscheduledIncome ? undefined : { label: "I don't have income yet", onDefer: () => updateUser({ confirmedNoIncome: true }) },
    },
    {
      key: 'everyday',
      icon: 'card-outline',
      title: 'Add an everyday account',
      status: hasEveryday
        ? 'Added'
        : data.user.confirmedEverydayLater
        ? 'Later'
        : 'Gives Available until payday a balance to work from.',
      done: hasEveryday || !!data.user.confirmedEverydayLater,
      deferred: !hasEveryday && !!data.user.confirmedEverydayLater,
      onAdd: () => setWorkspaceKind('everyday'),
      defer: { label: "I'll add one later", onDefer: () => updateUser({ confirmedEverydayLater: true }) },
    },
    {
      key: 'cash',
      icon: 'wallet-outline',
      title: 'Add your savings',
      status: hasSavings ? 'Added' : 'Shows money you have set aside.',
      done: hasSavings,
      deferred: false,
      onAdd: () => setWorkspaceKind('savings'),
    },
    {
      key: 'assets',
      icon: 'trending-up-outline',
      title: 'Add an asset',
      status: hasGenuineAsset
        ? 'Added'
        : data.user.confirmedCashOnly
        ? "Cash only for now — that's okay"
        : 'Adds vehicles, property or investments to your net worth.',
      done: hasGenuineAsset || !!data.user.confirmedCashOnly,
      deferred: false,
      // Checklist context only — the canonical Vehicle preset ('car'),
      // changeable in the form's own type selector. The global "+" tray's
      // asset tiles are untouched.
      onAdd: () => setWorkspaceKind('vehicle'),
      defer: { label: 'I only have cash right now', onDefer: () => updateUser({ confirmedCashOnly: true }) },
    },
    {
      key: 'bills',
      icon: 'calendar-outline',
      title: 'Add essential bills',
      status: hasBills ? 'Added' : data.user.confirmedBillsLater ? 'Later' : 'Keeps upcoming costs visible.',
      done: hasBills || !!data.user.confirmedBillsLater,
      deferred: !hasBills && !!data.user.confirmedBillsLater,
      onAdd: () => setWorkspaceKind('bill'),
      defer: { label: "I'll add these later", onDefer: () => updateUser({ confirmedBillsLater: true }) },
    },
    {
      key: 'debt',
      icon: 'file-tray-full-outline',
      title: 'Tell us about any debt',
      status: data.user.confirmedNoDebt ? 'Debt-free — nice!' : hasRealDebt ? 'Added' : 'Keeps what you owe visible.',
      done: hasRealDebt || !!data.user.confirmedNoDebt,
      deferred: false,
      onAdd: () => setDebtCoachVisible(true),
    },
    {
      key: 'goal',
      icon: 'flag-outline',
      title: 'Add a goal',
      status: hasGoal
        ? 'Added'
        : data.user.confirmedGoalLater
        ? 'Later — add one any time from Grow.'
        : 'Optional — track a target if useful.',
      done: hasGoal || !!data.user.confirmedGoalLater,
      deferred: !hasGoal && !!data.user.confirmedGoalLater,
      onAdd: () => setGoalModalVisible(true),
      defer: { label: 'Maybe later', onDefer: () => updateUser({ confirmedGoalLater: true }) },
    },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const nextSetupStep = resolveNextSetupStep(steps);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        title: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: 2, flex: 1 },
        subtitle: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.sm },
        progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
        progressText: { ...typeStyle('meta', locale), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        progressBarWrap: { flex: 1 },
        continueButton: { marginBottom: spacing.sm },
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm },
        iconTile: {
          width: 36,
          height: 36,
          borderRadius: radius.control,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconTileDone: { backgroundColor: colors.surfaceMuted },
        rowText: { flex: 1, flexShrink: 1 },
        rowTitle: { ...typeStyle('body', locale), color: colors.textPrimary, fontWeight: '600' },
        rowTitleDone: { color: colors.textSecondary },
        rowStatus: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 1 },
        deferButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginLeft: 36 + spacing.sm, paddingRight: spacing.md },
        deferText: { ...typeStyle('meta', locale), color: colors.textMuted, fontWeight: '600' },
        completeBody: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.md },
      }),
    [colors, radius, spacing, locale]
  );

  if (data.user.moneyPictureChecklistDismissed) return null;

  // The calm completion state — everything is done or explicitly set
  // aside. The customer closes the card; nothing dismisses it for them.
  if (allDone) {
    return (
      <SectionCard>
        <View style={styles.headerRow}>
          <Text style={styles.title} accessibilityRole="header">Setup complete</Text>
          <TouchableOpacity
            onPress={() => updateUser({ moneyPictureChecklistDismissed: true })}
            hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
            accessibilityRole="button"
            accessibilityLabel="Close setup checklist"
            testID="checklist-complete-close"
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.completeBody}>
          Everything here is recorded or set aside for later. Today, Money and Wealth are built from what you added.
        </Text>
        <Button label="Close" variant="secondary" onPress={() => updateUser({ moneyPictureChecklistDismissed: true })} testID="checklist-complete-done" />
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">Complete your money setup</Text>
        <TouchableOpacity
          onPress={() => updateUser({ moneyPictureChecklistDismissed: true })}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss setup checklist"
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Add a few more details to make Today, Money and Wealth more useful.</Text>
      <View style={styles.progressRow}>
        <View style={styles.progressBarWrap}>
          <ProgressBar progress={completedCount / steps.length} accessibilityLabel={`${completedCount} of ${steps.length} complete`} />
        </View>
        <Text style={styles.progressText}>{`${completedCount} of ${steps.length} complete`}</Text>
      </View>
      {/* THE next action, resolved from structured step state — one obvious
          full-width way forward, with the rows as direct secondary paths. */}
      {nextSetupStep ? (
        <Button label="Continue setup" onPress={nextSetupStep.onAdd} style={styles.continueButton} testID="checklist-continue" />
      ) : null}
      {steps.map((s) => (
        <View key={s.key}>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={s.onAdd}
            disabled={s.done}
            accessibilityRole="button"
            accessibilityState={{ disabled: s.done }}
            accessibilityLabel={`${s.title}. ${s.status}`}
            testID={`checklist-${s.key}`}
          >
            <View style={[styles.iconTile, s.done ? styles.iconTileDone : null]}>
              <Ionicons
                name={s.done ? (s.deferred ? 'time-outline' : 'checkmark') : s.icon}
                size={18}
                color={s.done ? colors.accent : colors.accentStrong}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, s.done ? styles.rowTitleDone : null]}>{s.title}</Text>
              <Text style={styles.rowStatus}>{s.status}</Text>
            </View>
            {!s.done ? (
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
            ) : null}
          </TouchableOpacity>
          {!s.done && s.defer ? (
            <TouchableOpacity
              style={styles.deferButton}
              onPress={s.defer.onDefer}
              accessibilityRole="button"
              accessibilityLabel={s.defer.label}
              testID={`checklist-${s.key}-defer`}
            >
              <Text style={styles.deferText}>{s.defer.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      <AddGoalModal visible={goalModalVisible} onClose={() => setGoalModalVisible(false)} />
      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
      {/* Correction B's checklist half — the canonical editor on the SAME
          stable record; completing its payday updates it in place. */}
      <AddIncomeModal visible={completeIncomeVisible} editItem={unscheduledIncome} onClose={() => setCompleteIncomeVisible(false)} />
      {/* The ONE workspace — the same canonical AddAnythingSheet the global
          "+" uses, entered directly at the row's destination. Its embedded
          transition controller owns every open/close/swipe/double-tap
          lifecycle; nothing here re-implements any of it. */}
      {/* Correction E — explicit caller context: an income saved FROM THE
          CHECKLIST returns straight here; the one-time "Plan around your
          income?" planner is never auto-opened over this flow. Every other
          income journey keeps its accepted prompt behaviour. */}
      <AddAnythingSheet
        visible={workspaceKind !== null}
        initialKind={workspaceKind ?? undefined}
        onClose={() => setWorkspaceKind(null)}
        suppressIncomePlannerPrompt
      />
    </SectionCard>
  );
}
