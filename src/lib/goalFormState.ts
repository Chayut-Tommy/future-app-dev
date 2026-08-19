/**
 * Nolie Design 5.1 Wave 4 closure — the shared goal-form rules.
 *
 * Pure and RN-free, so both the create adapter (`AddGoalModal`) and the edit
 * adapter (`GoalDetailSheet`) run the SAME logic and the whole matrix is
 * testable under plain tsx. It stores nothing, calculates no money and owns
 * no persistence: `requiredMonthlyForGoal`, the allocation engine and the
 * Goal model are untouched.
 *
 * Two corrections live here, both from the final iOS recording.
 */

import { LifeGoalType } from '../types/models';

/** The purposes, and the standard name each one generates. One list, shared
 * by create and edit, so the two can never drift. */
export const GOAL_PURPOSES: { value: LifeGoalType; label: string }[] = [
  { value: 'house_deposit', label: 'Buy property' },
  { value: 'holiday', label: 'Travel' },
  { value: 'investment_target', label: 'Build wealth' },
  { value: 'debt_payoff', label: 'Pay debt' },
  { value: 'financial_freedom', label: 'Financial freedom' },
  { value: 'emergency_fund', label: 'Emergency fund' },
  { value: 'car', label: 'New car' },
  { value: 'custom', label: 'Custom' },
];

export function goalPurposeLabel(purpose: LifeGoalType | null): string | null {
  if (!purpose) return null;
  return GOAL_PURPOSES.find((p) => p.value === purpose)?.label ?? null;
}

// ---------------------------------------------------------------------------
// 1. The generated-name rule
// ---------------------------------------------------------------------------

/**
 * The recorded defect: selecting `Buy property` auto-filled the name, and
 * then selecting `New car` left the stale "Buy property" behind, because the
 * old rule only filled an EMPTY name (`if (!name.trim()) setName(label)`).
 *
 * The corrected rule keeps a customer's own words sacred while letting an
 * untouched default follow the purpose:
 *
 *   - an empty name always takes the new purpose's default;
 *   - a name still exactly equal to the PREVIOUS purpose's default is itself
 *     a default, so it is replaced;
 *   - anything else is the customer's, and is never overwritten.
 *
 * Deterministic and stateless: it is derived from the two purposes and the
 * current text, so switching back and forth before any manual edit always
 * lands on the right default, and no "was this generated?" flag has to be
 * invented or persisted.
 */
export function resolveGoalNameOnPurposeChange(input: {
  currentName: string;
  previousPurpose: LifeGoalType | null;
  nextPurpose: LifeGoalType;
}): string {
  const nextLabel = goalPurposeLabel(input.nextPurpose) ?? '';
  const trimmed = input.currentName.trim();
  if (trimmed === '') return nextLabel;
  const previousLabel = goalPurposeLabel(input.previousPurpose);
  if (previousLabel !== null && trimmed === previousLabel) return nextLabel;
  // The customer typed this. It stays, whatever they choose next.
  return input.currentName;
}

/**
 * Whether a name is still one this form generated — used by the edit adapter
 * to decide whether a SAVED name may follow a purpose change.
 *
 * A saved goal's name is treated as customer-owned unless it exactly matches
 * its own saved purpose's default, which is the only evidence available
 * without persisting a flag the model does not have. That is deliberately
 * conservative: the failure mode is "we kept the customer's name", never "we
 * overwrote it".
 */
export function isGeneratedGoalName(name: string, purpose: LifeGoalType | null): boolean {
  const label = goalPurposeLabel(purpose);
  return label !== null && name.trim() === label;
}

// ---------------------------------------------------------------------------
// 2. Progress and pace presentation
// ---------------------------------------------------------------------------

export type GoalProgressState =
  /** A real target exists, so a percentage is meaningful. */
  | { kind: 'measured'; fraction: number }
  /** No usable target — there is no denominator, so there is no percentage.
   * Reporting 0% here says "you have made no progress", which is a claim the
   * data does not support. */
  | { kind: 'no-target' };

/**
 * The recorded defect: a goal with no target amount displayed `0%`, because
 * the sheet computed `goal.targetAmount ? current / target : 0` and handed
 * that 0 straight to the progress ring.
 */
export function resolveGoalProgressState(targetAmount: number | null | undefined, currentAmount: number): GoalProgressState {
  if (targetAmount === null || targetAmount === undefined) return { kind: 'no-target' };
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return { kind: 'no-target' };
  const fraction = currentAmount / targetAmount;
  return { kind: 'measured', fraction: Number.isFinite(fraction) ? fraction : 0 };
}

export type GoalPaceMessage =
  /** The engine has everything it needs and reports the goal on track. */
  | { kind: 'on-track'; requiredMonthly: number; basis: 'target-date' }
  /** The engine has everything it needs and reports a genuine shortfall. */
  | { kind: 'behind'; projectedCompletionLabel: string | null }
  /** Not enough was stated to say anything about pace. */
  | { kind: 'needs-target-date' }
  | { kind: 'needs-target-amount' }
  /** Nothing to say — e.g. the goal is already complete. */
  | { kind: 'none' };

/**
 * The recorded defect: a goal with a target AMOUNT but no target DATE
 * displayed "At your current pace, this goal may take longer."
 *
 * Root cause: `requiredMonthlyForGoal` divides by `monthsUntil(targetDate)`,
 * which falls back to a three-year planning horizon when no date is set. The
 * sheet then showed the caution whenever the allocation engine reported the
 * goal not fully funded against that INVENTED horizon — a warning about a
 * deadline the customer never gave.
 *
 * The caution is now gated on a real, customer-stated target date. No
 * formula is recreated here: the engine's own `requiredMonthly` and
 * `isFullyFunded` are passed in and simply not consulted when the inputs
 * they depend on were never supplied.
 */
export function resolveGoalPaceMessage(input: {
  targetAmount: number | null | undefined;
  targetDate: string | null | undefined;
  /** From the shared engine — never recomputed here. */
  requiredMonthly: number;
  /** From the shared allocation engine. `undefined` when this goal has no
   * allocation entry at all. */
  isFullyFunded: boolean | undefined;
  projectedCompletionLabel: string | null | undefined;
}): GoalPaceMessage {
  if (input.targetAmount === null || input.targetAmount === undefined || input.targetAmount <= 0) {
    return { kind: 'needs-target-amount' };
  }
  // THE GATE. Without a stated date there is no pace to be behind.
  if (!input.targetDate) return { kind: 'needs-target-date' };
  if (input.requiredMonthly <= 0) return { kind: 'none' };
  if (input.isFullyFunded === false) {
    return { kind: 'behind', projectedCompletionLabel: input.projectedCompletionLabel ?? null };
  }
  return { kind: 'on-track', requiredMonthly: input.requiredMonthly, basis: 'target-date' };
}

// ---------------------------------------------------------------------------
// 3. The shared, LIVE pace summary (Wave 4 closure)
// ---------------------------------------------------------------------------

/**
 * The recorded defect: creating a $2,000 goal with no date showed a helpful
 * "$56/month" three-year planning guide, but opening that SAME goal in edit
 * mode showed only "Add a target date to see a pace estimate." — and picking
 * January 2027 in the editor changed nothing until Save.
 *
 * Two causes, both wiring:
 *
 *  - the edit sheet's preview read the SAVED goal rather than the live draft,
 *    so a draft date could not move the number;
 *  - the two surfaces described the same situation with different copy,
 *    because each authored its own.
 *
 * This is the one summary both now derive from the current DRAFT. It calls
 * the shared `requiredMonthlyForGoal` engine — the three-year fallback, the
 * remaining-amount subtraction and the month arithmetic all stay inside it —
 * and adds nothing but wording.
 */
export type GoalPaceSummary =
  /** No usable target amount: nothing to pace. */
  | { kind: 'needs-target-amount'; message: string }
  /** A target but no date: the engine's own three-year planning horizon,
   * labelled honestly as a guide rather than a personalised estimate. */
  | { kind: 'planning-guide'; monthly: number; message: string; hint: string }
  /** A target and a real future date: the live estimate. A caution may
   * SUPPLEMENT this, never replace it. */
  | { kind: 'estimate'; monthly: number; message: string; caution: string | null }
  /** The date is half-entered or invalid — the caller's existing validation
   * owns that message, and no pace is invented. */
  | { kind: 'invalid-date' }
  /** Nothing useful to say (e.g. the goal is already complete). */
  | { kind: 'none' };

/** The engine's own no-date horizon, restated only for the guide's wording.
 * Kept as a named constant so the copy can never drift from the engine. */
export const GOAL_PLANNING_HORIZON_YEARS = 3;

export interface GoalPaceDraft {
  /** The live draft target amount, already parsed, or null when unusable. */
  targetAmount: number | null;
  /** The live draft target date, or null when none is set. */
  targetDate: string | null;
  /** Whether the draft date is currently usable. */
  dateState: 'empty' | 'valid' | 'partial' | 'invalid' | 'past';
  /** Progress already recorded against this goal — 0 while creating. */
  currentAmount: number;
  /** From the shared allocation engine, when this goal has an entry. A
   * caution is only ever raised from a real, stated date. */
  isFullyFunded?: boolean;
  projectedCompletionLabel?: string | null;
}

/**
 * `computeRequiredMonthly` is injected rather than imported so this module
 * stays free of any engine import cycle; every caller passes the real
 * `requiredMonthlyForGoal`, and the tests assert that they do.
 */
export function resolveGoalPaceSummary(
  draft: GoalPaceDraft,
  computeRequiredMonthly: (input: { targetAmount: number | null; targetDate: string | null; currentAmount: number }) => number
): GoalPaceSummary {
  if (draft.targetAmount === null || !Number.isFinite(draft.targetAmount) || draft.targetAmount <= 0) {
    return { kind: 'needs-target-amount', message: 'Add a target amount to see a monthly estimate.' };
  }
  if (draft.dateState === 'partial' || draft.dateState === 'invalid' || draft.dateState === 'past') {
    return { kind: 'invalid-date' };
  }

  const remaining = draft.targetAmount - draft.currentAmount;
  if (remaining <= 0) return { kind: 'none' };

  const hasDate = draft.dateState === 'valid' && !!draft.targetDate;
  const monthly = computeRequiredMonthly({
    targetAmount: draft.targetAmount,
    targetDate: hasDate ? draft.targetDate : null,
    currentAmount: draft.currentAmount,
  });
  if (!Number.isFinite(monthly) || monthly <= 0) return { kind: 'none' };

  if (!hasDate) {
    return {
      kind: 'planning-guide',
      monthly,
      message: `Planning guide: ${formatPaceMoney(monthly)}/month based on ${GOAL_PLANNING_HORIZON_YEARS} years`,
      hint: 'Add a target date for a personalised estimate.',
    };
  }

  // A caution SUPPLEMENTS the number; it never replaces it. That is the
  // difference from the previous behaviour, where a behind-pace verdict
  // swallowed the estimate entirely.
  const caution =
    draft.isFullyFunded === false
      ? `At your current pace this may take longer.${draft.projectedCompletionLabel ? ` You can reach it around ${draft.projectedCompletionLabel}.` : ''}`
      : null;

  return {
    kind: 'estimate',
    monthly,
    message: `Estimated monthly goal amount: ${formatPaceMoney(monthly)}`,
    caution,
  };
}

/** Whole-dollar money wording, matching what both goal surfaces already
 * rendered. Presentation only — it rounds for display and never feeds a
 * calculation. */
function formatPaceMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}
