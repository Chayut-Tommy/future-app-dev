import { AppData, RecurringItem } from '../../types/models';
import { computeCreditCardInterestEstimateForCard, daysUntilDue } from './creditHealth';
import { advanceOneOccurrence } from './recurringSchedule';
import { resolveBnplLinkedItems } from './bnpl';
import { brand } from '../brand';

export type SmartReminderKind = 'salary_check' | 'bill_overdue' | 'bill_due_soon' | 'card_due_soon' | 'bnpl_repayment_due';

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
  /** Pass 2A correction — the ISO date string of the specific occurrence
   * this reminder is about (the same `nextDueDate`/computed due-date value
   * already used to build this reminder's own composite `id` below, now
   * also exposed as its own field). Never parsed back out of `id`. This is
   * what lets a consumer (the Today Briefing's dedup logic) tell apart two
   * different occurrences of the SAME recurring source — e.g. an overdue
   * Rent reminder for last week must not suppress a future Rent event two
   * cycles from now, only the one specific occurrence it's actually about. */
  occurrenceDate?: string;
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
 * Surfaces at most one "Lulu noticed" reminder at a time — matching the
 * single-focused-card pattern already used for Today's opportunities,
 * rather than a stacked notification feed. Never assumes money has moved;
 * every reminder here is a question for the user to confirm (PRD ask).
 * Priority: an overdue bill is the most actionable, then a confirmed
 * payday (unlocks accurate Safe to Spend), then a heads-up for what's
 * coming in the next few days.
 */
export function computeTopReminder(data: AppData, today: Date = new Date()): SmartReminder | null {
  const bnplItemIds = bnplLinkedItemIds(data);

  const overdueBill = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && !bnplItemIds.has(r.id))
    .find((r) => daysBetween(new Date(r.nextDueDate), today) > 0);
  if (overdueBill) {
    return {
      id: `bill-overdue-${overdueBill.id}-${overdueBill.nextDueDate}`,
      kind: 'bill_overdue',
      title: `Did you pay your ${overdueBill.label}?`,
      body: `It was due ${shortDate(overdueBill.nextDueDate)}.`,
      recurringItemId: overdueBill.id,
      amount: overdueBill.amount,
      occurrenceDate: overdueBill.nextDueDate,
    };
  }

  // BNPL — overdue, using the capped occurrence amount (min of the
  // scheduled amount and the live outstanding balance; the first
  // unconfirmed occurrence needs no chronological-consumption walk, since
  // nothing has consumed the balance ahead of it). Checked at the same
  // priority tier as the ordinary overdue-bill check above.
  const overdueBnplItem = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && bnplItemIds.has(r.id))
    .find((r) => daysBetween(new Date(r.nextDueDate), today) > 0);
  if (overdueBnplItem) {
    const liability = data.liabilities.find((l) => l.id === overdueBnplItem.linkedLiabilityId)!;
    const cappedAmount = Math.min(overdueBnplItem.amount, liability.currentBalance);
    return {
      id: `bnpl-overdue-${overdueBnplItem.id}-${overdueBnplItem.nextDueDate}`,
      kind: 'bnpl_repayment_due',
      title: `Did you pay your ${overdueBnplItem.label}?`,
      body: `It was due ${shortDate(overdueBnplItem.nextDueDate)}.`,
      recurringItemId: overdueBnplItem.id,
      liabilityId: liability.id,
      amount: cappedAmount,
      occurrenceDate: overdueBnplItem.nextDueDate,
    };
  }

  // One reminder per soonest income source, not a lump-sum aggregate (PRD
  // ask, §3/§5): with multiple income sources, "did your salary arrive?"
  // must confirm — and reschedule — the specific source that's actually
  // due, the same way bill reminders already target one specific item.
  const upcomingIncome = data.recurringItems
    .filter((r) => r.type === 'income' && r.active && !r.nextDueDateUnknown)
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())[0];
  if (upcomingIncome) {
    const days = daysBetween(new Date(upcomingIncome.nextDueDate), today);
    if (days >= 0 && days <= 3) {
      return {
        id: `salary-${upcomingIncome.id}-${upcomingIncome.nextDueDate}`,
        kind: 'salary_check',
        title: `Did your ${upcomingIncome.label.toLowerCase()} arrive? 🎉`,
        body: `${brand.name} expected it around ${shortDate(upcomingIncome.nextDueDate)}.`,
        recurringItemId: upcomingIncome.id,
        amount: upcomingIncome.amount,
        occurrenceDate: upcomingIncome.nextDueDate,
      };
    }
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
  const dueTodayBill = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && !bnplItemIds.has(r.id))
    .find((r) => daysBetween(new Date(r.nextDueDate), today) === 0);
  if (dueTodayBill) {
    return {
      id: `bill-overdue-${dueTodayBill.id}-${dueTodayBill.nextDueDate}`,
      kind: 'bill_overdue',
      title: `Did you pay your ${dueTodayBill.label}?`,
      body: "It's due today.",
      recurringItemId: dueTodayBill.id,
      amount: dueTodayBill.amount,
      occurrenceDate: dueTodayBill.nextDueDate,
    };
  }

  const dueTodayBnplItem = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && bnplItemIds.has(r.id))
    .find((r) => daysBetween(new Date(r.nextDueDate), today) === 0);
  if (dueTodayBnplItem) {
    const liability = data.liabilities.find((l) => l.id === dueTodayBnplItem.linkedLiabilityId)!;
    const cappedAmount = Math.min(dueTodayBnplItem.amount, liability.currentBalance);
    return {
      id: `bnpl-overdue-${dueTodayBnplItem.id}-${dueTodayBnplItem.nextDueDate}`,
      kind: 'bnpl_repayment_due',
      title: `Did you pay your ${dueTodayBnplItem.label}?`,
      body: "It's due today.",
      recurringItemId: dueTodayBnplItem.id,
      liabilityId: liability.id,
      amount: cappedAmount,
      occurrenceDate: dueTodayBnplItem.nextDueDate,
    };
  }

  const dueSoon = data.recurringItems
    .filter((r) => r.active && r.type === 'expense' && !bnplItemIds.has(r.id))
    .find((r) => daysBetween(today, new Date(r.nextDueDate)) === 1);
  if (dueSoon) {
    return {
      id: `bill-soon-${dueSoon.id}-${dueSoon.nextDueDate}`,
      kind: 'bill_due_soon',
      title: `Your ${dueSoon.label} is due tomorrow`,
      body: `$${Math.round(dueSoon.amount).toLocaleString()} due ${shortDate(dueSoon.nextDueDate)}.`,
      recurringItemId: dueSoon.id,
      amount: dueSoon.amount,
      occurrenceDate: dueSoon.nextDueDate,
    };
  }

  const cardDue = data.creditCards.find((c) => c.currentBalance > 0 && daysUntilDue(c.dueDay, today) <= 3);
  if (cardDue) {
    const days = daysUntilDue(cardDue.dueDay, today);
    const est = computeCreditCardInterestEstimateForCard(cardDue, today);
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + days);
    // Due-date urgency, daily interest, and a full 30-day cycle estimate are
    // three separate figures — never collapse the days-to-due estimate into
    // a "next cycle" label (PRD bug report: a 4-day, ~$21 estimate was
    // previously mislabelled as the next cycle's interest).
    const lines = [`Pay $${Math.round(cardDue.currentBalance).toLocaleString()} before ${shortDate(dueDate.toISOString())}.`];
    if (est.estimatedCycleInterest >= 1) {
      lines.push(`Estimated interest if unpaid: approximately $${Math.round(est.estimatedCycleInterest).toLocaleString()} over 30 days.`);
    }
    if (cardDue.minimumPayment > 0) {
      lines.push(`Minimum due: $${Math.round(cardDue.minimumPayment).toLocaleString()}. Paying only the minimum may cost more in interest.`);
    } else {
      lines.push('Paying only the minimum may cost more in interest over time.');
    }
    if (est.isAssumedRate && est.estimatedCycleInterest >= 1) {
      lines.push(est.disclaimer);
    }
    return {
      id: `card-${cardDue.id}`,
      kind: 'card_due_soon',
      title: `Your ${cardDue.label} payment is coming up`,
      body: lines.join('\n'),
      creditCardId: cardDue.id,
      // Only reminder branch with no pre-existing nextDueDate string on its
      // source record (CreditCard has a dueDay, not a full date) — reuses
      // the same dueDate this function already computed above (line 206-207)
      // from that dueDay, rather than re-deriving it a second time.
      occurrenceDate: dueDate.toISOString(),
    };
  }

  return null;
}
