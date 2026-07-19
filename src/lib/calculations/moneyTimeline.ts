import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { computeSafeToSpend, cycleLengthDays } from './safeToSpend';
import { daysUntilDue, resolveExpectedMonthlyRepayment } from './creditHealth';
import { recurringOccurrencesInRange } from './recurringSchedule';

export type TimelineEventKind = 'income' | 'bill' | 'mortgage' | 'credit_card' | 'savings' | 'goal';

export interface TimelineEvent {
  id: string;
  date: Date;
  daysUntil: number;
  kind: TimelineEventKind;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  /** Signed — positive for money coming in, negative for money going out. */
  amount: number;
  /** Present for income/bill events — the underlying RecurringItem this
   * occurrence came from, so tapping any occurrence (not just the first)
   * opens the right editor (PRD ask, §2/§4: a recurring event should keep
   * showing up, and every occurrence should stay editable). */
  recurringItemId?: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

// Local-calendar YYYY-MM-DD, used to key repeated cycle-boundary events
// (Savings Allocation, goal contributions) so each occurrence gets a
// unique, stable, human-readable id — never UTC-shifted, matching how the
// rest of this file already treats dates as local calendar days.
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "What happens next" — a single chronological view combining salary,
 * bills, mortgage, credit cards, and planned savings/goal allocations (PRD
 * ask, §5: "the centrepiece of the Money tab"). Purely an aggregation and
 * sort over dates and amounts the shared engines already compute
 * (computeSafeToSpend, recurringItems' own nextDueDate, credit cards' own
 * dueDay) — no new financial math, no calculation that could disagree with
 * Money Flow/Money Plan/Wealth elsewhere in the app.
 */
export function computeMoneyTimeline(data: AppData, today: Date = new Date(), horizonDays: number = 30): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // One event per income source *per occurrence*, using its own real
  // per-payment amount and date — never the monthly-equivalent total (PRD
  // bug report: a $4,000 fortnightly salary showed as "+$8,667 in 4 days"),
  // and never just its first upcoming date (PRD bug report: a fortnightly
  // "Rental Income" only ever appeared once, then vanished — this should
  // keep repeating across the whole visible horizon, like a real cashflow
  // timeline). Sources with no known date (irregular, "I don't know when")
  // simply don't get a dated event — Navilo never invents one.
  const horizonStart = new Date(startOfDay(today).getTime() - 86400000);
  const horizonEnd = new Date(startOfDay(today).getTime() + horizonDays * 86400000);

  const incomeItems = data.recurringItems.filter((r) => r.type === 'income');
  for (const occurrence of recurringOccurrencesInRange(incomeItems, horizonStart, horizonEnd)) {
    const { item, date } = occurrence;
    const daysUntil = daysBetween(today, date);
    if (daysUntil < 0) continue;
    events.push({
      id: `income-${item.id}-${date.getTime()}`,
      date,
      daysUntil,
      kind: 'income',
      icon: (item.icon as keyof typeof Ionicons.glyphMap) ?? 'cash',
      label: item.label,
      amount: item.amount,
      recurringItemId: item.id,
    });
  }

  const billItems = data.recurringItems.filter((r) => r.type === 'expense');
  for (const occurrence of recurringOccurrencesInRange(billItems, horizonStart, horizonEnd)) {
    const { item, date } = occurrence;
    const daysUntil = daysBetween(today, date);
    if (daysUntil < -1) continue;
    const isMortgage = !!item.linkedLiabilityId && data.liabilities.find((l) => l.id === item.linkedLiabilityId)?.type === 'mortgage';
    events.push({
      id: `bill-${item.id}-${date.getTime()}`,
      date,
      daysUntil,
      kind: isMortgage ? 'mortgage' : 'bill',
      icon: (item.icon as keyof typeof Ionicons.glyphMap) ?? (isMortgage ? 'home' : 'calendar-outline'),
      label: item.label,
      amount: -item.amount,
      recurringItemId: item.id,
    });
  }

  // A credit-card repayment only ever appears here when the user has told
  // Navilo they actually plan to repay a positive amount (PRD bug report,
  // Finding #41: a $0 event rendered as a nonsensical "+$0" — the fix is to
  // never generate the event at all for zero/blank/invalid/negative input,
  // not just to fix its sign). Deliberately not gated on currentBalance > 0
  // — a planned repayment the user has explicitly set is real information
  // even if the balance happens to be zero right now (it may change before
  // the due date; PRD ask: never silently suppress a user's own entered
  // plan).
  for (const card of data.creditCards) {
    const expectedRepayment = resolveExpectedMonthlyRepayment(card);
    if (expectedRepayment <= 0) continue;
    const daysUntil = daysUntilDue(card.dueDay, today);
    if (daysUntil > horizonDays) continue;
    const dueDate = new Date(today.getTime() + daysUntil * 86400000);
    events.push({
      id: `card-${card.id}`,
      date: dueDate,
      daysUntil,
      kind: 'credit_card',
      icon: 'card',
      label: `${card.label} credit card repayment`,
      sublabel: 'Based on what you expect to repay',
      amount: -expectedRepayment,
    });
  }

  // ============================================================
  // PHASE 1 PRODUCT RULE — single primary pay cycle
  // ============================================================
  // Navilo distinguishes two separate concepts (PRD ask, explicit product
  // rule):
  //   1. Multiple recurring income sources (data.recurringItems, type
  //      'income') — each generates its own repeating timeline event
  //      above via recurringOccurrencesInRange, independent of this block.
  //   2. One primary pay cycle (user.nextPayday / user.payFrequency /
  //      cycleLengthDays) — the single cadence Available Until Payday,
  //      Savings Allocation, and cycle-based goal allocations are all
  //      anchored to.
  // Savings Allocation and goal-allocation events are generated ONLY from
  // the primary pay cycle, never per individual income source. A user
  // with salary + rental income + dividends sees one Savings Allocation
  // event per primary cycle, not one per income stream — attaching it to
  // every recurring income source would multiply the same allocation
  // against unrelated cashflows. Introducing a per-income-source savings
  // setting is an explicitly deferred future product decision, not part
  // of this pass.
  //
  // Savings and goal allocations don't have a real transaction date of
  // their own — anchoring them to primary-cycle boundaries (rather than
  // inventing a date) is the one honest date available, since that's when
  // Navilo actually reserves each cycle's allocation (PRD ask, §5/§6:
  // "combine savings, goal contributions" without a new forecasting
  // engine). Uses each cycle's own share of the monthly target
  // (cycleSavingsReserved, itself prorated in computeSafeToSpend) rather
  // than the full monthly figure, so a fortnightly payday doesn't show the
  // whole month's savings target being reserved twice a month. This event
  // only appears when the user has explicitly turned Savings Allocation on
  // — cycleSavingsReserved is $0, so nothing is shown, when it's off. When
  // Savings Allocation is set to a percentage and monthlyIncome later
  // drops to 0 (no recurring income), the outer `monthlyIncome > 0` guard
  // below stops this whole block from running, so no percentage-based
  // event can appear once recurring income no longer exists.
  //
  // Repeated at every future primary-cycle boundary within the visible
  // horizon — not just the single next payday — the same way income/bill
  // events already repeat via recurringOccurrencesInRange above (PRD bug
  // report: 31 Jul, 14 Aug and later recurring salary events showed no
  // matching Savings Allocation, even though Money Allocation and Wealth
  // Projection both assume this is an ongoing monthly behaviour, not a
  // one-off). cycleSavingsReserved/cycleFraction are computed once from
  // the current Savings Allocation setting and reused unchanged for every
  // repeated cycle date — never recalculated or compounded per
  // occurrence — so this is purely a presentation change over the
  // existing prorated amount, not a new or duplicated calculation. This
  // function only reads computeSafeToSpend's result to decide what to
  // display; it never writes back to asset balances, transactions, or any
  // other total, so Available Until Payday, Money Allocation, End of
  // Month Outlook, Wealth Projection, and Navilo Score all remain exactly
  // as they already were — repeating the display row does not re-add the
  // amount anywhere.
  if (data.user.nextPayday && data.user.monthlyIncome > 0) {
    const safeToSpend = computeSafeToSpend(data, today);
    const cycleFraction = Math.max(0, (safeToSpend.cycleEnd.getTime() - safeToSpend.cycleStart.getTime()) / (30 * 86400000));
    const cycleDays = cycleLengthDays(data.user.payFrequency);
    const firstCycleDate = new Date(data.user.nextPayday);

    for (
      let cycleDate = firstCycleDate;
      cycleDate.getTime() <= horizonEnd.getTime();
      cycleDate = new Date(cycleDate.getTime() + cycleDays * 86400000)
    ) {
      const daysUntil = daysBetween(today, cycleDate);
      if (daysUntil < 0) continue;
      if (daysUntil > horizonDays) break;
      const key = dateKey(cycleDate);

      if (safeToSpend.cycleSavingsReserved > 0) {
        events.push({
          id: `savings-allocation-${key}`,
          date: cycleDate,
          daysUntil,
          kind: 'savings',
          icon: 'trending-up',
          label: 'Savings allocation',
          sublabel: 'Estimated for this pay — set by you',
          amount: -safeToSpend.cycleSavingsReserved,
        });
      }
      for (const allocation of safeToSpend.goalAllocation.allocations) {
        if (allocation.allocatedMonthly <= 0) continue;
        events.push({
          id: `goal-${allocation.goal.id}-${key}`,
          date: cycleDate,
          daysUntil,
          kind: 'goal',
          icon: 'flag',
          label: `${allocation.goal.name} contribution`,
          sublabel: 'Reserved from this pay',
          amount: -(allocation.allocatedMonthly * cycleFraction),
        });
      }
    }
  }

  return events.sort((a, b) => a.daysUntil - b.daysUntil);
}

export interface AttentionItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  tone: 'warning' | 'neutral';
}

/**
 * "Needs your attention" — the highest-priority items only, never
 * everything at once (PRD ask, §8: "maximum three... rank by urgency").
 * Reuses the same timeline events and Safe-to-Spend result already
 * computed elsewhere on the page rather than a new prioritisation engine —
 * urgency here is just "soonest due first," with a shortfall (if any)
 * always shown first since it affects everything else on the page.
 */
export function computeAttentionItems(events: TimelineEvent[], remainingPool: number, maxItems: number = 3): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (remainingPool < 0) {
    items.push({ id: 'shortfall', icon: 'alert-circle', title: 'Recorded spending is currently ahead of the estimated plan', tone: 'warning' });
  }

  const urgentOutflows = events
    .filter((e) => e.amount < 0 && e.daysUntil <= 7 && (e.kind === 'bill' || e.kind === 'mortgage' || e.kind === 'credit_card'))
    .sort((a, b) => a.daysUntil - b.daysUntil);
  for (const e of urgentOutflows) {
    if (items.length >= maxItems) break;
    const dueText = e.daysUntil <= 0 ? 'due today' : e.daysUntil === 1 ? 'due tomorrow' : `due in ${e.daysUntil} days`;
    items.push({ id: e.id, icon: e.icon, title: `${e.label} ${dueText}`, tone: e.daysUntil <= 2 ? 'warning' : 'neutral' });
  }

  const upcomingIncome = events.find((e) => e.kind === 'income' && e.daysUntil <= 3);
  if (upcomingIncome && items.length < maxItems) {
    const dueText = upcomingIncome.daysUntil <= 0 ? 'expected today' : upcomingIncome.daysUntil === 1 ? 'expected tomorrow' : `expected in ${upcomingIncome.daysUntil} days`;
    items.push({ id: upcomingIncome.id, icon: 'cash', title: `Income ${dueText}`, tone: 'neutral' });
  }

  return items.slice(0, maxItems);
}
