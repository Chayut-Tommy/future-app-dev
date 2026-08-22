// Nolie Design 5.1 Wave 9a — calculator input presentation state.
//
// PRESENTATION ONLY. This module decides what a calculator SCREEN may show
// for what was typed — nothing here computes a financial result, and no
// engine (compoundCalculator.ts, homeLoanCalculator.ts, emergencyFund.ts,
// savingsCoach.ts) is changed by it or reads from it.
//
// Why it exists: all four calculator screens previously ran raw input
// through `parseFloat(x) || 0`, which silently converts an empty, malformed
// or non-finite entry into a fabricated zero and then presents "$0" or
// "0 months" as if it were a computed result. Design 5.1 requires the
// opposite: incomplete or unreadable input shows calm guidance and NO
// result figure, and a zero may appear only when the input genuinely is a
// valid zero.
//
// Money validity is decided EXCLUSIVELY by the shared strict grammar in
// money.ts (parseMoneyInput / parseMoneyInputAllowZero) — imported, never
// re-implemented, widened or narrowed. This module adds only the
// empty/invalid/valid classification around it, plus the same classification
// for the plain non-money numbers calculators also take (a rate in percent,
// a term in years), which the money grammar deliberately does not govern.
//
// Pure and RN-free so the legacy tsx harness imports and executes it for
// real.

import { parseMoneyInput, parseMoneyInputAllowZero } from './money';

export type CalculatorFieldState =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'valid'; value: number };

/** Classify a typed monetary amount via the shared strict money grammar. */
export function classifyMoneyInput(raw: string, options: { allowZero?: boolean } = {}): CalculatorFieldState {
  if (raw.trim() === '') return { status: 'empty' };
  const parsed = options.allowZero ? parseMoneyInputAllowZero(raw) : parseMoneyInput(raw);
  if (!parsed.valid) return { status: 'invalid' };
  return { status: 'valid', value: parsed.amount };
}

/** Digits with an optional decimal tail — same shape discipline as the
 * money grammar (no sign, no exponent, no trailing garbage), but without
 * the two-decimal cents cap, because a rate like "5.125" is a legitimate
 * percentage even though it is not a legitimate dollar amount. */
const STRICT_NUMBER_RE = /^(\d+(\.\d*)?|\.\d+)$/;

/**
 * Classify a typed plain number (an interest rate in percent, a term in
 * years). `allowZero` mirrors the money helpers: a 0% rate is a real
 * scenario both engines support explicitly, while a 0-year term has no
 * meaningful estimate to show, so each field declares which it is.
 */
export function classifyNumberInput(raw: string, options: { allowZero?: boolean } = {}): CalculatorFieldState {
  const trimmed = raw.trim();
  if (trimmed === '') return { status: 'empty' };
  if (!STRICT_NUMBER_RE.test(trimmed)) return { status: 'invalid' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { status: 'invalid' };
  if (!options.allowZero && value <= 0) return { status: 'invalid' };
  return { status: 'valid', value };
}

export type CalculatorReadiness = 'ready' | 'incomplete' | 'invalid';

/** One decision for the whole input set: any unreadable field blocks the
 * result and names the problem; otherwise any empty field means "not yet";
 * only a fully valid set is ready. Order matters — an invalid field must
 * win over an empty one, so the guidance says "fix" before "fill". */
export function combineCalculatorFields(fields: readonly CalculatorFieldState[]): CalculatorReadiness {
  if (fields.some((f) => f.status === 'invalid')) return 'invalid';
  if (fields.some((f) => f.status === 'empty')) return 'incomplete';
  return 'ready';
}

/**
 * The message a plain-number field shows on blur, or `null` for "say
 * nothing". Mirrors describeMoneyInput's contract exactly (empty optional
 * fields are silent; branches only describe a decision classifyNumberInput
 * already made) so the two field kinds never argue in different voices.
 */
export function describeNumberInput({ raw, allowZero = false, required = false, unit }: {
  raw: string;
  allowZero?: boolean;
  required?: boolean;
  /** Names the thing in the guidance, e.g. "rate" or "number of years". */
  unit: string;
}): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return required ? `Enter a ${unit}.` : null;
  const state = classifyNumberInput(trimmed, { allowZero });
  if (state.status === 'valid') return null;
  if (/[^0-9.]/.test(trimmed)) return `A ${unit} can only use numbers and a decimal point.`;
  if ((trimmed.match(/\./g) ?? []).length > 1) return 'Use a single decimal point.';
  if (!allowZero && /^0*(\.0*)?$/.test(trimmed)) return `Enter a ${unit} greater than zero.`;
  return `That doesn't look like a ${unit} yet.`;
}

/** The calm line shown in place of a result while the input set is not
 * ready. Guidance, not an error: nothing is wrong with taking your time. */
export function calculatorGuidance(readiness: CalculatorReadiness): string | null {
  if (readiness === 'incomplete') return 'Fill in the fields above to see an estimate.';
  if (readiness === 'invalid') return 'Check the highlighted fields — one of the numbers can’t be read yet.';
  return null;
}
