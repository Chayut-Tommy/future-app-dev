import { AppData, CreditCard, LiabilityType, RecurringItem } from '../../types/models';
import {
  computeCreditCardDuePresentation,
  computeCreditCardInterestEstimateForCard,
  creditCardDuePresentationCopy,
  CreditCardDuePresentation,
  daysUntilDue,
  isValidExpectedRepayment,
} from './creditHealth';
import { advanceOneOccurrence } from './recurringSchedule';
import { resolveBnplLinkedItems } from './bnpl';
import { brand } from '../brand';

/**
 * Final Pass 2D device-test correction, §6 canonical-occurrence-helper
 * round — the SINGLE source of truth for "has THIS SPECIFIC due occurrence
 * of this card already been marked handled via a Reminder-initiated
 * repayment". Previously duplicated independently in this file's own
 * cardDue branch (below) and in moneyTimeline.ts's credit-card event loop —
 * both compared `card.handledReminderOccurrenceDate` against the exact same
 * date-key format (`toISOString().slice(0, 10)`) but as two separately
 * written expressions, which this round's own instruction explicitly
 * forbids ("Do not maintain separate, duplicated date-comparison logic").
 * Both the Reminder selector (computeTopReminder's cardDue branch) and the
 * independent Briefing/timeline event generator (moneyTimeline.ts) now call
 * this one function — see moneyTimeline.ts's own call site for the mirrored
 * usage. Scoped to the exact date-key only: a different due date (a
 * different month's genuinely new occurrence) is never suppressed by this
 * check, since its own computed date-key will differ.
 */
export function isCardOccurrenceHandled(card: CreditCard, occurrenceDate: Date): boolean {
  return card.handledReminderOccurrenceDate === occurrenceDate.toISOString().slice(0, 10);
}

export type SmartReminderKind = 'salary_check' | 'bill_overdue' | 'bill_due_soon' | 'card_due_soon' | 'bnpl_repayment_due' | 'loan_repayment_due';

export interface SmartReminder {
  id: string;
  kind: SmartReminderKind;
  title: string;
  body: string;
  recurringItemId?: string;
  amount?: number;
  creditCardId?: string;
  /** Present only for kind === 'bnpl_repayment_due' — the linked BNPL
   * liability confirmBnplRepayment needs alongside recurringItemId. */
  liabilityId?: string;
  /** Final Pass 2D device-test correction — the exact liability type when
   * `kind === 'loan_repayment_due'`, so SmartReminderCard.tsx can label the
   * dedicated repayment sheet correctly (Mortgage / Car loan / Personal
   * loan / Other loan) without a second lookup. Absent for every other
   * kind. */
  liabilityType?: LiabilityType;
  /** Pass 2A correction — the ISO date string of the specific occurrence
   * this reminder is about (the same `nextDueDate`/computed due-date value
   * already used to build this reminder's own composite `id` below, now
   * also exposed as its own field). Never parsed back out of `id`. This is
   * what lets a consumer (the Today Briefing's dedup logic) tell apart two
   * different occurrences of the SAME recurring source — e.g. an overdue
   * Rent reminder for last week must not suppress a future Rent event two
   * cycles from now, only the one specific occurrence it's actually about. */
  occurrenceDate?: string;
  /** Reminder/credit-card wording correction round — the exact day-count
   * presentation this card_due_soon reminder was built from, computed once
   * here (where `today` is already in scope) and read (never recomputed) by
   * briefingTiles.ts's own reminder tile, so the tile and this reminder's
   * own title/body can never disagree about the day count. Absent for every
   * other kind. See creditHealth.ts's computeCreditCardDuePresentation. */
  creditCardDue?: CreditCardDuePresentation;
}

/** Every recurring-item id currently linked (as the single active schedule)
 * to a BNPL liability — used to EXCLUDE those items from the ordinary bill
 * reminder checks below (which would otherwise show the wrong, uncapped
 * amount and, if confirmed, run the ordinary confirmation transition that
 * never reduces a liability) and to power the dedicated BNPL reminder
 * checks that replace them, using the capped amount and the atomic BNPL
 * confirmation transition instead. */
function bnplLinkedItemIds(data: AppData): Set<string> {
  const ids = new Set<string>();
  for (const liability of data.liabilities) {
    if (liability.type !== 'bnpl') continue;
    const resolution = resolveBnplLinkedItems(data, liability.id);
    if (resolution.status === 'single') ids.add(resolution.item.id);
  }
  return ids;
}

const LOAN_REPAYMENT_LIABILITY_TYPES: LiabilityType[] = ['mortgage', 'car_loan', 'personal_loan', 'other'];

/** Final Pass 2D device-test correction — the mortgage/personal-loan/
 * car-loan/other-loan sibling of bnplLinkedItemIds: every recurring-item id
 * linked (via `linkedLiabilityId`) to one of these liability types, so the
 * ordinary bill checks below can exclude them the same way they already
 * exclude BNPL, and the dedicated loan_repayment_due checks can pick them
 * up instead — routed to the new dedicated repayment sheet rather than the
 * plain bill-payment picker (item 2 of this round's spec). Unlike BNPL,
 * there is no ambiguity to resolve here (a liability may have at most ONE
 * linked recurring item at all, enforced by upsertLinkedRecurringItem), so
 * this is a direct set build, not a per-liability resolution call. */
function loanLinkedItemIds(data: AppData): Set<string> {
  const ids = new Set<string>();
  for (const item of data.recurringItems) {
    if (!item.linkedLiabilityId) continue;
    const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
    if (liability && LOAN_REPAYMENT_LIABILITY_TYPES.includes(liability.type)) ids.add(item.id);
  }
  return ids;
}

/** 2D-NARROW correction, Gate 4 — mirrors the credit-card gate below
 * (`c.currentBalance <= 0` skips the card-due reminder entirely): a loan
 * whose customer-recorded balance is exactly $0 must not keep generating
 * future repayment reminders. Deliberately a LIVE check against
 * `data.liabilities` on every call, not a frozen flag on the RecurringItem
 * (that's BNPL's own approach, appropriate there because a BNPL plan really
 * is finished forever once its schedule completes) — a loan reaching $0 is
 * NOT necessarily "done forever": an unknown-split repayment happening to
 * zero it out is explicitly not a payoff (see confirmLoanRepaymentTransition's
 * own contract), and the customer can always edit the recorded balance
 * back up. Reading live means suppression while $0, and automatic resumption
 * the moment a reversal or manual edit restores a positive balance, both
 * fall out for free with no extra state to keep in sync. */
function loanItemHasPositiveBalance(data: AppData, item: RecurringItem): boolean {
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  return !!liability && liability.currentBalance > 0;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Advances a recurring item by exactly one pay/bill cycle — used once a
 * payday or bill has been confirmed, so Lulu stops asking about the same
 * one. Delegates to recurringSchedule.ts's anchor-aware date math (the one
 * shared implementation of monthly clamp-and-restore logic in the app).
 * Returns both the new nextDueDate and the item's own (unchanged)
 * scheduleAnchorDay so a caller can pass both into a single
 * updateRecurringItem patch — this is the explicit "internal automatic
 * advancement preserves the existing anchor" contract (regression-
 * protection review, B2.0A follow-up §3C): the anchor is threaded through by
 * the caller, never re-inferred from the advanced date. */
export function advanceRecurringItemSchedule(
  item: Pick<RecurringItem, 'nextDueDate' | 'frequency' | 'scheduleAnchorDay'>
): { nextDueDate: string; scheduleAnchorDay?: number } {
  return {
    nextDueDate: advanceOneOccurrence(item).toISOString(),
    scheduleAnchorDay: item.scheduleAnchorDay,
  };
}

/**
 * Reminder queue correction round, §6 — the canonical ranked Reminder
 * calculation, extracted from what was previously computeTopReminder's own
 * body (that function is now a thin wrapper, below, preserving 100%
 * backward compatibility for every other existing caller). Every priority
 * tier is restructured from a single `.find()` (which could only ever
 * consider the FIRST matching candidate) into a loop over EVERY matching
 * candidate in the same original order, skipping any candidate `isExcluded`
 * rejects and falling through to the next candidate WITHIN the same tier
 * before ever moving to a lower tier. With the default no-op excluder this
 * is exactly equivalent to the previous find-based logic — same tier order,
 * same tie-breaking, same copy.
 *
 * `isExcluded` is a generic, opaque predicate over a fully-built
 * SmartReminder — this file deliberately never imports occurrence-identity
 * helpers itself (see reminderInteractionLifecycle.ts / todayBriefing.ts
 * for those) to avoid a circular import; the caller (ReminderDetailSheet)
 * builds the actual session-deferred-keys predicate from its own state.
 *
 * Surfaces at most one "Navilo noticed" reminder at a time — matching the
 * single-focused-card pattern already used for Today's opportunities,
 * rather than a stacked notification feed. Never assumes money has moved;
 * every reminder here is a question for the user to confirm (PRD ask).
 * Priority: an overdue bill is the most actionable, then a confirmed
 * payday (unlocks accurate Safe to Spend), then a heads-up for what's
 * coming in the next few days.
 */
export function computeRankedReminder(
  data: AppData,
  today: Date = new Date(),
  isExcluded: (reminder: SmartReminder) => boolean = () => false
): SmartReminder | null {
  const bnplItemIds = bnplLinkedItemIds(data);
  const loanItemIds = loanLinkedItemIds(data);

  const overdueBillCandidates = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && !bnplItemIds.has(r.id) && !loanItemIds.has(r.id))
    .filter((r) => daysBetween(new Date(r.nextDueDate), today) > 0);
  for (const overdueBill of overdueBillCandidates) {
    const reminder: SmartReminder = {
      id: `bill-overdue-${overdueBill.id}-${overdueBill.nextDueDate}`,
      kind: 'bill_overdue',
      title: `Did you pay your ${overdueBill.label}?`,
      body: `It was due ${shortDate(overdueBill.nextDueDate)}.`,
      recurringItemId: overdueBill.id,
      amount: overdueBill.amount,
      occurrenceDate: overdueBill.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // BNPL — overdue, using the capped occurrence amount (min of the
  // scheduled amount and the live outstanding balance; the first
  // unconfirmed occurrence needs no chronological-consumption walk, since
  // nothing has consumed the balance ahead of it). Checked at the same
  // priority tier as the ordinary overdue-bill check above.
  const overdueBnplCandidates = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && bnplItemIds.has(r.id))
    .filter((r) => daysBetween(new Date(r.nextDueDate), today) > 0);
  for (const overdueBnplItem of overdueBnplCandidates) {
    const liability = data.liabilities.find((l) => l.id === overdueBnplItem.linkedLiabilityId)!;
    const cappedAmount = Math.min(overdueBnplItem.amount, liability.currentBalance);
    const reminder: SmartReminder = {
      id: `bnpl-overdue-${overdueBnplItem.id}-${overdueBnplItem.nextDueDate}`,
      kind: 'bnpl_repayment_due',
      title: `Did you pay your ${overdueBnplItem.label}?`,
      body: `It was due ${shortDate(overdueBnplItem.nextDueDate)}.`,
      recurringItemId: overdueBnplItem.id,
      liabilityId: liability.id,
      amount: cappedAmount,
      occurrenceDate: overdueBnplItem.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // Mortgage/personal-loan/car-loan/other-loan — overdue. Final Pass 2D
  // device-test correction, item 2: routed to the dedicated
  // loan_repayment_due reminder (SmartReminderCard.tsx opens the new
  // LoanRepaymentSheet for this kind) instead of the plain bill-payment
  // picker, so the customer can optionally update the recorded loan
  // balance as part of confirming. Checked at the same priority tier as
  // the ordinary overdue-bill and BNPL-overdue checks above — mirrors
  // BNPL's own placement exactly. No amount is stated in this factual
  // "did you pay" question (matches the ordinary bill_overdue copy
  // exactly), so there is nothing here that could misstate the recorded
  // repayment as a lender-confirmed amount due.
  const overdueLoanCandidates = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && loanItemIds.has(r.id) && loanItemHasPositiveBalance(data, r))
    .filter((r) => daysBetween(new Date(r.nextDueDate), today) > 0);
  for (const overdueLoanItem of overdueLoanCandidates) {
    const liability = data.liabilities.find((l) => l.id === overdueLoanItem.linkedLiabilityId)!;
    const reminder: SmartReminder = {
      id: `loan-overdue-${overdueLoanItem.id}-${overdueLoanItem.nextDueDate}`,
      kind: 'loan_repayment_due',
      title: `Did you pay your ${overdueLoanItem.label}?`,
      body: `It was due ${shortDate(overdueLoanItem.nextDueDate)}.`,
      recurringItemId: overdueLoanItem.id,
      liabilityId: liability.id,
      liabilityType: liability.type,
      amount: overdueLoanItem.amount,
      occurrenceDate: overdueLoanItem.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // One reminder per soonest income source, not a lump-sum aggregate (PRD
  // ask, §3/§5): with multiple income sources, "did your salary arrive?"
  // must confirm — and reschedule — the specific source that's actually
  // due, the same way bill reminders already target one specific item.
  // Reminder queue correction round — previously only ever considered the
  // SINGLE soonest income source ([0] after sorting); now walks every
  // income source in the same soonest-first order so a session-deferred
  // source can fall through to the next-soonest one still inside its own
  // window, matching every other tier's own excluded-candidate fallthrough.
  const upcomingIncomeCandidates = data.recurringItems
    .filter((r) => r.type === 'income' && r.active && !r.nextDueDateUnknown)
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  for (const upcomingIncome of upcomingIncomeCandidates) {
    const days = daysBetween(new Date(upcomingIncome.nextDueDate), today);
    if (days < 0 || days > 3) continue;
    const reminder: SmartReminder = {
      id: `salary-${upcomingIncome.id}-${upcomingIncome.nextDueDate}`,
      kind: 'salary_check',
      title: `Did your ${upcomingIncome.label.toLowerCase()} arrive? 🎉`,
      body: `${brand.name} expected it around ${shortDate(upcomingIncome.nextDueDate)}.`,
      recurringItemId: upcomingIncome.id,
      amount: upcomingIncome.amount,
      occurrenceDate: upcomingIncome.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // A bill due exactly today — factual, never "overdue"/"late" (PRD ask,
  // B2.0B due-today reminder correction §4): the payment window has only
  // just opened, not passed. Checked after the overdue and income blocks
  // above (both unchanged, both still take priority exactly as before —
  // income's own condition and position are untouched, so a scenario where
  // income already won stays exactly as it was) but before the tomorrow/
  // future `dueSoon` block below, giving it the §3 priority: overdue >
  // due-today > tomorrow/future. Deliberately reuses kind: 'bill_overdue' —
  // the only SmartReminder kind SmartReminderCard.tsx wires to the real
  // "Yes, I paid it" → payment-source → confirm flow — so the existing
  // actionable path (and the existing pre-confirmation transparency
  // disclosure, unmodified) renders unchanged; only the title/body text
  // here distinguishes "due today" from a genuinely late bill. The
  // recurring item's own current label/amount are read fresh from `data`
  // here, and its own nextDueDate is what SmartReminderCard.tsx's
  // confirmRecurringOccurrence call re-reads directly from `data` at
  // confirm-time — this function never fabricates or caches a stale
  // amount/date of its own.
  const dueTodayBillCandidates = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && !bnplItemIds.has(r.id) && !loanItemIds.has(r.id))
    .filter((r) => daysBetween(new Date(r.nextDueDate), today) === 0);
  for (const dueTodayBill of dueTodayBillCandidates) {
    const reminder: SmartReminder = {
      id: `bill-overdue-${dueTodayBill.id}-${dueTodayBill.nextDueDate}`,
      kind: 'bill_overdue',
      title: `Did you pay your ${dueTodayBill.label}?`,
      body: "It's due today.",
      recurringItemId: dueTodayBill.id,
      amount: dueTodayBill.amount,
      occurrenceDate: dueTodayBill.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  const dueTodayBnplCandidates = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && bnplItemIds.has(r.id))
    .filter((r) => daysBetween(new Date(r.nextDueDate), today) === 0);
  for (const dueTodayBnplItem of dueTodayBnplCandidates) {
    const liability = data.liabilities.find((l) => l.id === dueTodayBnplItem.linkedLiabilityId)!;
    const cappedAmount = Math.min(dueTodayBnplItem.amount, liability.currentBalance);
    const reminder: SmartReminder = {
      id: `bnpl-overdue-${dueTodayBnplItem.id}-${dueTodayBnplItem.nextDueDate}`,
      kind: 'bnpl_repayment_due',
      title: `Did you pay your ${dueTodayBnplItem.label}?`,
      body: "It's due today.",
      recurringItemId: dueTodayBnplItem.id,
      liabilityId: liability.id,
      amount: cappedAmount,
      occurrenceDate: dueTodayBnplItem.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // Loan — due exactly today. Mirrors dueTodayBill/dueTodayBnplItem exactly.
  const dueTodayLoanCandidates = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && loanItemIds.has(r.id) && loanItemHasPositiveBalance(data, r))
    .filter((r) => daysBetween(new Date(r.nextDueDate), today) === 0);
  for (const dueTodayLoanItem of dueTodayLoanCandidates) {
    const liability = data.liabilities.find((l) => l.id === dueTodayLoanItem.linkedLiabilityId)!;
    const reminder: SmartReminder = {
      id: `loan-overdue-${dueTodayLoanItem.id}-${dueTodayLoanItem.nextDueDate}`,
      kind: 'loan_repayment_due',
      title: `Did you pay your ${dueTodayLoanItem.label}?`,
      body: "It's due today.",
      recurringItemId: dueTodayLoanItem.id,
      liabilityId: liability.id,
      liabilityType: liability.type,
      amount: dueTodayLoanItem.amount,
      occurrenceDate: dueTodayLoanItem.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // Final Pass 2D device-test correction, item 4 — a loan-linked bill due
  // tomorrow keeps the ordinary informational bill_due_soon reminder (no
  // dedicated repayment action offered a day early, matching BNPL's own
  // choice not to have a "due soon" tier at all), but its body line is
  // now explicit that the figure is the customer's own RECORDED repayment,
  // never a lender-confirmed amount due — the same factual-copy principle
  // applied to the card_due_soon reminder below.
  // 2D-NARROW correction, Gate 4 — a zero-balance loan item is excluded
  // here too (loanItemHasPositiveBalance), not just from the overdue/
  // due-today tiers above: showing "due tomorrow" for an already-paid-off
  // loan would be the same false future-repayment reminder this gate
  // exists to suppress, just one tier earlier.
  const dueSoonCandidates = data.recurringItems
    .filter(
      (r) => r.active && r.type === 'expense' && !bnplItemIds.has(r.id) && (!loanItemIds.has(r.id) || loanItemHasPositiveBalance(data, r))
    )
    .filter((r) => daysBetween(today, new Date(r.nextDueDate)) === 1);
  for (const dueSoon of dueSoonCandidates) {
    const isLoanLinked = loanItemIds.has(dueSoon.id);
    const reminder: SmartReminder = {
      id: `bill-soon-${dueSoon.id}-${dueSoon.nextDueDate}`,
      kind: 'bill_due_soon',
      title: `Your ${dueSoon.label} is due tomorrow`,
      body: isLoanLinked
        ? `Your recorded repayment of $${Math.round(dueSoon.amount).toLocaleString()} is due ${shortDate(dueSoon.nextDueDate)}.`
        : `$${Math.round(dueSoon.amount).toLocaleString()} due ${shortDate(dueSoon.nextDueDate)}.`,
      recurringItemId: dueSoon.id,
      amount: dueSoon.amount,
      occurrenceDate: dueSoon.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // Wave 9b — BNPL, due exactly tomorrow.
  //
  // CONFIRMED DEFECT (owner device test): a ZIP plan with a repayment due
  // tomorrow never reached the reminder queue, so "Record repayment" was
  // unreachable. BNPL had an OVERDUE tier and a DUE-TODAY tier, but the
  // due-soon tier above explicitly filters BNPL out (`!bnplItemIds.has`)
  // and had no BNPL branch of its own — so for the one-day window between
  // "not yet due" and "due today", no `bnpl_repayment_due` candidate was
  // ever constructed. Nothing was starving it and nothing suppressed it;
  // the candidate simply did not exist.
  //
  // This restores the existing contract rather than introducing a new
  // priority policy: BNPL sits in the SAME tier as an ordinary bill due
  // tomorrow, exactly as it already shares the overdue and due-today tiers
  // with bills. Card reminders remain a lower tier, unchanged. The queue
  // stays finite and the ordering deterministic.
  //
  // Mirrors dueTodayBnplCandidates verbatim, including the outstanding-
  // balance cap — a final instalment must never invite a payment larger
  // than what is actually still owed.
  const dueSoonBnplCandidates = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && bnplItemIds.has(r.id))
    .filter((r) => daysBetween(today, new Date(r.nextDueDate)) === 1);
  for (const dueSoonBnplItem of dueSoonBnplCandidates) {
    const liability = data.liabilities.find((l) => l.id === dueSoonBnplItem.linkedLiabilityId)!;
    const cappedAmount = Math.min(dueSoonBnplItem.amount, liability.currentBalance);
    const reminder: SmartReminder = {
      id: `bnpl-soon-${dueSoonBnplItem.id}-${dueSoonBnplItem.nextDueDate}`,
      kind: 'bnpl_repayment_due',
      title: `Your ${dueSoonBnplItem.label} is due tomorrow`,
      body: `$${Math.round(cappedAmount).toLocaleString()} due ${shortDate(dueSoonBnplItem.nextDueDate)}.`,
      recurringItemId: dueSoonBnplItem.id,
      liabilityId: liability.id,
      amount: cappedAmount,
      occurrenceDate: dueSoonBnplItem.nextDueDate,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  // Final Pass 2D device-test correction, item 1/4 (canonical helper, §6
  // round) — a card whose CURRENT due occurrence has already been marked
  // handled via a Reminder-initiated repayment never re-surfaces for that
  // same occurrence; the NEXT month's genuinely new due date recomputes to
  // a different date-key and naturally reappears with no extra logic. Uses
  // the shared isCardOccurrenceHandled helper (this file, above) — the
  // SAME check moneyTimeline.ts's independent Briefing/timeline event
  // generator now also calls, so both layers can never disagree.
  const cardDueCandidates = data.creditCards.filter((c) => {
    if (c.currentBalance <= 0) return false;
    if (daysUntilDue(c.dueDay, today) > 3) return false;
    const days = daysUntilDue(c.dueDay, today);
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + days);
    return !isCardOccurrenceHandled(c, dueDate);
  });
  for (const cardDue of cardDueCandidates) {
    const days = daysUntilDue(cardDue.dueDay, today);
    const est = computeCreditCardInterestEstimateForCard(cardDue, today);
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + days);
    // Reminder/credit-card wording correction round — the title and first
    // body line now come from the single shared, day-count-aware
    // presentation helper (creditHealth.ts), replacing the previous
    // day-count-blind "Your [card] payment is coming up" / "Payment due
    // [date]." wording that was always shown regardless of whether the due
    // date was today, tomorrow, or several days out (confirmed device-test
    // Defect D). Every other factual line below (recorded balance, recorded
    // minimum payment, expected monthly payment, interest estimate,
    // minimum-payment warning, assumed-rate disclaimer) is preserved
    // verbatim — this correction touches presentation of the due date only,
    // never the underlying financial figures or calculations.
    const presentation = computeCreditCardDuePresentation(days, dueDate);
    const { heading, dueLine } = creditCardDuePresentationCopy(presentation, cardDue.label);
    const lines = [dueLine, `Current recorded balance: $${Math.round(cardDue.currentBalance).toLocaleString()}.`];
    if (cardDue.minimumPayment > 0) {
      lines.push(`Recorded minimum payment: $${Math.round(cardDue.minimumPayment).toLocaleString()}.`);
    }
    if (isValidExpectedRepayment(cardDue.expectedMonthlyRepayment)) {
      lines.push(`Your expected monthly payment: $${Math.round(cardDue.expectedMonthlyRepayment).toLocaleString()}.`);
    }
    if (est.estimatedCycleInterest >= 1) {
      lines.push(`Estimated interest if unpaid: approximately $${Math.round(est.estimatedCycleInterest).toLocaleString()} over 30 days.`);
    }
    if (cardDue.minimumPayment > 0) {
      lines.push('Paying only the minimum may cost more in interest.');
    } else if (est.estimatedCycleInterest >= 1) {
      lines.push('Paying only part of your balance may cost more in interest over time.');
    }
    if (est.isAssumedRate && est.estimatedCycleInterest >= 1) {
      lines.push(est.disclaimer);
    }
    const reminder: SmartReminder = {
      id: `card-${cardDue.id}`,
      kind: 'card_due_soon',
      title: heading,
      body: lines.join('\n'),
      creditCardId: cardDue.id,
      // Only reminder branch with no pre-existing nextDueDate string on its
      // source record (CreditCard has a dueDay, not a full date) — reuses
      // the same dueDate this function already computed above (line 206-207)
      // from that dueDay, rather than re-deriving it a second time.
      occurrenceDate: dueDate.toISOString(),
      creditCardDue: presentation,
    };
    if (!isExcluded(reminder)) return reminder;
  }

  return null;
}

/** Backward-compatible wrapper preserving every existing caller's exact
 * behavior — the single-result selector this file always exposed, now a
 * thin pass-through to computeRankedReminder with no exclusions. */
export function computeTopReminder(data: AppData, today: Date = new Date()): SmartReminder | null {
  return computeRankedReminder(data, today);
}
