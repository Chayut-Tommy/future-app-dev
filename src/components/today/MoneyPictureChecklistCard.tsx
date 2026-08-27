import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { ON_FEATURED } from '../../theme/semanticTokens';
import { focusElement } from '../../lib/a11yFocus';
import { useCelebration } from '../../state/CelebrationContext';
import { confirmNoDebt } from '../../lib/noDebtConfirmation';
// The structured predicates, the deterministic priority resolver, and the
// PURE presentation composition (order, honest progress copy, compact
// subset, grouping) — all RN-free in lib/setupChecklist so every rule is
// directly executable evidence (see that module's own doc comments).
import {
  SetupStepComposition,
  composeSetupChecklist,
  hasEverydayAccount,
  hasSavingsAccount,
  hasWealthAsset,
  resolveNextSetupStep,
} from '../../lib/setupChecklist';

/**
 * First-run "complete your setup" checklist (PRD ask): after onboarding, a
 * brand-new customer sees the concrete next steps that make the app real.
 * Every step's completion derives from actual data — never a fabricated
 * percentage or local display state — and honest "not for me" answers and
 * deferrals (the existing persisted confirmed* flags) resolve a step
 * without forcing a fake entry.
 *
 * Post-Wave-10 checklist UX closure (this pass), on top of the accepted
 * Wave 9c rules — which are all preserved: the seven-step order, the
 * separated structured predicates, the deferral flags, the Vehicle asset
 * preset, completion-before-creation for an unscheduled income, the
 * canonical AddAnythingSheet workspace destinations, the calm
 * setup-complete state and the customer-owned dismissal.
 *
 * RESPONSIVE COMPOSITION — at zero progress the full seven-task list
 * renders expanded so a brand-new customer sees what each task improves.
 * Once at least one task is resolved, the card defaults to a compact
 * shape: header, honest progress, the featured Continue CTA, the next two
 * actionable tasks and one "View all setup steps" disclosure that expands
 * the full seven-row composition IN PLACE — the same Today scroll owner,
 * no nested ScrollView, no Modal, and the expanded/collapsed choice is
 * local presentation state only (never persisted).
 *
 * ONE ACTION PER ROW — the entire row is one button/focus stop; the
 * trailing state chip ("Add now" / truthful "Added" / neutral "Later" /
 * "Noted" / "Debt-free") is a purely visual affordance inside it, hidden
 * from accessibility along with the icons. Green appears only on a
 * genuinely completed/positive state.
 *
 * CONTAINED TASK GROUPS (visual-rhythm correction) — every step renders as
 * one contained group: the primary row plus, only while the alternative
 * applies, one attached secondary footer (quiet hairline divider, compact
 * padding, 44pt target, label aligned with the text column, no chevron —
 * it only updates checklist state). The footer is a SIBLING Pressable to
 * the row inside a plain View, never nested; tasks without an alternative
 * get no placeholder; exterior rhythm is one shared list gap, identical in
 * compact and expanded states.
 *
 * PROGRESS HONESTY — the numerator counts resolved steps, and the wording
 * is "complete" only while every resolved step is data-backed; the moment
 * an explicit deferral/acknowledgement is included it reads "reviewed"
 * (a deferred step is never called complete).
 */
export function MoneyPictureChecklistCard() {
  const { data, updateUser } = useAppState();
  // Checklist consistency correction — the Debt footer routes through the
  // ONE shared no-debt authority (write + action feedback + celebration).
  const { celebrate, confirmSaveSuccess } = useCelebration();
  const { colors, semantic, radius, spacing } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  const [completeIncomeVisible, setCompleteIncomeVisible] = useState(false);
  // The one workspace host. A row's primary action sets the destination;
  // null means closed. Rapid double-taps just re-set the same state — one
  // sheet, one intent.
  const [workspaceKind, setWorkspaceKind] = useState<AddAnythingKind | null>(null);
  // Local presentation state only (never persisted): once progress exists
  // the card is compact until the customer opens the full list.
  const [viewAll, setViewAll] = useState(false);

  // Focus restoration — the control that opened a task gets focus back
  // when that task's surface closes (VoiceOver never lands nowhere).
  const originRef = useRef<React.Component<unknown> | null>(null);
  const rowNodeRefs = useRef<Record<string, React.Component<unknown> | null>>({});
  const continueNodeRef = useRef<any>(null);
  const anyTaskOpen = workspaceKind !== null || goalModalVisible || debtCoachVisible || completeIncomeVisible;
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !anyTaskOpen) {
      // The card can recompose while a task is open (a save changes the
      // compact subset), leaving the captured origin unmounted — the
      // consolidated focus authority already tolerates that silently; the
      // local try/catch is belt-and-braces for any future mechanism.
      try {
        focusElement(originRef.current);
      } catch {
        // Focus restoration is a courtesy, never a failure path.
      }
    }
    wasOpenRef.current = anyTaskOpen;
  }, [anyTaskOpen]);

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
    /** The factual purpose/support line (state lives in the chip). */
    status: string;
    /** Data-backed completion. */
    completed: boolean;
    /** Explicit deferral/acknowledgement without data. */
    acknowledged: boolean;
    done: boolean;
    /** The trailing chip's truthful state word. */
    chip: string;
    onAdd: () => void;
    defer?: { label: string; onDefer: () => void };
  };

  function makeStep(
    base: Omit<Step, 'done' | 'chip'> & { chipCompleted?: string; chipAcknowledged?: string }
  ): Step {
    const { chipCompleted, chipAcknowledged, ...rest } = base;
    return {
      ...rest,
      done: base.completed || base.acknowledged,
      chip: base.completed ? chipCompleted ?? 'Added' : base.acknowledged ? chipAcknowledged ?? 'Later' : 'Add now',
    };
  }

  const steps: Step[] = [
    makeStep({
      key: 'income',
      icon: 'cash-outline',
      title: 'Add your income',
      status: unscheduledIncome
        ? `Finish setting up ${unscheduledIncome.label} — add its next expected payday.`
        : 'Places expected pay in your timeline.',
      completed: incomeComplete,
      acknowledged: !incomeComplete && !unscheduledIncome && !!data.user.confirmedNoIncome,
      chipAcknowledged: 'Noted',
      // Completion before creation: an existing unscheduled record opens
      // ITSELF in the canonical editor; only a genuinely absent income
      // opens the add workspace.
      onAdd: () => (unscheduledIncome ? setCompleteIncomeVisible(true) : setWorkspaceKind('income')),
      defer: unscheduledIncome ? undefined : { label: "I don't have income yet", onDefer: () => updateUser({ confirmedNoIncome: true }) },
    }),
    makeStep({
      key: 'everyday',
      icon: 'card-outline',
      title: 'Add an everyday account',
      status: 'Gives Available until payday a balance to work from.',
      completed: hasEveryday,
      acknowledged: !hasEveryday && !!data.user.confirmedEverydayLater,
      onAdd: () => setWorkspaceKind('everyday'),
      defer: { label: "I'll add an account later", onDefer: () => updateUser({ confirmedEverydayLater: true }) },
    }),
    makeStep({
      key: 'cash',
      icon: 'wallet-outline',
      title: 'Add your savings',
      status: 'Shows money you have set aside.',
      completed: hasSavings,
      acknowledged: !hasSavings && !!data.user.confirmedNoSavings,
      chipAcknowledged: 'Noted',
      onAdd: () => setWorkspaceKind('savings'),
      // Setup acknowledgement only — one flag write, no toast, no haptic,
      // no celebration; real Savings data later supersedes it for good.
      defer: { label: "I don't have savings yet", onDefer: () => updateUser({ confirmedNoSavings: true }) },
    }),
    makeStep({
      key: 'assets',
      icon: 'trending-up-outline',
      title: 'Add an asset',
      status: 'Adds vehicles, property or investments to your net worth.',
      completed: hasGenuineAsset,
      acknowledged: !hasGenuineAsset && !!data.user.confirmedCashOnly,
      chipAcknowledged: 'Noted',
      // Checklist context only — the canonical Vehicle preset ('car'),
      // changeable in the form's own type selector. The global "+" tray's
      // asset tiles are untouched.
      onAdd: () => setWorkspaceKind('vehicle'),
      defer: { label: "I don't have other assets yet", onDefer: () => updateUser({ confirmedCashOnly: true }) },
    }),
    makeStep({
      key: 'bills',
      icon: 'calendar-outline',
      title: 'Add essential bills',
      status: 'Keeps upcoming costs visible.',
      completed: hasBills,
      acknowledged: !hasBills && !!data.user.confirmedBillsLater,
      onAdd: () => setWorkspaceKind('bill'),
      defer: { label: "I'll add bills later", onDefer: () => updateUser({ confirmedBillsLater: true }) },
    }),
    makeStep({
      key: 'debt',
      icon: 'file-tray-full-outline',
      title: 'Tell us about any debt',
      status: 'Keeps what you owe visible.',
      completed: hasRealDebt,
      acknowledged: !hasRealDebt && !!data.user.confirmedNoDebt,
      chipAcknowledged: 'Debt-free',
      onAdd: () => setDebtCoachVisible(true),
      // The SAME shared no-debt authority the Debt Coach sheet uses — one
      // write, one feedback event, one celebration, never a second writer.
      defer: { label: "I don't have any debt", onDefer: () => confirmNoDebt({ updateUser, confirmSaveSuccess, celebrate }) },
    }),
    makeStep({
      key: 'goal',
      icon: 'flag-outline',
      title: 'Add a goal',
      status: 'Optional — track a target if useful.',
      completed: hasGoal,
      acknowledged: !hasGoal && !!data.user.confirmedGoalLater,
      onAdd: () => setGoalModalVisible(true),
      defer: { label: "I'll add a goal later", onDefer: () => updateUser({ confirmedGoalLater: true }) },
    }),
  ];

  const composition = composeSetupChecklist(
    steps.map((s) => ({ key: s.key as SetupStepComposition['key'], completed: s.completed, acknowledged: s.acknowledged }))
  );
  const nextSetupStep = resolveNextSetupStep(steps);
  const stepByKey = new Map(steps.map((s) => [s.key, s]));
  const expanded = composition.zeroProgress || viewAll;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        title: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginBottom: 2, flex: 1 },
        subtitle: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.sm },
        progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
        progressText: { ...typeStyle('meta', locale), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        progressBarWrap: { flex: 1 },
        // The one featured Continue CTA — Ocean gradient from the semantic
        // featured tokens (no raw colour), >=52pt target.
        continueButton: { marginBottom: spacing.sm, borderRadius: radius.control, overflow: 'hidden' },
        continueGradient: {
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
        },
        continueTextWrap: { flex: 1 },
        continueTitle: { ...typeStyle('body', locale), color: ON_FEATURED, fontWeight: '700' },
        continueNext: { ...typeStyle('meta', locale), color: ON_FEATURED, opacity: 0.85, marginTop: 1 },
        // Visual-rhythm correction — every step is ONE contained task group:
        // one shared list gap (the only exterior spacing authority), a
        // subtle hairline-bordered group surface (no shadow, no fill that
        // would sink the chips, no card-within-card weight), and the SAME
        // primary-row base geometry for all seven rows in both compact and
        // expanded states.
        taskList: { gap: spacing.sm },
        taskGroup: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radius.control,
          overflow: 'hidden',
        },
        // Base geometry sized for a title plus up to TWO supporting-copy
        // lines at standard text size, so groups whose copy wraps
        // differently keep one equal base height; larger Dynamic Type
        // still grows vertically (minHeight, never a fixed height).
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: 76,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        },
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
        chip: {
          borderRadius: radius.control,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderWidth: StyleSheet.hairlineWidth,
        },
        chipText: { ...typeStyle('meta', locale), fontWeight: '600' },
        chipAdd: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
        chipAddText: { color: colors.accentStrong },
        // Green ONLY for a genuinely completed/positive state.
        chipDone: { backgroundColor: semantic.successTint, borderColor: semantic.successBorder },
        chipDoneText: { color: semantic.success },
        chipLater: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
        chipLaterText: { color: colors.textSecondary },
        // The divider sits inside the same gapped list, so its spacing above
        // and below is exactly the one task-group gap — balanced, and never
        // attached to a preceding secondary option.
        divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
        dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
        dividerText: { ...typeStyle('meta', locale), color: colors.textMuted },
        viewAllButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 4 },
        viewAllText: { ...typeStyle('meta', locale), color: colors.accentStrong, fontWeight: '600' },
        // The attached secondary footer: a quiet divider off the primary
        // row, compact vertical padding, a full-width 44pt target, and the
        // label aligned with the task's text column (group padding + icon
        // tile + row gap). No floating margins — containment does the work.
        groupFooter: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          minHeight: 44,
          justifyContent: 'center',
          paddingVertical: spacing.xs,
          paddingLeft: spacing.md + 36 + spacing.sm,
          paddingRight: spacing.md,
        },
        deferText: { ...typeStyle('meta', locale), color: colors.textSecondary, fontWeight: '600' },
        completeBody: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.md },
      }),
    [colors, semantic, radius, spacing, locale]
  );

  if (data.user.moneyPictureChecklistDismissed) return null;

  // The calm completion state — everything is done or explicitly set
  // aside. The customer closes the card; nothing dismisses it for them.
  // (The existing lifecycle and retirement behaviour, unchanged.)
  if (composition.allResolved) {
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

  function renderChip(s: Step) {
    const style = s.completed ? styles.chipDone : s.acknowledged ? styles.chipLater : styles.chipAdd;
    const textStyle = s.completed ? styles.chipDoneText : s.acknowledged ? styles.chipLaterText : styles.chipAddText;
    return (
      <View style={[styles.chip, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.chipText, textStyle]}>{s.chip}</Text>
      </View>
    );
  }

  function renderRow(s: Step) {
    // ONE accessible action per row: the whole row is the button; the icon
    // tile, chip and chevron are decoration inside it. Completed rows stay
    // informational (disabled); acknowledged rows remain reopenable.
    const enabled = !s.completed;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => {
          originRef.current = rowNodeRefs.current[s.key] ?? null;
          s.onAdd();
        }}
        ref={(node: React.Component<unknown> | null) => {
          rowNodeRefs.current[s.key] = node;
        }}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        accessibilityLabel={`${s.title}. ${s.chip}. ${s.status}`}
        accessibilityHint={enabled ? 'Opens this setup step.' : undefined}
        testID={`checklist-${s.key}`}
      >
        <View
          style={[styles.iconTile, s.done ? styles.iconTileDone : null]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons
            name={s.completed ? 'checkmark' : s.acknowledged ? 'time-outline' : s.icon}
            size={18}
            color={s.done ? colors.accent : colors.accentStrong}
          />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, s.done ? styles.rowTitleDone : null]}>{s.title}</Text>
          <Text style={styles.rowStatus}>{s.status}</Text>
        </View>
        {renderChip(s)}
        {enabled ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
        ) : null}
      </TouchableOpacity>
    );
  }

  function renderFooter(s: Step) {
    // The attached secondary footer — a SIBLING Pressable to the primary
    // row inside the same contained task group, never nested inside it.
    // Only rendered while the alternative currently applies: resolving the
    // step (either way) removes the footer, and tasks without an
    // alternative get NO placeholder. It carries no chevron — it only
    // updates checklist state, never navigates — and its label names its
    // task context for VoiceOver.
    if (s.done || !s.defer) return null;
    return (
      <TouchableOpacity
        style={styles.groupFooter}
        onPress={s.defer.onDefer}
        accessibilityRole="button"
        accessibilityLabel={`${s.title}. ${s.defer.label}`}
        testID={`checklist-${s.key}-defer`}
      >
        <Text style={styles.deferText}>{s.defer.label}</Text>
      </TouchableOpacity>
    );
  }

  function renderGroup(s: Step) {
    // One visually contained task group per step: the primary row plus,
    // when applicable, its attached footer. The wrapper is a plain View —
    // never a Pressable around Pressables.
    return (
      <View key={s.key} style={styles.taskGroup} testID={`checklist-group-${s.key}`}>
        {renderRow(s)}
        {renderFooter(s)}
      </View>
    );
  }

  const compactSteps = composition.compactKeys.map((k) => stepByKey.get(k)!).filter(Boolean);
  const coreSteps = composition.coreKeys.map((k) => stepByKey.get(k)!).filter(Boolean);
  const laterSteps = composition.whenItAppliesKeys.map((k) => stepByKey.get(k)!).filter(Boolean);

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
          <ProgressBar progress={composition.progressRatio} accessibilityLabel={composition.progressLabel} />
        </View>
        <Text style={styles.progressText}>{composition.progressLabel}</Text>
      </View>
      {/* THE next action, resolved from structured step state — one obvious
          featured way forward, with the rows as direct secondary paths.
          Tapping it only OPENS the canonical task (writes nothing). */}
      {nextSetupStep ? (
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.continueButton}
          onPress={() => {
            originRef.current = continueNodeRef.current;
            nextSetupStep.onAdd();
          }}
          ref={continueNodeRef}
          accessibilityRole="button"
          accessibilityLabel={`Continue setup. Next: ${nextSetupStep.title}`}
          testID="checklist-continue"
        >
          <LinearGradient colors={[semantic.featured[0], semantic.featured[1]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.continueGradient}>
            <Ionicons name="sparkles" size={18} color={ON_FEATURED} accessibilityElementsHidden importantForAccessibility="no" />
            <View style={styles.continueTextWrap}>
              <Text style={styles.continueTitle}>Continue setup</Text>
              <Text style={styles.continueNext}>{`Next: ${nextSetupStep.title}`}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ON_FEATURED} accessibilityElementsHidden importantForAccessibility="no" />
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      {expanded ? (
        <View style={styles.taskList}>
          {coreSteps.map(renderGroup)}
          <View style={styles.divider} accessibilityElementsHidden={false}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Add when it applies</Text>
            <View style={styles.dividerLine} />
          </View>
          {laterSteps.map(renderGroup)}
        </View>
      ) : (
        <View style={styles.taskList}>
          {compactSteps.map(renderGroup)}
          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={() => setViewAll(true)}
            accessibilityRole="button"
            accessibilityLabel="View all setup steps"
            testID="checklist-view-all"
          >
            <Text style={styles.viewAllText}>View all setup steps</Text>
            <Ionicons name="chevron-down" size={14} color={colors.accentStrong} accessibilityElementsHidden importantForAccessibility="no" />
          </TouchableOpacity>
        </View>
      )}

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
