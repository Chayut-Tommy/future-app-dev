/**
 * Nolie Design 5.1 Wave 4 — the words a currency field says when what was
 * typed is not a valid amount.
 *
 * Pure and RN-free so the whole message matrix is testable under plain
 * `npx tsx`, and deliberately SEPARATE from the grammar itself: validity is
 * decided exclusively by `parseMoneyInput` / `parseMoneyInputAllowZero` in
 * src/lib/calculations/money.ts, which this module imports and never
 * re-implements, widens or narrows. The strict money grammar is unchanged by
 * Wave 4 — `tests/money-parsing.test.ts` remains the authority on it, and
 * this module adds only presentation.
 *
 * Design 5.1 doc A p.11: the field explains the problem in words rather than
 * shaking, flashing red mid-keystroke, or silently discarding the input.
 */
import { parseMoneyInput, parseMoneyInputAllowZero } from '../../../lib/calculations/money';

export interface MoneyFieldMessageInput {
  /** Exactly what the customer typed, untrimmed. */
  raw: string;
  /** Whether a genuinely zero amount is acceptable for this field. Mirrors
   * the caller's choice of shared parser and nothing else. */
  allowZero: boolean;
  /** Whether the field is required. An empty required field is described;
   * an empty optional field is silent. */
  required: boolean;
}

/**
 * The message to show, or `null` for "say nothing".
 *
 * Never called while typing — only on blur — so a customer part-way through
 * "12" on the way to "120.50" is never told they are wrong.
 */
export function describeMoneyInput({ raw, allowZero, required }: MoneyFieldMessageInput): string | null {
  const trimmed = raw.trim();

  if (trimmed === '') return required ? 'Enter an amount.' : null;

  const parsed = allowZero ? parseMoneyInputAllowZero(trimmed) : parseMoneyInput(trimmed);
  if (parsed.valid) return null;

  // The grammar rejected it. Name the actual reason rather than a generic
  // "invalid" — these branches only DESCRIBE a decision already made above;
  // none of them can make a rejected value acceptable.
  if (/[^0-9.]/.test(trimmed)) return 'Amounts can only use numbers and a decimal point.';
  if ((trimmed.match(/\./g) ?? []).length > 1) return 'Use a single decimal point.';
  if (/\.\d{3,}$/.test(trimmed)) return 'Amounts go to cents — at most two digits after the decimal point.';
  if (!allowZero && /^0*(\.0{0,2})?$/.test(trimmed)) return 'Enter an amount greater than zero.';
  return "That doesn't look like an amount yet.";
}
