import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { computeSafeToSpend } from './safeToSpend';
import { daysUntilDue } from './creditHealth';
import { brand } from '../brand';

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
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
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

  if (data.user.nextPayday) {
    const paydayDate = new Date(data.user.nextPayday);
    const daysUntil = daysBetween(today, paydayDate);
    if (daysUntil >= 0 && daysUntil <= horizonDays && data.user.monthlyIncome > 0) {
      events.push({
        id: 'income-next',
        date: paydayDate,
        daysUntil,
        kind: 'income',
        icon: 'cash',
        label: 'Income expected',
        amount: data.user.monthlyIncome,
      });
    }
  }

  for (const item of data.recurringItems) {
    if (item.type !== 'expense' || !item.active) continue;
    const dueDate = new Date(item.nextDueDate);
    const daysUntil = daysBetween(today, dueDate);
    if (daysUntil < -1 || daysUntil > horizonDays) continue;
    const isMortgage = !!item.linkedLiabilityId && data.liabilities.find((l) => l.id === item.linkedLiabilityId)?.type === 'mortgage';
    events.push({
      id: `bill-${item.id}`,
      date: dueDate,
      daysUntil,
      kind: isMortgage ? 'mortgage' : 'bill',
      icon: (item.icon as keyof typeof Ionicons.glyphMap) ?? (isMortgage ? 'home' : 'calendar-outline'),
      label: item.label,
      amount: -item.amount,
    });
  }

  for (const card of data.creditCards) {
    if (card.currentBalance <= 0) continue;
    const daysUntil = daysUntilDue(card.dueDay, today);
    if (daysUntil > horizonDays) continue;
    const dueDate = new Date(today.getTime() + daysUntil * 86400000);
    events.push({
      id: `card-${card.id}`,
      date: dueDate,
      daysUntil,
      kind: 'credit_card',
      icon: 'card',
      label: `${card.label} payment due`,
      sublabel: card.minimumPayment > 0 ? `Minimum ${Math.round(card.minimumPayment).toLocaleString()}` : undefined,
      amount: -card.minimumPayment,
    });
  }

  // Savings and goal allocations don't have a real transaction date of
  // their own — anchoring them to the next known payday (rather than
  // inventing one) is the one honest date available, since that's when
  // Navilo actually reserves this cycle's allocation (PRD ask, §5/§6:
  // "combine savings, goal contributions" without a new forecasting
  // engine).
  if (data.user.nextPayday && data.user.monthlyIncome > 0) {
    const paydayDate = new Date(data.user.nextPayday);
    const daysUntil = daysBetween(today, paydayDate);
    if (daysUntil >= 0 && daysUntil <= horizonDays) {
      const safeToSpend = computeSafeToSpend(data, today);
      if (safeToSpend.defaultSavingsBuffer > 0) {
        events.push({
          id: 'savings-plan',
          date: paydayDate,
          daysUntil,
          kind: 'savings',
          icon: 'trending-up',
          label: `${brand.name} Savings Plan`,
          sublabel: 'Reserved from this pay',
          amount: -safeToSpend.defaultSavingsBuffer,
        });
      }
      for (const allocation of safeToSpend.goalAllocation.allocations) {
        if (allocation.allocatedMonthly <= 0) continue;
        events.push({
          id: `goal-${allocation.goal.id}`,
          date: paydayDate,
          daysUntil,
          kind: 'goal',
          icon: 'flag',
          label: `${allocation.goal.name} contribution`,
          sublabel: 'Reserved from this pay',
          amount: -allocation.allocatedMonthly,
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
