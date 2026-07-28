/**
 * A strict, from-scratch grammar for a monetary amount typed by a user —
 * deliberately NOT parseFloat, which silently accepts trailing garbage
 * ("120abc" -> 120), multiple decimal points ("1.2.3" -> 1.2), scientific
 * notation ("1e3" -> 1000), and more than two decimal digits ("120.1234"
 * -> 120.1234) with no signal that anything was dropped (regression-
 * protection review, B2.0B recurring-money precision correction §2).
 *
 * Anchored to the ENTIRE trimmed string — a partial match means outright
 * rejection, never a silently-truncated prefix. Two shapes only: digits
 * with an optional 0-2-digit decimal tail ("120", "120.5", "120.50",
 * "120."), or a bare 0-2-digit decimal with no leading digit (".50"). No
 * sign, no exponent, no more than one decimal point — by construction,
 * since neither branch allows any of those characters at all.
 */
const STRICT_MONEY_RE = /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;

export type ParsedMoneyInput = { valid: true; amount: number; cents: number } | { valid: false };

/**
 * Parses a raw, user-typed monetary string into integer cents. Deliberately
 * never routes through parseFloat for the actual conversion (which would
 * silently accept everything this function must reject) — format validity
 * is decided entirely by STRICT_MONEY_RE against the trimmed string, and
 * the numeric conversion itself splits on '.' and combines the two digit
 * strings with plain integer arithmetic, never a floating-point multiply-
 * by-100 (the exact operation that can't be trusted to round-trip cleanly
 * for values like 120.1234 in the first place — there is no such value to
 * round here, since the regex already rejected it).
 */
export function parseMoneyInput(raw: string): ParsedMoneyInput {
  const trimmed = raw.trim();
  if (!STRICT_MONEY_RE.test(trimmed)) return { valid: false };

  const [wholePart, fractionalPart = ''] = trimmed.split('.');
  const wholeDigits = wholePart === '' ? '0' : wholePart;
  const fractionalDigits = fractionalPart.padEnd(2, '0');
  const cents = Number(wholeDigits) * 100 + Number(fractionalDigits);

  if (!Number.isSafeInteger(cents)) return { valid: false };
  if (cents <= 0) return { valid: false };

  return { valid: true, amount: cents / 100, cents };
}

/** Empirically chosen, not guessed — stress-tested (Node, this round) across
 * every 2-decimal-place dollar value from $1 to $5,000,000 in 1-cent
 * increments: the worst observed IEEE-754 float noise in `value * 100` was
 * ~2.98e-8. This epsilon sits comfortably above that (no legitimate 2dp
 * value is ever falsely rejected within that generously large range) and
 * comfortably below the smallest genuinely-invalid deviation in this
 * round's required examples — 120.999999's `value * 100` sits ~9.9999e-5
 * from its nearest integer, roughly 100x larger than this epsilon, so it is
 * still correctly rejected with a wide safety margin on both sides. */
const CENTS_EPSILON = 1e-6;

export type ValidatedMoneyAmount = { valid: true; cents: number } | { valid: false };

/**
 * Defensive validator for an already-numeric amount (e.g. a stored
 * RecurringItem.amount) — used where there is no raw user-typed string to
 * re-validate, only a `number` that may or may not represent a legitimate
 * "at most 2 decimal places" monetary value.
 *
 * Deliberately NOT `Number.isInteger(Math.round(value * 100))` — that
 * expression is always true, because Math.round always returns an integer;
 * it can never detect a fractional-cent value (flagged explicitly during
 * this round's authorization as broken). Instead this compares
 * `value * 100` against its OWN nearest integer directly: a legitimate
 * 2-decimal-place value's cents representation should already be at most
 * CENTS_EPSILON away from a whole number, while a genuinely fractional-cent
 * value (120.1234, 120.999999) is not — see CENTS_EPSILON's own comment for
 * the empirical basis of the threshold.
 */
export function moneyAmountToCents(value: number): ValidatedMoneyAmount {
  if (!Number.isFinite(value) || value <= 0) return { valid: false };
  const rawCents = value * 100;
  const roundedCents = Math.round(rawCents);
  if (Math.abs(rawCents - roundedCents) > CENTS_EPSILON) return { valid: false };
  if (!Number.isSafeInteger(roundedCents)) return { valid: false };
  return { valid: true, cents: roundedCents };
}
