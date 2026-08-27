/**
 * Wave 11 — the shared PURE financial spoken-string authority for
 * presentation surfaces. Complements (never duplicates) the approved
 * spoken contracts already living beside their engines in the protected
 * calculation modules (`spokenWealthAmount`/`composeNetWorthAnnouncement`
 * in wealthComposition, the pay-cycle/balance `spoken` fields in
 * moneyComposition, `accountChoiceAccessibilityLabel` in accountChoice) —
 * those remain the authorities for their own surfaces.
 *
 * Contracts, per the Design 5.1 Motion and Accessibility source:
 * - built from STRUCTURED values, never parsed from rendered visual text
 *   (the one display-string helper below only rewrites a sign glyph a
 *   screen reader would skip, changing no content);
 * - explicit direction words — "minus"/"income"/"expense" — never a bare
 *   glyph or a colour;
 * - an invalid or unavailable value says so; it is NEVER fabricated as
 *   zero;
 * - no duplicate reading of symbol, dollars and cents;
 * - factual only — no advice, no credit-score implication.
 *
 * RN-free so every rule is directly executable evidence.
 */

/** Whether a number can be spoken as a real amount at all. */
function isSpeakable(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A currency value said aloud: whole dollars ("42 dollars"), cents only
 * when they exist ("42 dollars and 5 cents"), negative as the word
 * "minus". Unavailable/invalid input is said as such — never zero.
 */
export function spokenCurrency(value: number): string {
  if (!isSpeakable(value)) return 'amount not available';
  const abs = Math.abs(value);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100);
  const base =
    cents > 0
      ? `${dollars.toLocaleString()} dollars and ${cents} ${cents === 1 ? 'cent' : 'cents'}`
      : `${dollars.toLocaleString()} dollars`;
  return value < 0 ? `minus ${base}` : base;
}

/**
 * A leading minus glyph on an ALREADY-FORMATTED display amount, rewritten
 * as the word "minus" so a screen reader cannot skip it or read a hyphen.
 * The visible string is untouched; nothing else is parsed or altered.
 * (Consolidated from SafeToSpendHero's former local helper, verbatim.)
 */
export function spokenSignedDisplay(display: string): string {
  return display.replace(/^[-−]/, 'minus ');
}

/** One transaction row, spoken once: direction, name, amount, category,
 * date, and any repayment badge — the figure exactly once. */
export function transactionAccessibilityLabel(input: {
  type: 'income' | 'expense';
  label: string | null;
  amount: number;
  categoryName: string;
  dateLabel: string;
  badgeLabel?: string | null;
}): string {
  const direction = input.type === 'income' ? 'Income' : 'Expense';
  const name = input.label ? `${input.label}. ` : '';
  const badge = input.badgeLabel ? ` ${input.badgeLabel}.` : '';
  return `${direction}. ${name}${spokenCurrency(input.amount)}. ${input.categoryName}, ${input.dateLabel}.${badge}`;
}

/** A month group's summary, spoken once with direction words — never the
 * +/− glyphs or the green/red colour the visual row uses. */
export function monthSummaryAccessibilityLabel(input: { income: number; expenses: number; net: number }): string {
  const netWord = input.net < 0 ? `minus ${spokenCurrency(Math.abs(input.net))}` : spokenCurrency(input.net);
  return `Income ${spokenCurrency(input.income)}. Expenses ${spokenCurrency(input.expenses)}. Net ${netWord}.`;
}

/** A month disclosure header: name, then its open/closed state. */
export function monthHeaderAccessibilityLabel(monthLabel: string, expanded: boolean): string {
  return `${monthLabel}. ${expanded ? 'Expanded' : 'Collapsed'}.`;
}
