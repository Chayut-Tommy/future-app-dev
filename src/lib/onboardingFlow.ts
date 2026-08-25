/**
 * Nolie Design 5.1 Wave 9c — the pure onboarding state contract.
 *
 * WHY THIS MODULE EXISTS. The previous flow kept its journey implicit in a
 * component union type, which allowed two structural defects to ship:
 * a "Skip for now" on the NAME step that completed onboarding outright,
 * and a shared user-patch builder that stamped `disclosureAcknowledgedAt`
 * on every exit path — so skipping recorded consent to a disclosure the
 * customer had never seen. Making the journey a pure, exported, exhaustively
 * testable contract makes both defects unrepresentable:
 *
 *   - there are exactly SEVEN states, indexed 0-6;
 *   - the only Skip destination is the disclosure state, via ONE shared
 *     resolver (`skipDestination`), and only states 3-5 may skip;
 *   - the disclosure state itself can never skip;
 *   - consent is a separate input to the completion payload, supplied only
 *     by the disclosure state's own checkbox.
 *
 * RN-free so the legacy harness runs the real contract, not a mirror.
 */

import { PayFrequency } from '../types/models';

/** The seven states, in journey order. Index IS the state number (0-6). */
export const ONBOARDING_STEPS = ['welcome', 'preview', 'name', 'age', 'cadence', 'setup', 'disclosure'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** Truthful spoken/visible progress — `Step N of 7`. */
export function progressLabel(step: OnboardingStep): string {
  return `Step ${stepIndex(step) + 1} of ${ONBOARDING_STEP_COUNT}`;
}

/** The next state in journey order; the disclosure state is terminal. */
export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = stepIndex(step);
  return i >= ONBOARDING_STEP_COUNT - 1 ? 'disclosure' : ONBOARDING_STEPS[i + 1];
}

/** The previous state, for Back; welcome is the floor. Drafts are held in
 * component state, so moving back never discards them. */
export function previousStep(step: OnboardingStep): OnboardingStep {
  const i = stepIndex(step);
  return i <= 0 ? 'welcome' : ONBOARDING_STEPS[i - 1];
}

/** ONLY the three optional questions may skip. Welcome/preview advance,
 * name is required, and the disclosure is mandatory. */
export const SKIPPABLE_STEPS: readonly OnboardingStep[] = ['age', 'cadence', 'setup'];

export function canSkip(step: OnboardingStep): boolean {
  return SKIPPABLE_STEPS.includes(step);
}

/**
 * THE one shared Skip path. Every displayed Skip action must route through
 * this: a skippable state jumps DIRECTLY to the disclosure — never to the
 * next optional question — and every other state has no Skip destination
 * at all.
 */
export function skipDestination(step: OnboardingStep): OnboardingStep | null {
  return canSkip(step) ? 'disclosure' : null;
}

// ---------------------------------------------------------------------------
// Field validation — mirrors the established app contracts exactly.
// ---------------------------------------------------------------------------

/** Name: required, trimmed, non-empty — the same rule the previous flow's
 * Continue gate applied (`name.trim().length === 0` disabled it). */
export function isValidName(raw: string): boolean {
  return raw.trim().length > 0;
}

/** Age: optional. When entered it must parse the way EditProfileModal
 * already persists it — `parseInt`, kept only when a positive integer.
 * Returns undefined for anything else so a skipped/invalid age is ABSENT,
 * never zero or defaulted. */
export function parseOptionalAge(raw: string): number | undefined {
  if (raw.trim().length === 0) return undefined;
  const value = parseInt(raw, 10);
  return !isNaN(value) && value > 0 ? value : undefined;
}

/** Whether the age input is acceptable to CONTINUE with: empty (optional)
 * or a valid positive integer. A non-empty invalid entry blocks Continue
 * rather than being silently dropped. */
export function isAcceptableAgeInput(raw: string): boolean {
  return raw.trim().length === 0 || parseOptionalAge(raw) !== undefined;
}

/** The exact structured cadence enum and labels already established by the
 * repository (AddIncomeModal's FREQUENCIES — same values, same labels).
 * Never derived from occupation or displayed copy. */
export const ONBOARDING_CADENCES: readonly { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'irregular', label: 'Irregular recurring' },
];

// ---------------------------------------------------------------------------
// Approved copy — factual, no outcome promises, no AI coaching claim.
// ---------------------------------------------------------------------------

export const PREVIEW_COPY = {
  heading: 'A clearer view of your everyday money.',
  body: "See what you've recorded, what's coming up and how the pieces fit together.",
} as const;

/** The calm inline failure copy for an atomic completion that could not be
 * persisted. Never implies partial data was saved. */
export const COMPLETION_FAILURE_COPY = "We couldn't finish setting up Nolie. Nothing was saved. Try again.";
