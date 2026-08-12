import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCurrentLocalDate } from '../../hooks/useCurrentLocalDate';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { InfoSheet } from '../../components/shared/InfoSheet';
import { AddIncomeModal } from '../../components/income/AddIncomeModal';
import { AddRecurringItemModal } from '../../components/money/AddRecurringItemModal';
import { AddWealthItemModal } from '../../components/wealth/AddWealthItemModal';
import { AddAnythingSheet } from '../../components/navigation/AddAnythingSheet';
import { SafeToSpendHero } from '../../components/money/SafeToSpendHero';
import { SelectBalancesSheet } from '../../components/money/SelectBalancesSheet';
import { SavingsAllocationDetailSheet } from '../../components/money/SavingsAllocationDetailSheet';
import { EditSavingsAllocationModal } from '../../components/wealth/EditSavingsAllocationModal';
import { MoneyPlanCard } from '../../components/money/MoneyPlanCard';
import { ThisMonthCard } from '../../components/money/ThisMonthCard';
import { computeCreditCardBalanceTotal } from '../../lib/calculations/creditHealth';
import { QuickAddModal } from '../../components/dashboard/QuickAddModal';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { GoalDetailSheet } from '../../components/goals/GoalDetailSheet';
import { AddCreditCardModal } from '../../components/credit/AddCreditCardModal';
import { computeMonthToDateActivity, computeThisMonthRecordedSummary } from '../../lib/calculations/monthlySummary';
import { computeSpendingInsights } from '../../lib/calculations/spendingInsights';
import { computeSafeToSpend } from '../../lib/calculations/safeToSpend';
import { deriveDisplayedWaterfall } from '../../lib/calculations/moneyWaterfall';
import { FlowPeriod, fromMonthlyAmount } from '../../lib/calculations/incomeEngine';
import { computeMoneyFlowCategoryBreakdown, MoneyFlowCategory } from '../../lib/calculations/moneyFlowBreakdown';
import { MoneyFlowCategoryDetailSheet } from '../../components/money/MoneyFlowCategoryDetailSheet';
import { computeMoneyHeroCopy } from '../../lib/calculations/moneyPersona';
import { computeMoneyTimeline, computeAttentionItems } from '../../lib/calculations/moneyTimeline';
import { MoneyTimelineCard } from '../../components/money/MoneyTimelineCard';
import { computeDebtCoachSummary, computeHasAnyDebt } from '../../lib/calculations/debtCoach';
import { DebtCoachSheet } from '../../components/debt/DebtCoachSheet';
import { tabScrollRefs } from '../../navigation/tabScrollRefs';
import { RecurringItem, LiabilityType } from '../../types/models';
import { brand } from '../../lib/brand';

const FLOW_PERIODS: { key: FlowPeriod; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'fortnightly', label: 'Fortnightly' },
  { key: 'monthly', label: 'Monthly' },
];

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

/**
 * Money — Navilo's financial command centre (PRD ask: "I know exactly what
 * is happening with my money over the next 30 days," not "another
 * budgeting app"). The emphasis is forward-looking: a "what happens next"
 * timeline is the centrepiece, with only the highest-priority items
 * surfaced up front, rather than a wall of equally-weighted cards about
 * what already happened. Every figure here reads from the same shared
 * engines (computeSafeToSpend, computeMoneyTimeline) used across Wealth,
 * Today, and Grow — this screen only changes how they're presented.
 */
export function MoneyScreen() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, spacing, typography, radius, cardShadow } = useTheme();
  // Pass 2A section-focused navigation targets — null (not 0) is the
  // "not yet measured" sentinel, distinguishing an unmeasured section from
  // one genuinely positioned at the very top of the scroll content.
  const aupSectionY = useRef<number | null>(null);
  const whatHappensNextSectionY = useRef<number | null>(null);
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [editIncome, setEditIncome] = useState<RecurringItem | null>(null);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [editBill, setEditBill] = useState<RecurringItem | null>(null);
  const [loanHandoff, setLoanHandoff] = useState<LiabilityType | null>(null);
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  // Opened by tapping a goal event in What Happens Next — reuses the one
  // shared GoalDetailSheet already mounted on Today/Goals, never a second
  // implementation (regression-protection review, Stream A §3/§4). Resolved
  // by stable goal id every render, so a deleted goal safely closes this
  // sheet rather than leaving it open on stale data.
  const [viewGoalId, setViewGoalId] = useState<string | null>(null);
  // Opened by tapping a credit_card event — same pattern, reusing the
  // existing card editor.
  const [viewCreditCardId, setViewCreditCardId] = useState<string | null>(null);
  // Opened by tapping a bnpl event — same pattern, reusing the same
  // liability editor WealthScreen already opens for a BNPL tile.
  const [viewBnplLiabilityId, setViewBnplLiabilityId] = useState<string | null>(null);
  const [flowPeriod, setFlowPeriod] = useState<FlowPeriod>('monthly');
  const [flowInfoVisible, setFlowInfoVisible] = useState(false);
  // Correction round, 2026-08-10 — which of Typical Money Flow's four
  // category rows currently has its shared read-only breakdown sheet open,
  // if any. Always uses the currently-selected flowPeriod — Typical
  // Monthly Allocation (MoneyPlanCard.tsx) owns its own separate instance
  // of the same shared MoneyFlowCategoryDetailSheet component, always at
  // 'monthly', so the two surfaces can never inherit each other's period.
  const [flowDetailCategory, setFlowDetailCategory] = useState<MoneyFlowCategory | null>(null);
  const [thisMonthInfoVisible, setThisMonthInfoVisible] = useState(false);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  const [selectBalancesVisible, setSelectBalancesVisible] = useState(false);
  // Select Balances correction (2026-08-08) — was a dedicated Cash-preset
  // AddWealthItemModal; now reuses the same general Add Anything chooser
  // the global + button opens (Everyday/Cash/Savings are all real tiles in
  // it already), rather than silently defaulting to Cash.
  const [addBalanceChooserVisible, setAddBalanceChooserVisible] = useState(false);
  const [savingsAllocationDetailVisible, setSavingsAllocationDetailVisible] = useState(false);
  const [savingsAllocationDetailDate, setSavingsAllocationDetailDate] = useState<Date | null>(null);
  const [editSavingsAllocationVisible, setEditSavingsAllocationVisible] = useState(false);

  // Round 6 correction — the single live local-date value this screen's
  // "Month to date" heading, month-to-date figures, and timeline relative-
  // day labels all derive from; see useCurrentLocalDate's own doc comment
  // for why a mount-frozen or data-change-only `new Date()` capture goes
  // stale across a midnight/month rollover with no new transaction to
  // trigger a recompute.
  const currentDate = useCurrentLocalDate();
  const safeToSpend = useMemo(() => computeSafeToSpend(data, currentDate), [data, currentDate]);
  const heroCopy = useMemo(() => computeMoneyHeroCopy(data), [data]);
  const hasActiveGoals = data.goals.some((g) => g.status === 'active');
  // Starts at the same 30-day planning horizon as before; growing this as
  // the user scrolls near the bottom of the (now fixed-height) timeline box
  // is what lets recurring events keep appearing further out instead of the
  // list just stopping (PRD ask, §2). Capped well short of the simulation's
  // own 400-iteration ceiling in recurringSchedule.ts.
  const [timelineHorizonDays, setTimelineHorizonDays] = useState(30);
  const timelineEvents = useMemo(() => computeMoneyTimeline(data, currentDate, timelineHorizonDays), [data, currentDate, timelineHorizonDays]);
  const extendTimelineHorizon = useCallback(() => {
    setTimelineHorizonDays((days) => Math.min(180, days + 30));
  }, []);
  // Pass 1 final closure correction, 2026-08-11: computeAttentionItems
  // itself lives in moneyTimeline.ts, a Pass 0 file preserved byte-for-byte
  // this pass — the fix is applied here, at the call site, instead. Only a
  // genuinely trustworthy pool is passed through; when the calculation is
  // unavailable (an invalid participating balance or other invalid
  // financial input) or there's no eligible balance at all, 0 is passed
  // instead of the real (possibly negative, always at least partly
  // placeholder) cycleRemainingPool — computeAttentionItems' only rule is
  // `remainingPool < 0`, so this guarantees it can never fire a false
  // "Recorded spending is currently ahead of the estimated plan" warning
  // from data that was excluded, corrupted, or never recorded. A real bug
  // this closes: an invalid balance mixed with a valid one previously could
  // leave cycleRemainingPool genuinely negative (bills exceeding only the
  // valid-only sum) while moneyBalanceStatus was already invalid_data —
  // this call site could not previously tell the two situations apart.
  const attentionPool =
    safeToSpend.availability === 'available' && safeToSpend.moneyBalanceStatus === 'valid' ? safeToSpend.cycleRemainingPool : 0;
  const attentionItems = useMemo(() => computeAttentionItems(timelineEvents, attentionPool), [timelineEvents, attentionPool]);
  const insights = useMemo(() => computeSpendingInsights(data), [data]);
  const hasTransactions = data.transactions.length > 0;
  const hasDebt = computeHasAnyDebt(data);
  const debtSummary = useMemo(() => computeDebtCoachSummary(data), [data]);
  // Spending Tracker's actual-activity summary — calendar-month-to-date
  // recorded transactions only, the same source "July so far" reads, never
  // a recurring rate (PRD ask, Decision 2: Typical Money Flow and Spending
  // Tracker must never share a basis).
  const monthToDateActivity = useMemo(() => computeMonthToDateActivity(data, currentDate), [data, currentDate]);
  // This Month's own exact-cent, per-source-attributed sibling result (This
  // Month round, 2026-08-10) — computeMonthToDateActivity above is
  // untouched and still the one Spending Tracker's bars (below) read.
  const thisMonthSummary = useMemo(() => computeThisMonthRecordedSummary(data, currentDate), [data, currentDate]);
  const thisMonthStart = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), [currentDate]);
  // A present-liability snapshot, never treated as this month's spending —
  // deliberately not part of computeMonthToDateActivity, which stays scoped
  // to actual recorded transaction activity only (PRD ask, Finding #40:
  // balance movement can include prior-month activity, repayments, refunds,
  // interest and fees, none of which are "what I spent this month").
  const currentCreditCardBalance = useMemo(() => computeCreditCardBalanceTotal(data.creditCards), [data.creditCards]);
  // Resolved live by stable id every render — a goal/card deleted elsewhere
  // simply resolves to null next render, closing GoalDetailSheet/
  // AddCreditCardModal safely rather than leaving stale data open
  // (regression-protection review, Stream A §3).
  const viewGoal = viewGoalId ? data.goals.find((g) => g.id === viewGoalId) ?? null : null;
  const viewCreditCard = viewCreditCardId ? data.creditCards.find((c) => c.id === viewCreditCardId) ?? null : null;
  const viewBnplLiability = viewBnplLiabilityId ? data.liabilities.find((l) => l.id === viewBnplLiabilityId) ?? null : null;
  const categoryMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const recentTransactions = useMemo(
    () => [...data.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3),
    [data.transactions]
  );

  // Pass 2A section-focused navigation — supports layout-not-ready (a
  // section's onLayout may not have fired yet on the very first frame after
  // a tab switch, so this retries across a few animation frames rather than
  // giving up immediately), repeated identical focus requests (achieved by
  // always clearing scrollTo via setParams once handled, so navigating to
  // the same target again is a genuine undefined→value transition next
  // time), and an empty-state fallback (if a section's ref is still
  // unmeasured after the retry budget — e.g. it never mounted — this clears
  // the param and leaves the screen exactly where existing tab/Back
  // behaviour already puts it, rather than leaving a stale request queued
  // or crashing on a null offset).
  useEffect(() => {
    const target = route.params?.scrollTo;
    if (target !== 'aup' && target !== 'timeline') return;
    const targetRef = target === 'aup' ? aupSectionY : whatHappensNextSectionY;
    let cancelled = false;
    let frameId: number | null = null;
    function attempt(retriesLeft: number) {
      if (cancelled) return;
      if (targetRef.current !== null) {
        tabScrollRefs.Money.current?.scrollTo({ y: targetRef.current, animated: true });
        navigation.setParams({ scrollTo: undefined });
      } else if (retriesLeft > 0) {
        frameId = requestAnimationFrame(() => attempt(retriesLeft - 1));
      } else {
        navigation.setParams({ scrollTo: undefined });
      }
    }
    attempt(30);
    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [route.params?.scrollTo, navigation]);

  function openAddBill() {
    setEditBill(null);
    setBillModalVisible(true);
  }

  function closeBillModal() {
    setBillModalVisible(false);
    setEditBill(null);
  }

  function handleTimelineEventPress(event: { kind: string; id: string; date: Date; recurringItemId?: string; goalId?: string; creditCardId?: string; bnplLiabilityId?: string }) {
    // A Savings Allocation row is a display of the one shared user-level
    // setting on a given cycle date, not an independently editable
    // transaction (PRD ask) — handled before the recurringItemId guard
    // below, since these events never have one.
    if (event.kind === 'savings') {
      setSavingsAllocationDetailDate(event.date);
      setSavingsAllocationDetailVisible(true);
      return;
    }
    // Goal and credit_card events resolve through their own stable id, not
    // recurringItemId (regression-protection review, Stream A §4) — a
    // deleted goal/card simply fails to resolve below and nothing opens,
    // rather than opening stale data.
    if (event.kind === 'goal') {
      if (event.goalId) setViewGoalId(event.goalId);
      return;
    }
    if (event.kind === 'credit_card') {
      if (event.creditCardId) setViewCreditCardId(event.creditCardId);
      return;
    }
    // BNPL events resolve through their own stable liability id, same as
    // goal/credit_card above — opens the same liability editor WealthScreen
    // already opens for a BNPL tile, rather than a new flow.
    if (event.kind === 'bnpl') {
      if (event.bnplLiabilityId) setViewBnplLiabilityId(event.bnplLiabilityId);
      return;
    }
    // Matched by recurringItemId, not the event id — the timeline now
    // repeats a recurring item across every occurrence in the horizon
    // (PRD ask, §2), so its id includes a per-occurrence date and can't be
    // reverse-matched to the source item by string equality any more.
    if (!event.recurringItemId) return;
    if (event.kind === 'bill' || event.kind === 'mortgage') {
      const item = data.recurringItems.find((r) => r.id === event.recurringItemId);
      if (item) {
        setEditBill(item);
        setBillModalVisible(true);
      }
    } else if (event.kind === 'income') {
      // Income events behave the same as bills (PRD ask, §4) — tapping one
      // opens that specific source's editor, not the generic "add income" flow.
      const item = data.recurringItems.find((r) => r.id === event.recurringItemId);
      if (item) {
        setEditIncome(item);
        setIncomeModalVisible(true);
      }
    }
  }

  // Typical Money Flow — a pure recurring-rate planning surface (PRD ask,
  // Decision 1): every row here is `fromMonthlyAmount` of a normalized
  // recurring figure off `safeToSpend`, nothing else. Deliberately never
  // includes ad-hoc income, recorded transactions, spendSoFarThisCycle, or
  // any calendar-month/pay-cycle-to-date activity — those genuinely belong
  // to a different time basis and blending them in produced a figure that
  // was neither a real "typical month" nor a real "this calendar month"
  // (PRD bug report: a recurring salary due next month still showed as
  // "this month's income," and separately, spendSoFarThisCycle — a
  // pay-cycle-to-date actual, not a rate — was being fed through
  // `fromMonthlyAmount`'s rate-scaling division, shrinking a real cumulative
  // number as if it were a steady weekly/fortnightly rate). Actual income
  // and spending remain fully visible via Spending Tracker below.
  const periodAdjective = FLOW_PERIODS.find((p) => p.key === flowPeriod)!.label.toLowerCase();
  const typicalIncome = fromMonthlyAmount(data.user.monthlyIncome, flowPeriod);
  // Includes bnplMonthlyExpected — the current-calendar-month capped BNPL
  // total (never an indefinite monthly-normalised rate; drops to $0 once a
  // plan is paid off) — so this "typical" row never overstates a finite
  // BNPL commitment beyond what's genuinely still owed.
  const typicalBills = fromMonthlyAmount(safeToSpend.fixedExpensesMonthly + safeToSpend.bnplMonthlyExpected, flowPeriod);
  // Correction round, 2026-08-10 — Savings and Goals are now two
  // independent rows (previously one merged "savings and goals" row) so
  // each can carry its own tappable, itemised drill-down — matching
  // Typical Monthly Allocation's own already-separate Savings/Goals rows
  // exactly, rather than the other way around.
  const typicalSavings = fromMonthlyAmount(safeToSpend.savingsAllocationMonthly, flowPeriod);
  const typicalGoals = fromMonthlyAmount(safeToSpend.goalContributionsMonthly, flowPeriod);
  // Signed recurring net, derived as a rounded-dollar "balancing plug" —
  // displayed(income) - displayed(bills) - displayed(savings) -
  // displayed(goals) — rather than independently rounding the raw net.
  // Independently rounding every row can disagree by $1 (verified: ~21% of
  // weekly/fortnightly conversions swept across a realistic income/bills/
  // savings range produce a mismatch, since separately-rounded numbers
  // don't generally sum to a separately-rounded total). This guarantees the
  // numbers actually on screen always reconcile exactly, matching the
  // standard "balancing plug" convention finance UIs use for this exact
  // class of rounding problem. discretionaryPool itself stays floored,
  // unchanged, for callers that need a non-negative allowance (Lulu Score,
  // the hero's cycle math) — this is a presentation-only derivation for
  // Typical Money Flow and Typical Monthly Allocation specifically. Shared
  // with Typical Monthly Allocation via deriveDisplayedWaterfall so the two
  // cards can't drift onto different rounding behaviour.
  const {
    displayedIncome: displayedTypicalIncome,
    displayedDeductions: [displayedTypicalBills, displayedTypicalSavings, displayedTypicalGoals],
    displayedNet: displayedTypicalNet,
  } = deriveDisplayedWaterfall(typicalIncome, [typicalBills, typicalSavings, typicalGoals]);
  // Every category row is now independently tappable, opening the one
  // shared read-only MoneyFlowCategoryDetailSheet — Unallocated/Remainder
  // stays non-interactive, out of this round's drill-down scope.
  const flowRows: { key: MoneyFlowCategory; label: string; value: number; color: string }[] = [
    { key: 'income', label: `Typical ${periodAdjective} income`, value: displayedTypicalIncome, color: colors.accent },
    { key: 'bills', label: `Typical ${periodAdjective} bills`, value: displayedTypicalBills, color: colors.navy },
    { key: 'savings', label: `Typical ${periodAdjective} savings`, value: displayedTypicalSavings, color: colors.aiBlue },
    { key: 'goals', label: `Typical ${periodAdjective} goals`, value: displayedTypicalGoals, color: colors.purple },
  ];
  const remainderRow = {
    label: displayedTypicalNet >= 0 ? `Typical ${periodAdjective} remainder` : `Typical ${periodAdjective} shortfall`,
    value: Math.abs(displayedTypicalNet),
    color: displayedTypicalNet >= 0 ? colors.successBright : colors.warning,
  };

  const flowDetailBreakdown = useMemo(
    () => (flowDetailCategory ? computeMoneyFlowCategoryBreakdown(data, flowDetailCategory, flowPeriod, currentDate) : null),
    [flowDetailCategory, data, flowPeriod, currentDate]
  );

  const CATEGORY_LABELS: Record<MoneyFlowCategory, string> = { income: 'Income', bills: 'Bills', savings: 'Savings', goals: 'Goals' };
  const PERIOD_LABELS: Record<FlowPeriod, string> = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly' };

  // Zero-state copy/CTA per category — distinguishes "not configured" from
  // "configured but currently zero" from "records exist but are inactive"
  // (PRD ask: never say "not set up" merely because the current calculated
  // contribution rounds to zero). Reuses the exact existing Add/Manage
  // journeys already mounted on this screen — never a duplicated form.
  function flowDetailEmptyState(): { text: string; ctaLabel: string | null; onCta: (() => void) | null } {
    if (!flowDetailCategory || !flowDetailBreakdown) return { text: '', ctaLabel: null, onCta: null };
    const state = flowDetailBreakdown.configurationState;
    switch (flowDetailCategory) {
      case 'income':
        return state === 'not_configured'
          ? { text: 'No regular income is set up yet.', ctaLabel: 'Add income', onCta: () => { setEditIncome(null); setIncomeModalVisible(true); } }
          : {
              text:
                state === 'inactive_or_excluded'
                  ? 'Your income sources are currently inactive.'
                  : "Your income is currently $0 once rounded — it's still set up.",
              ctaLabel: 'Manage income',
              onCta: () => { setEditIncome(null); setIncomeModalVisible(true); },
            };
      case 'bills':
        return state === 'not_configured'
          ? { text: 'No regular bills are set up yet.', ctaLabel: 'Add bill', onCta: openAddBill }
          : {
              text:
                state === 'inactive_or_excluded'
                  ? 'Your bills are currently inactive.'
                  : "Your bills are currently $0 once rounded — they're still set up.",
              ctaLabel: 'Manage bills',
              onCta: openAddBill,
            };
      case 'savings':
        return state === 'not_configured'
          ? { text: 'No savings allocation is set up yet.', ctaLabel: 'Set up savings allocation', onCta: () => setEditSavingsAllocationVisible(true) }
          : {
              text: "Your savings allocation is currently $0 because there's no regular income to calculate it from.",
              ctaLabel: 'Manage savings allocation',
              onCta: () => setEditSavingsAllocationVisible(true),
            };
      case 'goals':
        return state === 'not_configured'
          ? { text: 'No goals are set up yet.', ctaLabel: 'Add goal', onCta: () => setGoalModalVisible(true) }
          : {
              text:
                state === 'inactive_or_excluded'
                  ? 'You have goals set up, but none are currently active.'
                  : 'You have goals set up, but nothing is currently allocated to them each month.',
              ctaLabel: 'View goals',
              onCta: () => navigation.navigate('Goals'),
            };
    }
  }
  const flowDetailEmpty = flowDetailEmptyState();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        link: { ...typography.micro, color: colors.accent, fontWeight: '700' },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
        flowInfoText: { ...typography.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },

        // Money Flow period toggle
        periodToggleRow: {
          flexDirection: 'row',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.pill,
          padding: 3,
          marginBottom: spacing.md,
        },
        periodToggleOption: { flex: 1, paddingVertical: 7, borderRadius: radius.pill, alignItems: 'center' },
        periodToggleOptionActive: { backgroundColor: colors.accent },
        periodToggleText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '700' },
        periodToggleTextActive: { color: colors.onAccent },

        // Money Flow bars
        barBlock: { marginBottom: spacing.md, minHeight: 24, justifyContent: 'center' },
        barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
        barLabelWithChevron: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        barLabel: { ...typography.body, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
        barValue: { ...typography.heading, fontSize: 14, color: colors.textPrimary },

        // Needs Your Attention
        attentionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        attentionIconBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
        attentionText: { ...typography.body, fontSize: 13, color: colors.textPrimary, flex: 1 },

        // End of Month Outlook
        outlookBox: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.md,
        },
        outlookLabel: { ...typography.micro, fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: spacing.xs },
        outlookValue: { ...typography.title, fontSize: 24, color: colors.textPrimary, marginBottom: spacing.xs },
        outlookExplainer: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

        // Spending Tracker insight cards
        insightCard: {
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: spacing.md,
          marginBottom: spacing.sm,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          ...cardShadow,
        },
        insightIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.marketSoft, alignItems: 'center', justifyContent: 'center' },
        insightTextBlock: { flex: 1 },
        insightHeading: { ...typography.caption, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
        insightBody: { ...typography.micro, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
        trackerFooterRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: spacing.sm,
          marginTop: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        flowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },

        // Spending Tracker actual-activity summary + recent transactions
        trackerRecentHeading: { ...typography.micro, fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: spacing.md, marginBottom: spacing.xs },
        trackerTxnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
        trackerTxnLeft: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flex: 1 },
        trackerTxnLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
        trackerTxnDate: { ...typography.micro, fontSize: 11, color: colors.textMuted },
        trackerTxnAmount: { ...typography.heading, fontSize: 14 },

        // Debt Overview
        debtTotalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
        debtTotalsLabel: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginBottom: 2 },
        debtTotalsValue: { ...typography.heading, fontSize: 18, color: colors.textPrimary },
        debtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
        debtTextBlock: { flex: 1 },
        debtLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
        debtSub: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 1 },
      }),
    [colors, spacing, typography, radius, cardShadow]
  );

  return (
    <Screen title="Money" scrollRef={tabScrollRefs.Money}>
      <View onLayout={(e) => (aupSectionY.current = e.nativeEvent.layout.y)}>
        <SafeToSpendHero
          safeToSpend={safeToSpend}
          hasActiveGoals={hasActiveGoals}
          onCreateGoal={() => setGoalModalVisible(true)}
          onAddPayday={() => {
            setEditIncome(null);
            setIncomeModalVisible(true);
          }}
          onSelectBalances={() => setSelectBalancesVisible(true)}
          onReviewInWealth={() => navigation.navigate('Wealth')}
          heroCopy={heroCopy}
        />
      </View>

      {/* This Month — a factual, calendar-month recorded-activity summary
          (PRD ask, Finding #40) placed directly under the hero so credit-
          card-heavy users see recorded activity right away, without
          altering what Available Until Payday itself means. */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>This Month</Text>
        <TouchableOpacity onPress={() => setThisMonthInfoVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <ThisMonthCard
        summary={thisMonthSummary}
        creditCardBalance={currentCreditCardBalance}
        hasCreditCards={data.creditCards.length > 0}
        creditCardCount={data.creditCards.length}
        monthStart={thisMonthStart}
        today={currentDate}
        onViewTransactions={() => navigation.navigate('Transactions')}
        onAddTransaction={() => setTransactionModalVisible(true)}
      />

      {attentionItems.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs your attention</Text>
          </View>
          {attentionItems.map((item) => (
            <View key={item.id} style={styles.attentionRow}>
              <View style={[styles.attentionIconBadge, { backgroundColor: item.tone === 'warning' ? colors.warningSoft : colors.surfaceMuted }]}>
                <Ionicons name={item.icon} size={15} color={item.tone === 'warning' ? colors.warning : colors.textSecondary} />
              </View>
              <Text style={styles.attentionText}>{item.title}</Text>
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.sectionHeader} onLayout={(e) => (whatHappensNextSectionY.current = e.nativeEvent.layout.y)}>
        <Text style={styles.sectionTitle}>What happens next</Text>
        <TouchableOpacity onPress={openAddBill} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.link}>+ Add bill</Text>
        </TouchableOpacity>
      </View>
      {timelineEvents.length === 0 ? (
        <SectionCard>
          <MoneyTimelineCard events={timelineEvents} />
        </SectionCard>
      ) : (
        <SectionCard>
          <MoneyTimelineCard events={timelineEvents} onEventPress={handleTimelineEventPress} onNearEnd={extendTimelineHorizon} />
        </SectionCard>
      )}

      {/* Spending Tracker — add, review, and understand actual recorded
          activity in one place (PRD ask: users care about the outcome, not
          data entry; the whole card is one tap target to Transaction
          History, with no nested touchables, so "review everything" and
          "see this one row" never fight for the same tap). Comes right
          after the timeline: "what's happening" then "what's actually
          happened," before Typical Money Flow below, which deliberately
          shows a different, recurring-only basis (PRD ask, Decision 2: real
          activity must stay clearly visible once Typical Money Flow stops
          showing it). */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spending Tracker</Text>
        <TouchableOpacity onPress={() => setTransactionModalVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.link}>+ Add</Text>
        </TouchableOpacity>
      </View>
      {!hasTransactions ? (
        <SectionCard>
          <Text style={styles.emptyText}>Add a transaction and it will show up here right away.</Text>
        </SectionCard>
      ) : (
        <>
          <SectionCard>
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Transactions')}>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>Spent this month</Text>
                <Text style={styles.barValue}>{formatMoney(monthToDateActivity.spend)}</Text>
              </View>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>Income recorded this month</Text>
                <Text style={styles.barValue}>{formatMoney(monthToDateActivity.income)}</Text>
              </View>

              <Text style={styles.trackerRecentHeading}>Recent transactions</Text>
              {recentTransactions.length === 0 ? (
                <Text style={styles.emptyText}>No transactions recorded yet.</Text>
              ) : (
                recentTransactions.map((t) => {
                  const category = categoryMap.get(t.categoryId);
                  return (
                    <View key={t.id} style={styles.trackerTxnRow}>
                      <View style={styles.trackerTxnLeft}>
                        <Text style={styles.trackerTxnLabel}>{category?.name ?? (t.type === 'income' ? 'Income' : 'Other')}</Text>
                        <Text style={styles.trackerTxnDate}>
                          {new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <Text style={[styles.trackerTxnAmount, { color: t.type === 'income' ? colors.success : colors.danger }]}>
                        {formatMoney(t.type === 'income' ? t.amount : -t.amount)}
                      </Text>
                    </View>
                  );
                })
              )}

              <View style={styles.trackerFooterRow}>
                <Text style={[styles.flowLabel, { color: colors.accent, fontWeight: '700' }]}>View all transactions</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.accent} />
              </View>
            </TouchableOpacity>
          </SectionCard>

          {insights.map((insight) => (
            <View key={insight.title} style={styles.insightCard}>
              <View style={styles.insightIconBadge}>
                <Ionicons name={insight.icon} size={15} color={colors.market} />
              </View>
              <View style={styles.insightTextBlock}>
                <Text style={styles.insightHeading}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Typical Money Flow</Text>
        <TouchableOpacity onPress={() => setFlowInfoVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <SectionCard>
        <View style={styles.periodToggleRow}>
          {FLOW_PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodToggleOption, flowPeriod === p.key ? styles.periodToggleOptionActive : null]}
              onPress={() => setFlowPeriod(p.key)}
            >
              <Text style={[styles.periodToggleText, flowPeriod === p.key ? styles.periodToggleTextActive : null]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {flowRows.map((row) => (
          <TouchableOpacity
            key={row.key}
            style={styles.barBlock}
            activeOpacity={0.7}
            onPress={() => setFlowDetailCategory(row.key)}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}, ${formatMoney(row.value)}`}
            accessibilityHint="Opens a breakdown of what makes up this amount"
          >
            <View style={styles.barLabelRow}>
              <View style={styles.barLabelWithChevron}>
                <Text style={styles.barLabel}>{row.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </View>
              <Text style={styles.barValue}>{formatMoney(row.value)}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <View style={styles.barBlock}>
          <View style={styles.barLabelRow}>
            <Text style={styles.barLabel}>{remainderRow.label}</Text>
            <Text style={styles.barValue}>{formatMoney(remainderRow.value)}</Text>
          </View>
        </View>
      </SectionCard>

      <MoneyFlowCategoryDetailSheet
        visible={flowDetailCategory !== null}
        onClose={() => setFlowDetailCategory(null)}
        categoryLabel={flowDetailCategory ? CATEGORY_LABELS[flowDetailCategory] : ''}
        periodLabel={PERIOD_LABELS[flowPeriod]}
        totalCents={flowDetailBreakdown?.totalCents ?? 0}
        items={flowDetailBreakdown?.items ?? []}
        emptyStateText={flowDetailEmpty.text || null}
        ctaLabel={flowDetailEmpty.ctaLabel}
        onCta={flowDetailEmpty.onCta}
      />

      {data.user.monthlyIncome > 0 ? (
        <MoneyPlanCard
          onAddIncome={() => {
            setEditIncome(null);
            setIncomeModalVisible(true);
          }}
          onAddBill={openAddBill}
          onAddGoal={() => setGoalModalVisible(true)}
          onManageSavingsAllocation={() => setEditSavingsAllocationVisible(true)}
        />
      ) : null}

      {/* End of Month Outlook is temporarily hidden (PRD ask, Decision 4) —
          the old calculation was not a genuine calendar-month forecast (no
          opening included balance, no calendar-date filtering, mixed a
          recurring rate with pay-cycle-to-date spend and calendar-month
          ad-hoc income from three different time windows). Its screen-local
          computations have been removed rather than kept dead (PRD ask); the
          reusable engine functions it read from (computeMonthlySummary,
          computeAdHocIncome, safeToSpend.remainingPool) are untouched and
          still exported from their own files for the future calendar-
          accurate rebuild (see backlog: "Rebuild calendar-accurate End of
          Month Outlook after recurring-transaction reconciliation"). */}

      {hasDebt ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Debt Overview</Text>
          </View>
          <SectionCard>
            <View style={styles.debtTotalsRow}>
              <View>
                <Text style={styles.debtTotalsLabel}>Total debt</Text>
                <Text style={styles.debtTotalsValue}>{formatMoney(debtSummary.totalDebt)}</Text>
              </View>
              <View>
                <Text style={styles.debtTotalsLabel}>Monthly repayments</Text>
                <Text style={styles.debtTotalsValue}>{formatMoney(debtSummary.totalMonthlyRepayment)}</Text>
              </View>
            </View>
            {debtSummary.debts.map((d) => (
              <View key={d.id} style={styles.debtRow}>
                <Ionicons name={d.icon} size={16} color={colors.textSecondary} />
                <View style={styles.debtTextBlock}>
                  <Text style={styles.debtLabel}>{d.label}</Text>
                  <Text style={styles.debtSub}>
                    {formatMoney(d.balance)} remaining
                    {d.monthlyRepayment ? ` · ${formatMoney(d.monthlyRepayment)}/month` : ''}
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.trackerFooterRow} onPress={() => setDebtCoachVisible(true)} activeOpacity={0.7}>
              <Text style={styles.flowLabel}>View full debt overview</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          </SectionCard>
        </>
      ) : null}

      <AddIncomeModal
        visible={incomeModalVisible}
        editItem={editIncome}
        onClose={() => {
          setIncomeModalVisible(false);
          setEditIncome(null);
        }}
      />
      <AddRecurringItemModal
        visible={billModalVisible}
        editItem={editBill}
        onClose={closeBillModal}
        onSelectLoan={(type) => setLoanHandoff(type)}
      />
      <AddWealthItemModal
        visible={loanHandoff !== null}
        kind="liability"
        presetLiabilityType={loanHandoff ?? undefined}
        liabilityFlowIntent="select_or_create_for_repayment"
        onClose={() => setLoanHandoff(null)}
      />
      <SelectBalancesSheet
        visible={selectBalancesVisible}
        onClose={() => setSelectBalancesVisible(false)}
        onAddBalance={() => setAddBalanceChooserVisible(true)}
      />
      {/* Correction round, 2026-08-10 — scoped to cash/savings/everyday
          only (requirement 5), and returns to Select Balances on EITHER
          outcome (Back/Cancel or a successful save) rather than dropping
          the user back on the bare Money screen — onClose is undifferentiated
          by design (see AddAnythingSheet's own doc comment), so re-opening
          Select Balances unconditionally here is correct for both cases:
          "Back returns to Select Balances" and "a created balance returns
          to Select Balances and is visible immediately" are the same event
          from this screen's point of view. */}
      <AddAnythingSheet
        visible={addBalanceChooserVisible}
        onClose={() => {
          setAddBalanceChooserVisible(false);
          setSelectBalancesVisible(true);
        }}
        onlyBalances
      />
      <SavingsAllocationDetailSheet
        visible={savingsAllocationDetailVisible}
        onClose={() => setSavingsAllocationDetailVisible(false)}
        occurrenceDate={savingsAllocationDetailDate}
        onEditAllocation={() => setEditSavingsAllocationVisible(true)}
      />
      <EditSavingsAllocationModal visible={editSavingsAllocationVisible} onClose={() => setEditSavingsAllocationVisible(false)} />
      <GoalDetailSheet goal={viewGoal} onClose={() => setViewGoalId(null)} />
      <AddCreditCardModal visible={!!viewCreditCard} editCard={viewCreditCard} onClose={() => setViewCreditCardId(null)} />
      <AddWealthItemModal
        visible={!!viewBnplLiability}
        kind="liability"
        editLiability={viewBnplLiability}
        onClose={() => setViewBnplLiabilityId(null)}
      />
      <QuickAddModal visible={transactionModalVisible} onClose={() => setTransactionModalVisible(false)} />
      <AddGoalModal visible={goalModalVisible} onClose={() => setGoalModalVisible(false)} />
      <InfoSheet visible={flowInfoVisible} onClose={() => setFlowInfoVisible(false)} title="About Typical Money Flow">
        <Text style={styles.flowInfoText}>
          This view shows your typical recurring income, bills, savings and goals for the selected period — not what's actually happened
          this month.
        </Text>
        <Text style={styles.flowInfoText}>
          For real recorded activity — what you've actually earned and spent — see Spending Tracker and Transaction History below.
        </Text>
      </InfoSheet>
      <InfoSheet visible={thisMonthInfoVisible} onClose={() => setThisMonthInfoVisible(false)} title="About This Month">
        <Text style={styles.flowInfoText}>
          Income recorded and Spending recorded use transactions saved in Navilo from the start of the current calendar month through
          today. Future-dated transactions and Move Money transfers between your own balances are excluded.
        </Text>
        <Text style={styles.flowInfoText}>Net recorded is Income recorded minus Spending recorded.</Text>
        <Text style={styles.flowInfoText}>
          The funding breakdown uses the source recorded with each expense. An expense recorded without changing a tracked balance
          still counts.
        </Text>
        <Text style={styles.flowInfoText}>
          Current credit-card balance is a snapshot of the balance recorded in Navilo right now. It is separate from month-to-date
          spending.
        </Text>
        <Text style={styles.flowInfoText}>These figures reflect only what is recorded in Navilo.</Text>
      </InfoSheet>
      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
    </Screen>
  );
}
