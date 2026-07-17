import { AppData, PayFrequency } from '../../types/models';
import { computeCreditCardInterestEstimateForCard, daysUntilDue } from './creditHealth';
import { brand } from '../brand';

export type SmartReminderKind = 'salary_check' | 'bill_overdue' | 'bill_due_soon' | 'card_due_soon';

export interface SmartReminder {
  id: string;
  kind: SmartReminderKind;
  title: string;
  body: string;
  recurringItemId?: string;
  amount?: number;
  creditCardId?: string;
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

/** Moves a date forward by one pay/bill cycle — used once a payday or bill
 * has been confirmed, so Lulu stops asking about the same one. */
export function stepFrequency(dateISO: string, frequency: PayFrequency): string {
  const d = new Date(dateISO);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'fortnightly':
      d.setDate(d.getDate() + 14);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d.toISOString();
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
  const overdueBill = data.recurringItems
    .filter((r) => r.active && r.type === 'expense')
    .find((r) => daysBetween(new Date(r.nextDueDate), today) > 0);
  if (overdueBill) {
    return {
      id: `bill-overdue-${overdueBill.id}-${overdueBill.nextDueDate}`,
      kind: 'bill_overdue',
      title: `Did you pay your ${overdueBill.label}?`,
      body: `It was due ${shortDate(overdueBill.nextDueDate)}.`,
      recurringItemId: overdueBill.id,
      amount: overdueBill.amount,
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
      };
    }
  }

  const dueSoon = data.recurringItems
    .filter((r) => r.active && r.type === 'expense')
    .find((r) => daysBetween(today, new Date(r.nextDueDate)) === 1);
  if (dueSoon) {
    return {
      id: `bill-soon-${dueSoon.id}-${dueSoon.nextDueDate}`,
      kind: 'bill_due_soon',
      title: `Your ${dueSoon.label} is due tomorrow`,
      body: `$${Math.round(dueSoon.amount).toLocaleString()} due ${shortDate(dueSoon.nextDueDate)}.`,
      recurringItemId: dueSoon.id,
      amount: dueSoon.amount,
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
    };
  }

  return null;
}
