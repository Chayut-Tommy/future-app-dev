import { AppData, Liability, RecurringItem } from '../../types/models';
import { moneyAmountToCents } from './money';
import { resolveBnplLinkedItems, toBalanceCentsAllowingZero } from './bnpl';

/**
 * Move Money's read-only BNPL presentation resolver (correction round,
 * 2026-08-10) — a pure, React-free function, real-import testable, that
 * decides which of the required plan states a given BNPL liability is in
 * right now. It NEVER mutates anything and never calls
 * `confirmBnplRepaymentTransition` itself — it only tells the caller what
 * to render. This is deliberately separate from any React orchestration
 * (a hook or component wiring this to `useAppState()`'s `confirmBnplRepayment`
 * belongs in a `.tsx` file, never here) — see this file's own boundary
 * note below.
 *
 * Due/overdue is decided by a genuine local-calendar-day comparison
 * (`localDaysBetween`, mirroring `reminders.ts`'s own established
 * `daysBetween`/`startOfDay` convention exactly) — NOT by
 * `confirmBnplRepaymentTransition`'s `nextDueDate !== expectedNextDueDate`
 * staleness guard, which only proves a caller's snapshot of the due date
 * still matches the current one and says nothing about whether that date
 * has actually arrived.
 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function localDaysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

export type BnplHandoffState =
  | {
      kind: 'due_or_overdue';
      liability: Liability;
      item: RecurringItem;
      /** min(scheduled occurrence cents, outstanding balance cents) — the
       * exact capped amount the confirmation would apply, reusing the
       * identical capping rule `confirmBnplRepaymentTransition` itself
       * applies (never independently re-derived). */
      effectiveCents: number;
      overdue: boolean;
    }
  | { kind: 'future'; liability: Liability; item: RecurringItem; effectiveCents: number }
  | { kind: 'balance_only'; liability: Liability }
  | { kind: 'ambiguous'; liability: Liability }
  | { kind: 'corrupted'; liability: Liability }
  | { kind: 'paid_off'; liability: Liability }
  | { kind: 'missing' };

export function resolveBnplHandoffState(data: AppData, liabilityId: string, today: Date): BnplHandoffState {
  const liability = data.liabilities.find((l) => l.id === liabilityId);
  if (!liability || liability.type !== 'bnpl') return { kind: 'missing' };

  const outstandingCents = toBalanceCentsAllowingZero(liability.currentBalance);
  if (outstandingCents === undefined) return { kind: 'missing' };
  if (outstandingCents === 0) return { kind: 'paid_off', liability };

  const resolution = resolveBnplLinkedItems(data, liabilityId);
  if (resolution.status === 'none') return { kind: 'balance_only', liability };
  if (resolution.status === 'ambiguous') return { kind: 'ambiguous', liability };

  const item = resolution.item;
  const dueDateMs = new Date(item.nextDueDate).getTime();
  if (Number.isNaN(dueDateMs)) return { kind: 'corrupted', liability };

  const scheduled = moneyAmountToCents(item.amount);
  if (!scheduled.valid) return { kind: 'corrupted', liability };
  const effectiveCents = Math.min(scheduled.cents, outstandingCents);

  const days = localDaysBetween(new Date(item.nextDueDate), today);
  if (days >= 0) return { kind: 'due_or_overdue', liability, item, effectiveCents, overdue: days > 0 };
  return { kind: 'future', liability, item, effectiveCents };
}

/**
 * Every active BNPL plan's current handoff state, for Move Money's
 * dedicated "BNPL repayments" group — a paid-off plan is naturally excluded
 * here (its state is 'paid_off', filtered out below) rather than requiring
 * every caller to remember to check the state itself.
 */
export function listBnplHandoffStates(data: AppData, today: Date): Exclude<BnplHandoffState, { kind: 'missing' }>[] {
  return data.liabilities
    .filter((l) => l.type === 'bnpl')
    .map((l) => resolveBnplHandoffState(data, l.id, today))
    .filter((s): s is Exclude<BnplHandoffState, { kind: 'missing' }> => s.kind !== 'missing' && s.kind !== 'paid_off');
}
