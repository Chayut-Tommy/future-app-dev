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
 * Shared string-to-cents conversion for both parseMoneyInput and
 * parseMoneyInputAllowZero below — format validity is decided entirely by
 * STRICT_MONEY_RE against the trimmed string, and the numeric conversion
 * itself splits on '.' and combines the two digit strings with plain
 * integer arithmetic, never a floating-point multiply-by-100 (the exact
 * operation that can't be trusted to round-trip cleanly for values like
 * 120.1234 in the first place — there is no such value to round here,
 * since the regex already rejected it). Returns `undefined` for a
 * malformed string or a cents value that overflows Number.isSafeInteger;
 * callers decide their own lower-bound (zero-exclusive vs. zero-inclusive).
 */
function parseCentsFromString(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!STRICT_MONEY_RE.test(trimmed)) return undefined;

  const [wholePart, fractionalPart = ''] = trimmed.split('.');
  const wholeDigits = wholePart === '' ? '0' : wholePart;
  const fractionalDigits = fractionalPart.padEnd(2, '0');
  const cents = Number(wholeDigits) * 100 + Number(fractionalDigits);

  if (!Number.isSafeInteger(cents)) return undefined;
  return cents;
}

/**
 * Parses a raw, user-typed monetary string into integer cents. Deliberately
 * never routes through parseFloat for the actual conversion (which would
 * silently accept everything this function must reject) — see
 * `parseCentsFromString`'s own doc comment for the grammar/conversion
 * rules. Rejects a zero or negative amount — the correct behaviour for
 * every existing caller of this function (Goal target amount, Income
 * amount, Bill amount), all of which require a genuinely positive value.
 * Never widen this function's own zero-rejection to accommodate a new
 * caller — see `parseMoneyInputAllowZero` below for that.
 */
export function parseMoneyInput(raw: string): ParsedMoneyInput {
  const cents = parseCentsFromString(raw);
  if (cents === undefined) return { valid: false };
  if (cents <= 0) return { valid: false };
  return { valid: true, amount: cents / 100, cents };
}

/**
 * Everyday Account correction (2026-08-08) — identical grammar and
 * conversion to `parseMoneyInput` (same `STRICT_MONEY_RE`, same
 * `parseCentsFromString`), differing ONLY in accepting a genuinely zero
 * amount: `cents === 0` is valid here, `cents < 0` never occurs (the
 * regex has no sign branch, so a negative amount is already unreachable
 * by construction — this is not a separate negative-rejection check, the
 * grammar itself makes negative input malformed, same as parseMoneyInput).
 * Scoped to the three liquid-balance forms (Cash, Savings, Everyday
 * Account) that share one balance-entry branch in AddWealthItemModal.tsx
 * and must not diverge in parsing behaviour within that shared branch —
 * never use this for Goal/Income/Bill amounts, which must keep requiring
 * a positive value via `parseMoneyInput` above, unchanged.
 */
export function parseMoneyInputAllowZero(raw: string): ParsedMoneyInput {
  const cents = parseCentsFromString(raw);
  if (cents === undefined) return { valid: false };
  if (cents < 0) return { valid: false };
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

/**
 * Pass C.1 — the ONE money formatter for the Available-Until-Payday card's
 * dominant figures, in BOTH modes. Rounds to whole cents first (so a float
 * like 5117.9999 never leaks), then shows NO fractional part when the value
 * is a whole number of dollars ("$5,118") and exactly two places when it
 * genuinely has cents ("$5,118.42"). This is what keeps the card from
 * inconsistently alternating between "$5,118" and "$5,118.00" while still
 * preserving non-zero cents where they materially exist. Sign-aware; a
 * non-finite input is shown as "$0" rather than "$NaN".
 */
export function formatDollarsCentsAware(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const cents = Math.round(value * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac === 0
    ? `${sign}$${whole.toLocaleString()}`
    : `${sign}$${whole.toLocaleString()}.${String(frac).padStart(2, '0')}`;
}

/** Cents-native sibling of `formatDollarsCentsAware` for the Pass B engine's
 * exact-integer-cent outputs (never re-introduces float rounding). */
export function formatCentsCentsAware(cents: number): string {
  if (!Number.isFinite(cents)) return '$0';
  return formatDollarsCentsAware(Math.round(cents) / 100);
}
