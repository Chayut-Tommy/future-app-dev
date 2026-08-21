// Nolie Design 5.1 Wave 6 — Money's visible composition, as pure decisions.
//
// Presentation only. Every figure this module touches has ALREADY been
// decided by an engine (safeToSpend, moneyTimeline, monthlySummary,
// moneyPlan, moneyFlowBreakdown, savingsAllocation); nothing here
// calculates, re-derives, re-rounds or reconciles money. What it decides is
// SHAPE and WORDS: how far through a pay cycle today sits, what one line of
// provenance a measure carries, and how a row reflows.
//
// It lives beside the engines rather than inside a component for the same
// two reasons todayComposition.ts does: the rendered harness can only mount
// a handful of roots per file, so a decision made inside a component is
// provable at exactly one width; and one source of truth means the hero,
// the payday bar and the balances row cannot disagree.
//
// Pure and RN-free.

import { designLayout } from '../../theme/semanticTokens';
import { MINUS_SIGN } from './todayComposition';

// ---------------------------------------------------------------------------
// Screen geometry
// ---------------------------------------------------------------------------

/** Design 5.1: 20pt screen margins, 16pt at compact width (<=360pt). */
export function moneyScreenMargin(windowWidth: number): number {
  return windowWidth <= designLayout.breakpoints.compactMax
    ? designLayout.screenMarginCompact
    : designLayout.screenMargin;
}

/** The same accessibility threshold Today reflows on, reused so the two
 * screens break at the same place rather than each choosing a number. */
export const ACCESSIBILITY_TEXT_THRESHOLD = 1.3;

export function isAccessibilityText(fontScale: number): boolean {
  return fontScale >= ACCESSIBILITY_TEXT_THRESHOLD;
}

/** The leading marker tile on a Money row — one size across the payday
 * bar, the balances row and the timeline, so the page has a single left
 * rhythm. Matches Today's own row tile. */
export const MONEY_ROW_ICON_TILE_SIZE = 28;

// ---------------------------------------------------------------------------
// The payday progress bar
// ---------------------------------------------------------------------------

export interface PaydayProgress {
  /** 0..1, clamped. Never NaN, never outside bounds. */
  fraction: number;
  /** Formatted cycle start, or null when there is no genuine cycle to show. */
  startLabel: string | null;
  /** Formatted next payday. */
  endLabel: string | null;
  /** Whole days from today to the next payday, as the engine reported it. */
  daysRemaining: number;
  /** True when no payday is genuinely known. The bar then shows no
   * progress and says so — it never invents a cycle to fill. */
  unknown: boolean;
  /** True when the cycle boundaries were assumed rather than stated by the
   * customer. Design 5.1 requires an estimate to say it is an estimate. */
  estimated: boolean;
  /** One complete sentence carrying everything the bar conveys visually —
   * a screen reader never has to assemble it from parts. */
  spoken: string;
}

/** "Fri 28 Aug" — the same weekday/day/month convention Today's own rows
 * use, so a date reads identically on both screens. */
export function formatMoneyDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * How far through the current pay cycle today sits.
 *
 * Every input is read straight off the SafeToSpendResult the hero is
 * already showing — `cycleStart`, `cycleEnd`, `daysRemaining`,
 * `hasKnownPayday`. There is NO local date arithmetic beyond dividing the
 * elapsed span by the total span to obtain a fraction, and no payday is
 * ever inferred: without a known payday the bar reports `unknown` and
 * shows nothing rather than filling an invented cycle.
 */
export function resolvePaydayProgress(input: {
  cycleStart: Date;
  cycleEnd: Date;
  daysRemaining: number;
  hasKnownPayday: boolean;
  today: Date;
}): PaydayProgress {
  const { cycleStart, cycleEnd, daysRemaining, hasKnownPayday, today } = input;

  if (!hasKnownPayday) {
    return {
      fraction: 0,
      startLabel: null,
      endLabel: null,
      daysRemaining: 0,
      unknown: true,
      estimated: false,
      spoken: 'Next payday not recorded yet. Add your payday to see how far through your pay cycle you are.',
    };
  }

  const startMs = cycleStart.getTime();
  const endMs = cycleEnd.getTime();
  const nowMs = today.getTime();
  const span = endMs - startMs;

  // A non-positive or non-finite span cannot describe a cycle. Report it
  // honestly rather than dividing by zero into NaN or Infinity.
  if (!Number.isFinite(span) || span <= 0) {
    return {
      fraction: 0,
      startLabel: null,
      endLabel: Number.isFinite(endMs) ? formatMoneyDate(cycleEnd) : null,
      daysRemaining: Number.isFinite(daysRemaining) ? Math.max(0, daysRemaining) : 0,
      unknown: true,
      estimated: false,
      spoken: 'Your pay cycle dates are not clear enough to show progress yet.',
    };
  }

  const raw = (nowMs - startMs) / span;
  const fraction = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
  const days = Number.isFinite(daysRemaining) ? Math.max(0, Math.round(daysRemaining)) : 0;
  const startLabel = formatMoneyDate(cycleStart);
  const endLabel = formatMoneyDate(cycleEnd);
  const dayWord = days === 1 ? 'day' : 'days';

  return {
    fraction,
    startLabel,
    endLabel,
    daysRemaining: days,
    unknown: false,
    // The cycle START is always derived from the payday minus the pay
    // frequency's own length — the customer states a payday, not a cycle
    // start — so it is an estimate and must say so.
    estimated: true,
    spoken: `Pay cycle from ${startLabel} to ${endLabel}. ${days} ${dayWord} until your next payday. Cycle start is an estimate based on how often you are paid.`,
  };
}

// ---------------------------------------------------------------------------
// The included-balances row
// ---------------------------------------------------------------------------

export interface IncludedBalancesSummary {
  /** How many accounts currently count toward the estimate. */
  count: number;
  /** Already formatted whole dollars, or null when there is nothing to
   * total — never "$0" standing in for "none selected". */
  totalLabel: string | null;
  empty: boolean;
  spoken: string;
}

/**
 * Describes which balances feed Available Until Payday.
 *
 * Reads the engine's own `includedMoneyBalanceAccounts` breakdown and its
 * `includedMoneyBalance` total. It does not sum, filter or default
 * anything: inclusion rules and their persistence belong to the engine and
 * to SelectBalancesSheet, both untouched.
 */
export function summariseIncludedBalances(
  accounts: readonly { id: string; label: string; value: number }[],
  total: number
): IncludedBalancesSummary {
  const count = accounts.length;
  if (count === 0) {
    return {
      count: 0,
      totalLabel: null,
      empty: true,
      spoken: 'No balances included yet. Choose which balances count toward your available amount.',
    };
  }
  const totalLabel = Number.isFinite(total) ? `$${Math.round(total).toLocaleString()}` : null;
  const accountWord = count === 1 ? 'balance' : 'balances';
  return {
    count,
    totalLabel,
    empty: false,
    spoken: totalLabel
      ? `${count} ${accountWord} included, ${totalLabel} in total. These balances feed your available amount estimate.`
      : `${count} ${accountWord} included. These balances feed your available amount estimate.`,
  };
}

// ---------------------------------------------------------------------------
// Measure definitions — one concise line per measure
// ---------------------------------------------------------------------------

/**
 * Design 5.1 requires every Money measure to carry one concise definition
 * or provenance line, so a customer never has to guess what a number
 * counts. These are STRINGS, not calculations — each states what its
 * measure already means, in the register the product uses elsewhere:
 * factual, never advice, never a promise, never shaming.
 */
export const MONEY_MEASURE_DEFINITIONS = {
  availableUntilPayday: 'Your included balances, less the bills, savings and goals still due before payday.',
  paydayProgress: 'How far through your current pay cycle you are today.',
  includedBalances: 'Only these balances count toward your available amount. Changing them does not change your net worth.',
  thisMonth: 'What you have actually recorded so far this calendar month.',
  spendingSources: 'Which recorded accounts and cards paid for this month’s spending.',
  whatHappensNext: 'Bills, income and repayments scheduled from today onward.',
  moneyFlow: 'Your typical monthly pattern, based on recurring items you have recorded.',
  moneyPlan: 'A forecast built from your own preferences — not a guarantee, and not advice.',
} as const;

export type MoneyMeasureKey = keyof typeof MONEY_MEASURE_DEFINITIONS;

/** Every definition is one plain sentence and never claims certainty or
 * gives advice. Exported so a test can police the whole set at once rather
 * than one string at a time. */
export const MONEY_DEFINITION_BANNED_WORDS: readonly string[] = [
  'guarantee', 'guaranteed', 'should', 'must', 'advice', 'recommend',
  'safe to spend', 'will have', 'proven', 'promise',
];

// ---------------------------------------------------------------------------
// Spending sources — credit-card context
// ---------------------------------------------------------------------------

export interface SourceCardContext {
  /** The ThisMonthSpendingSource key this context belongs to. */
  sourceKey: string;
  /** Already formatted, or null when no usable balance exists. Never "$0"
   * standing in for "unknown". */
  balanceLabel: string | null;
}

export interface OtherCardBalance {
  id: string;
  label: string;
  balanceLabel: string;
}

/** Whole dollars, sign-aware. A card in credit reads with a minus, which is
 * what "you are ahead on this card" looks like on a statement. */
export function formatCardBalance(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return `${rounded < 0 ? MINUS_SIGN : ''}$${Math.abs(rounded).toLocaleString()}`;
}

/**
 * Wave 6 final refinement — attaching a card's CURRENT balance to the
 * source row that spent from it.
 *
 * The standalone "Current credit-card balance" line sat directly beneath
 * three month-to-date measures while being a present-moment snapshot, so it
 * invited exactly the misreading its own disclaimer warned about. Here the
 * two concepts sit on one row as two labelled lines — "Paid this month" and
 * "Current card balance" — where they cannot be confused.
 *
 * This is a JOIN, not a calculation: it reads each source's own stable
 * `creditCard:<id>` key and looks up that card's recorded balance. It sums
 * nothing, and the balance is never folded into any total.
 */
export function resolveSourceCardContexts(
  sources: readonly { key: string; kind: string }[],
  cards: readonly { id: string; label: string; currentBalance: number }[]
): SourceCardContext[] {
  const out: SourceCardContext[] = [];
  for (const s of sources) {
    if (s.kind !== 'credit_card') continue;
    const id = s.key.startsWith('creditCard:') ? s.key.slice('creditCard:'.length) : null;
    if (!id) continue;
    const card = cards.find((c) => c.id === id);
    // A source whose card no longer resolves keeps its row and simply
    // carries no balance line — never a fabricated one.
    out.push({ sourceKey: s.key, balanceLabel: card ? formatCardBalance(card.currentBalance) : null });
  }
  return out;
}

/**
 * Cards that carry a balance but funded none of this month's spending.
 *
 * Without this they would vanish from the product entirely once the
 * standalone This Month line was retired — the snapshot existed, and a card
 * simply not used this month is the ordinary case. They are listed
 * separately, never merged into the spending sources, and never counted.
 * A card with no usable balance is omitted rather than shown as "$0".
 */
export function resolveOtherCardBalances(
  sources: readonly { key: string; kind: string }[],
  cards: readonly { id: string; label: string; currentBalance: number }[]
): OtherCardBalance[] {
  const used = new Set(
    sources.filter((s) => s.kind === 'credit_card').map((s) => s.key.slice('creditCard:'.length))
  );
  const out: OtherCardBalance[] = [];
  for (const c of cards) {
    if (used.has(c.id)) continue;
    const balanceLabel = formatCardBalance(c.currentBalance);
    if (balanceLabel === null) continue;
    out.push({ id: c.id, label: c.label, balanceLabel });
  }
  return out;
}

/** One clarification, shown once — never repeated per row. */
export const CARD_BALANCE_DISCLOSURE =
  'Card balances are current snapshots and are not added to this month’s spending.';
