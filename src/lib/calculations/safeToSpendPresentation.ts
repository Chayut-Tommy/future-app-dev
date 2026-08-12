import { SafeToSpendResult, SafeToSpendHeroState, selectSafeToSpendHeroState } from './safeToSpend';
import { MoneyHeroCopy } from './moneyPersona';

/** Whole-dollar, comma-grouped Available Until Payday display formatting —
 * presentation only. Never used for exact-cent calculation or persistence;
 * those stay on the raw SafeToSpendResult numbers this function never
 * touches. Narrowly named (Pass 2A) so it cannot be mistaken for a
 * general-purpose money formatter suitable for exact-cent transaction
 * amounts elsewhere in the app (see money.ts/reminders.ts's own
 * formatDisclosureAmount for that, a deliberately different formatter). */
export function formatSafeToSpendAmount(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/** Dollars -> integer cents, defensively guarding against a non-finite
 * input (should never occur — SafeToSpendResult's own Pass 1 contract
 * guarantees every numeric field stays finite — but this presentation
 * layer never trusts that silently; a non-finite input resolves to `null`,
 * the same "not authoritative to show" signal every other missing-amount
 * state already uses). Deliberately not moneyAmountToCents (money.ts) —
 * that validator rejects `value <= 0` by design (it exists for
 * user-typed goal/income/bill amounts, which must be genuinely positive);
 * a genuine $0 Available Until Payday balance is a legitimate, authoritative
 * value here and must not be rejected. */
function toAuthoritativeCents(dollars: number): number | null {
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
}

/** Correction pass — the action every consumer of this presentation should
 * take when the user interacts with its primary (AUP) row. Every state
 * currently resolves to the same action: focus Money's existing Available
 * Until Payday section, whose own per-state CTA (Manage balances, Select
 * balances, Review in Wealth, etc. — all pre-existing, all unchanged by
 * this pass) already owns the actual recovery journey for that state. This
 * type exists so that ownership is explicit and testable on the shared
 * selector itself, rather than implicitly re-decided at each call site —
 * it deliberately does NOT introduce a second/duplicate setup route: the
 * destination is always the existing Money AUP card, never a new screen. */
export type SafeToSpendPresentationAction = { kind: 'focus_money_section'; section: 'aup' };

export interface SafeToSpendPresentation {
  heroState: SafeToSpendHeroState;
  tone: 'normal' | 'warning';
  /** The heading/eyebrow text (no icon/emoji — each consumer supplies its
   * own), matching Money's existing per-state wording exactly. For
   * no_known_payday this is always "AVAILABLE MONEY" — never "AVAILABLE
   * UNTIL PAYDAY" wording, since no payday is known to count down to. */
  heading: string;
  /** The main headline sentence for this state (e.g. "Available amount
   * unavailable", or heroCopy.amountLabel for the normal state). Always
   * present. */
  primaryCopy: string;
  /** A second, explanatory sentence — present only for the two-line states
   * (unavailable_balance_data, unavailable_other_data); `null` for every
   * single-line state. Kept as a separate field (not folded into
   * primaryCopy) so a consumer can render 1 vs 2 lines without parsing. */
  supportingCopy: string | null;
  /** The single authoritative amount for this state, in integer cents — or
   * `null` when no state may present one as genuine (missing_balance,
   * unavailable_balance_data, unavailable_other_data, recorded_overspend,
   * commitments_exceed_cash, goals_underfunded, and no_known_payday with no
   * included balance). Never NaN/Infinity/stale — SafeToSpendResult's own
   * Pass 1 finite guarantee, plus toAuthoritativeCents' own defensive
   * finite check, means this is either a genuine finite integer or `null`,
   * never anything in between. This is the authoritative value; displayAmount
   * below is always derived FROM this field, never independently rounded,
   * so the two can never drift apart. */
  amountCents: number | null;
  /** The already-formatted, whole-dollar display string for amountCents
   * (e.g. "$1,235") — derived from amountCents via formatSafeToSpendAmount,
   * never re-rounded independently. `null` exactly when amountCents is
   * `null` / amountVisible is false. */
  displayAmount: string | null;
  /** Explicit visibility flag, separate from amountCents being non-null —
   * named per the shared-contract requirement that "amount visibility" be
   * its own concern, not merely inferred from a null check by callers. In
   * this implementation the two always agree (amountVisible is true iff
   * amountCents is non-null); the separate field exists so that contract is
   * explicit and testable rather than an unstated implementation detail. */
  amountVisible: boolean;
  /** True only for no_known_payday's includedMoneyBalance reading — a
   * different field from cycleRemainingPool, shown under the distinct
   * "AVAILABLE MONEY" heading, never "until payday" wording. */
  amountIsAvailableMoney: boolean;
  /** What tapping this presentation's primary row should do — see
   * SafeToSpendPresentationAction's own doc comment. */
  action: SafeToSpendPresentationAction;
}

const AUP_ACTION: SafeToSpendPresentationAction = { kind: 'focus_money_section', section: 'aup' };

/** Builds the `amountCents`/`displayAmount`/`amountVisible` trio from a
 * single dollar figure (or omits it) — the one place that
 * conversion/formatting happens, so every state below stays consistent by
 * construction rather than each branch repeating the same three-field
 * derivation. */
function resolveAmount(dollars: number | null): Pick<SafeToSpendPresentation, 'amountCents' | 'displayAmount' | 'amountVisible'> {
  if (dollars === null) return { amountCents: null, displayAmount: null, amountVisible: false };
  const cents = toAuthoritativeCents(dollars);
  if (cents === null) return { amountCents: null, displayAmount: null, amountVisible: false };
  return { amountCents: cents, displayAmount: formatSafeToSpendAmount(cents / 100), amountVisible: true };
}

/**
 * The shared, pure Available Until Payday presentation selector (Pass 2A,
 * corrected) — consumed by both SafeToSpendHero.tsx (Money) and the Today
 * Briefing. Wraps selectSafeToSpendHeroState (unchanged, still the single
 * source of truth for which state applies) and adds every presentation
 * fact both surfaces need: state, heading/eyebrow, primary/supporting copy,
 * authoritative amount in cents, formatted display amount, amount
 * visibility, tone, and action. Every sentence here is a verbatim match of
 * what SafeToSpendHero.tsx has always rendered for that state; this
 * function does not change any customer-facing wording, only where it is
 * authored and how completely its shape is described.
 */
export function selectSafeToSpendPresentation(safeToSpend: SafeToSpendResult, heroCopy: MoneyHeroCopy): SafeToSpendPresentation {
  const heroState = selectSafeToSpendHeroState(safeToSpend);
  const eyebrow = heroCopy.eyebrowScheduled.toUpperCase();

  switch (heroState) {
    case 'unavailable_balance_data':
      return {
        heroState,
        tone: 'warning',
        heading: 'AVAILABLE UNTIL PAYDAY',
        primaryCopy: 'Available amount unavailable',
        supportingCopy: 'Review your recorded balances.',
        ...resolveAmount(null),
        amountIsAvailableMoney: false,
        action: AUP_ACTION,
      };
    case 'unavailable_other_data':
      return {
        heroState,
        tone: 'warning',
        heading: 'AVAILABLE UNTIL PAYDAY',
        primaryCopy: 'Available amount unavailable',
        supportingCopy: 'Review your recorded money details.',
        ...resolveAmount(null),
        amountIsAvailableMoney: false,
        action: AUP_ACTION,
      };
    case 'no_known_payday': {
      const hasIncludedBalance = safeToSpend.includedMoneyBalance > 0;
      return {
        heroState,
        tone: 'normal',
        // Never "AVAILABLE UNTIL PAYDAY" wording here — no payday is known
        // to count down to, so this state must never imply one exists.
        heading: 'AVAILABLE MONEY',
        primaryCopy: hasIncludedBalance ? 'Based on the balances you selected.' : 'Choose a balance to estimate your available money',
        supportingCopy: null,
        ...resolveAmount(hasIncludedBalance ? safeToSpend.includedMoneyBalance : null),
        amountIsAvailableMoney: true,
        action: AUP_ACTION,
      };
    }
    case 'missing_balance':
      return {
        heroState,
        tone: 'warning',
        heading: eyebrow,
        primaryCopy:
          "Select a balance for Navilo to use in your short-term money estimate — bills, savings and goals can't be compared against your available cash until then.",
        supportingCopy: null,
        ...resolveAmount(null),
        amountIsAvailableMoney: false,
        action: AUP_ACTION,
      };
    case 'recorded_overspend': {
      const recordedOverspendAmount = -safeToSpend.cycleRemainingPool;
      return {
        heroState,
        tone: 'warning',
        heading: eyebrow,
        primaryCopy: `Recorded spending is currently about ${formatSafeToSpendAmount(recordedOverspendAmount)} ahead of the estimated amount for this cycle.`,
        supportingCopy: null,
        ...resolveAmount(null),
        amountIsAvailableMoney: false,
        action: AUP_ACTION,
      };
    }
    case 'commitments_exceed_cash':
      return {
        heroState,
        tone: 'warning',
        heading: eyebrow,
        primaryCopy: `Your planned bills, savings and goals are currently about ${formatSafeToSpendAmount(
          Math.abs(safeToSpend.cycleRemainingPool)
        )} above the balance included in this estimate.`,
        supportingCopy: null,
        ...resolveAmount(null),
        amountIsAvailableMoney: false,
        action: AUP_ACTION,
      };
    case 'goals_underfunded':
      return {
        heroState,
        tone: 'warning',
        heading: eyebrow,
        primaryCopy: `Your goals would need ${formatSafeToSpendAmount(safeToSpend.goalAllocation.totalRequiredMonthly)}/month but only ${formatSafeToSpendAmount(
          safeToSpend.goalAllocation.availableForGoals
        )} is currently available. Explore adjusting the timeline or contribution.`,
        supportingCopy: null,
        ...resolveAmount(null),
        amountIsAvailableMoney: false,
        action: AUP_ACTION,
      };
    case 'normal':
    default:
      return {
        heroState: 'normal',
        tone: 'normal',
        heading: eyebrow,
        primaryCopy: heroCopy.amountLabel,
        supportingCopy: null,
        ...resolveAmount(Math.max(0, safeToSpend.cycleRemainingPool)),
        amountIsAvailableMoney: false,
        action: AUP_ACTION,
      };
  }
}
