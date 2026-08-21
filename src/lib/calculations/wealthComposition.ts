/**
 * Nolie Design 5.1 Wave 7 — Wealth presentation.
 *
 * PRESENTATION ONLY, and deliberately so. Every figure this module handles
 * arrives already computed by an engine that is not touched by this wave:
 * `computeTotalWealth`, `computeAccessibleNetWorth` and
 * `computeRetirementSavings` in wealthDefinitions.ts, plus the plain
 * asset/liability totals Wealth already summed. Nothing here adds,
 * subtracts, or re-derives a customer's money — it decides words, order,
 * proportions for a bar, and what a screen reader hears.
 *
 * THE ONE ARITHMETIC IDENTITY WORTH STATING. `computeTotalWealth` is
 * `computeAccessibleNetWorth + computeRetirementSavings`, and
 * `computeAccessibleNetWorth` is `(assets − retirement) − liabilities`.
 * The retirement term cancels, so the engine's own output is exactly
 * `totalAssets − totalLiabilities`. That is why the hero can be relabelled
 * "Net worth" as a pure copy change: the figure was already net worth, and
 * this wave neither recreates nor adjusts it.
 *
 * Pure and RN-free, so the whole matrix is testable without a mount.
 */

import { MINUS_SIGN } from './todayComposition';

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * "Total Wealth" and "Wealth Map" both described this measure, and neither
 * said what it was. "Total Wealth" reads as a sum of what you own — it
 * silently omits the debt that has already been subtracted — and a
 * customer with a mortgage could reasonably read their own net figure as
 * the value of their house. "Net worth" is the term the number has always
 * meant.
 */
export const NET_WORTH_LABEL = 'Net worth';
export const NET_WORTH_FORMULA = 'What you own minus what you owe';
export const OWN_LABEL = 'What you own';
export const OWE_LABEL = 'What you owe';

/** The screen heading. The tab stays `Wealth`; only the customer-facing
 * page title changes, so no navigation route name moves. */
export const WEALTH_SCREEN_TITLE = 'Wealth';

// ---------------------------------------------------------------------------
// Amount validity — an unusable input is never a fabricated zero
// ---------------------------------------------------------------------------

/**
 * A genuinely valid zero is a fact and displays as `$0`. NaN or Infinity is
 * not a zero, and rendering it as one would tell a customer their net worth
 * is nothing when the truth is that it could not be computed.
 */
export function isDisplayableAmount(value: number): boolean {
  return Number.isFinite(value);
}

/** Whole dollars, with the typographic minus that shares the advance width
 * of a digit so a column of figures stays aligned. Never a fabricated `$0`. */
export function formatWealthAmount(value: number): string {
  if (!isDisplayableAmount(value)) return '—';
  const rounded = Math.round(value);
  const abs = `$${Math.abs(rounded).toLocaleString()}`;
  return rounded < 0 ? `${MINUS_SIGN}${abs}` : abs;
}

/** The same value said aloud, sign as a word. */
export function spokenWealthAmount(value: number): string {
  if (!isDisplayableAmount(value)) return 'not available';
  const rounded = Math.round(value);
  const amount = `${Math.abs(rounded).toLocaleString()} dollars`;
  return rounded < 0 ? `negative ${amount}` : amount;
}

/**
 * The hero's single announcement. Says the figure, then the formula as
 * real numbers rather than as the abstract words above it — a screen-reader
 * customer gets the reconciliation without having to find the bar.
 */
export function composeNetWorthAnnouncement(input: {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}): string {
  return (
    `${NET_WORTH_LABEL}, ${spokenWealthAmount(input.netWorth)}. ` +
    `${OWN_LABEL}, ${spokenWealthAmount(input.totalAssets)}, ` +
    `minus ${OWE_LABEL.toLowerCase()}, ${spokenWealthAmount(input.totalLiabilities)}.`
  );
}

// ---------------------------------------------------------------------------
// The own / owe reconciliation bar
// ---------------------------------------------------------------------------

export interface OwnOweProportions {
  /** 0–1. Zero when no meaningful proportion exists. */
  ownFraction: number;
  oweFraction: number;
  /** False when the bar would be meaningless or misleading — both sides
   * zero, or either input unusable. The values still render as text; only
   * the proportional bar is withheld. */
  barMeaningful: boolean;
}

/**
 * Safe visual proportions, and nothing more.
 *
 * The denominator is `own + owe`, not net worth: net worth can be zero or
 * negative, and dividing by it produces infinities and sign flips. A
 * customer with no records at all must not see a full bar of either colour,
 * which is why `barMeaningful` exists rather than a silent 0/0 → NaN.
 */
export function resolveOwnOweProportions(totalAssets: number, totalLiabilities: number): OwnOweProportions {
  if (!isDisplayableAmount(totalAssets) || !isDisplayableAmount(totalLiabilities)) {
    return { ownFraction: 0, oweFraction: 0, barMeaningful: false };
  }
  // A negative total on either side is not a proportion of anything.
  const own = Math.max(totalAssets, 0);
  const owe = Math.max(totalLiabilities, 0);
  const denominator = own + owe;
  if (denominator <= 0) return { ownFraction: 0, oweFraction: 0, barMeaningful: false };
  return { ownFraction: own / denominator, oweFraction: owe / denominator, barMeaningful: true };
}

/** The bar's own spoken string — exact values, never percentages alone. */
export function composeOwnOweAnnouncement(totalAssets: number, totalLiabilities: number): string {
  return `${OWN_LABEL}, ${spokenWealthAmount(totalAssets)}. ${OWE_LABEL}, ${spokenWealthAmount(totalLiabilities)}.`;
}

// ---------------------------------------------------------------------------
// Accessible now / retirement
// ---------------------------------------------------------------------------

/**
 * Two separate measures, never summed into a third.
 *
 * Adding them would recreate net worth by a second route, and a second
 * route is exactly how two figures come to disagree. Retirement savings is
 * already inside net worth; the point of showing it is that it is not
 * money a customer can act on today.
 */
export const ACCESSIBLE_NOW_LABEL = 'Accessible now';
export const RETIREMENT_LABEL_DISPLAY = 'Retirement savings';

/**
 * The Definitions sheet's content. Factual, and deliberately free of advice
 * or any guarantee about access — Nolie does not know a customer's fund
 * rules, and "you can withdraw this" would be advice it cannot support.
 */
export const WEALTH_DEFINITIONS: readonly { term: string; body: string }[] = [
  {
    term: NET_WORTH_LABEL,
    body: 'Everything you have recorded that you own, minus everything you have recorded that you owe.',
  },
  {
    term: ACCESSIBLE_NOW_LABEL,
    body: 'Your recorded net worth excluding retirement savings. It is what remains once retirement accounts are set aside — not a spending limit, and not the same as Available until payday.',
  },
  {
    term: RETIREMENT_LABEL_DISPLAY,
    body: 'Balances you have recorded in retirement accounts. They are part of your net worth, but they are generally not available to use now.',
  },
];

/**
 * Wave 7 correction A — is retirement ABSENT, or genuinely recorded as zero?
 *
 * These are different facts and must read differently. A customer who has
 * recorded a super account holding $0 has told Nolie something; a customer
 * who has recorded nothing has not. Presence is decided by whether any
 * retirement-type asset EXISTS, never by whether its value is non-zero —
 * which is why this takes the count, not just the total.
 */
export type RetirementPresence = 'absent' | 'recorded';

export function resolveRetirementPresence(retirementAssetCount: number): RetirementPresence {
  return retirementAssetCount > 0 ? 'recorded' : 'absent';
}

/** The row's own value text. A genuine recorded zero stays `$0`; only a
 * true absence says so in words. */
export function retirementRowValue(presence: RetirementPresence, retirementSavings: number): string {
  return presence === 'absent' ? 'Not recorded' : formatWealthAmount(retirementSavings);
}

export function retirementRowSpoken(presence: RetirementPresence, retirementSavings: number): string {
  return presence === 'absent' ? 'not recorded' : spokenWealthAmount(retirementSavings);
}

/** The breakdown sheet's six items, in the specified order, from the
 * authoritative outputs only. No item is computed here. */
export interface BreakdownItem {
  label: string;
  value: string;
  spoken: string;
  /** True for the net-worth reconciliation line, which is emphasised. */
  emphasis?: boolean;
}

export function composeBreakdownItems(input: {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  accessibleNetWorth: number;
  retirementSavings: number;
  retirementPresence: RetirementPresence;
}): BreakdownItem[] {
  return [
    { label: OWN_LABEL, value: formatWealthAmount(input.totalAssets), spoken: spokenWealthAmount(input.totalAssets) },
    { label: OWE_LABEL, value: formatWealthAmount(input.totalLiabilities), spoken: spokenWealthAmount(input.totalLiabilities) },
    { label: NET_WORTH_LABEL, value: formatWealthAmount(input.netWorth), spoken: spokenWealthAmount(input.netWorth), emphasis: true },
    { label: ACCESSIBLE_NOW_LABEL, value: formatWealthAmount(input.accessibleNetWorth), spoken: spokenWealthAmount(input.accessibleNetWorth) },
    {
      label: RETIREMENT_LABEL_DISPLAY,
      value: retirementRowValue(input.retirementPresence, input.retirementSavings),
      spoken: retirementRowSpoken(input.retirementPresence, input.retirementSavings),
    },
  ];
}

/**
 * The breakdown trigger's single announcement — the three headline values,
 * each said once. A customer using VoiceOver learns the reconciliation
 * without having to open anything.
 */
export function composeBreakdownTriggerLabel(input: { totalAssets: number; totalLiabilities: number; netWorth: number }): string {
  return (
    `View breakdown. ${OWN_LABEL}, ${spokenWealthAmount(input.totalAssets)}. ` +
    `${OWE_LABEL}, ${spokenWealthAmount(input.totalLiabilities)}. ` +
    `${NET_WORTH_LABEL}, ${spokenWealthAmount(input.netWorth)}.`
  );
}

export const BREAKDOWN_TRIGGER_TEXT = 'View breakdown';

/** Two labelled measures for the summary. Never a third combined figure —
 * the shape itself makes that impossible. */
export interface WealthMeasurePair {
  accessible: { label: string; value: number };
  retirement: { label: string; value: number } | null;
}

export function composeWealthMeasures(accessibleNetWorth: number, retirementSavings: number): WealthMeasurePair {
  return {
    accessible: { label: ACCESSIBLE_NOW_LABEL, value: accessibleNetWorth },
    // Hidden only when there is genuinely nothing recorded — never hidden
    // to tidy the layout, and a real zero balance still shows.
    retirement:
      isDisplayableAmount(retirementSavings) && retirementSavings !== 0
        ? { label: RETIREMENT_LABEL_DISPLAY, value: retirementSavings }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Staged disclosure
// ---------------------------------------------------------------------------

/** The committed Design 5.1 source specifies no other count. */
export const WEALTH_PREVIEW_COUNT = 3;

export type DisclosureKind = 'assets' | 'debts';

export interface DisclosureState<T> {
  /** What renders now — the preview, or everything. */
  visible: T[];
  /** Null when there is nothing to expand, so no control is rendered. */
  control: { label: string; expanded: boolean; hiddenCount: number } | null;
}

/**
 * Preview-then-expand, in the list's own canonical order.
 *
 * The order is whatever the caller supplied — this wave introduces no new
 * financial sort. A row is never dropped for having a zero balance: a
 * cleared debt or an emptied account is a fact the customer recorded, and
 * hiding it would make the section disagree with the total above it.
 */
export function resolveDisclosure<T>(rows: readonly T[], kind: DisclosureKind, expanded: boolean): DisclosureState<T> {
  const all = [...rows];
  if (all.length <= WEALTH_PREVIEW_COUNT) return { visible: all, control: null };
  const visible = expanded ? all : all.slice(0, WEALTH_PREVIEW_COUNT);
  return {
    visible,
    control: {
      label: disclosureLabel(kind, all.length, expanded),
      expanded,
      hiddenCount: all.length - WEALTH_PREVIEW_COUNT,
    },
  };
}

export function disclosureLabel(kind: DisclosureKind, total: number, expanded: boolean): string {
  const noun = kind === 'assets' ? 'assets' : 'debts';
  return expanded ? `Show fewer ${noun}` : `View all ${noun} (${total})`;
}

// ---------------------------------------------------------------------------
// Recorded date and the inactive stale treatment
// ---------------------------------------------------------------------------

/**
 * Wave 7 ships the stale VISUAL, with its trigger explicitly OFF.
 *
 * The plan authorises freshness labelling but not automatic stale
 * classification, because no category-age threshold has been agreed and
 * inventing one would put a caution tint on a balance that is simply old
 * rather than wrong. This constant is the single switch; while it is
 * false, `resolveRecordFreshness` can only ever return `current`, so no
 * caution tint, warning icon or "out of date" wording can reach a customer
 * regardless of how old a record is.
 *
 * Nothing else in the app reads record age. No calculation, eligibility
 * rule or total changes because a record is old.
 */
export const STALE_TRIGGER_ENABLED = false;

export type RecordFreshness = 'current' | 'stale';

export function resolveRecordFreshness(recordedISO: string | null | undefined, today: Date): RecordFreshness {
  if (!STALE_TRIGGER_ENABLED) return 'current';
  /* istanbul ignore next — unreachable while the trigger is off. Retained
     so the state it drives is a real, wired presentation branch rather
     than dead scaffolding a future wave would have to rebuild. */
  if (!recordedISO) return 'current';
  const recorded = new Date(recordedISO);
  if (Number.isNaN(recorded.getTime())) return 'current';
  return recorded.getTime() < today.getTime() ? 'stale' : 'current';
}

/**
 * The local calendar day a balance was recorded, formatted for a row.
 *
 * Built from LOCAL date parts. `toISOString().slice(0,10)` would convert to
 * UTC first, so a balance recorded at 9pm east of UTC would display as the
 * following day — the exact shift the plan forbids.
 *
 * Returns null when the record carries no usable date. The caller renders
 * nothing in that case: today is never substituted, and no timestamp is
 * fabricated.
 */
export function formatRecordedDate(recordedISO: string | null | undefined): string | null {
  return formatDatedLine('Recorded', recordedISO);
}

/**
 * Wave 7 correction D — `createdAt` is a CREATION date, not a recorded
 * balance date.
 *
 * Inspection of the model settles this: `Liability.createdAt` is set once,
 * by the smart-loan flow, when the record is created, and no write path
 * updates it when a balance changes. Labelling it "Recorded" told the
 * customer their balance was confirmed on that day, which is a claim the
 * data cannot support — and this wave's own report established there is no
 * trustworthy balance-recorded contract for either assets or liabilities.
 *
 * "Added" is what the field genuinely means. Only the smart-loan types
 * carry it, so every other liability renders no date line at all rather
 * than an unreliable one.
 */
export function formatAddedDate(createdISO: string | null | undefined): string | null {
  return formatDatedLine('Added', createdISO);
}

/** The liability types whose `createdAt` is set by a real creation path.
 * A type outside this set has no dependable creation date, so it shows no
 * date line — an absent fact rather than a wrong one. */
export const TYPES_WITH_CREATION_DATE: readonly string[] = ['mortgage', 'car_loan', 'personal_loan'];

export function liabilityDateLine(type: string, createdISO: string | null | undefined): string | null {
  if (!TYPES_WITH_CREATION_DATE.includes(type)) return null;
  return formatAddedDate(createdISO);
}

function formatDatedLine(prefix: string, iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${prefix} ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// ---------------------------------------------------------------------------
// Due-soon tone on a Wealth liability row
// ---------------------------------------------------------------------------

/**
 * Wave 7 correction D — a card due tomorrow is not an emergency.
 *
 * `dueDateStatus` in creditHealth.ts returns `danger` for anything due
 * within three days. That engine is a financial authority this wave does
 * not touch, and its tone is right for the reminder surface it was built
 * for — but on a Wealth row it painted an ordinary upcoming payment in the
 * same red the app reserves for destructive confirmation and genuine
 * urgency, so a customer scanning their debts saw an alarm where there was
 * only a diary entry.
 *
 * This is a PRESENTATION remap and nothing more. The engine's tone, label,
 * interest estimate and provenance are unchanged; only the ink this one
 * surface chooses for them differs, and only for the not-yet-late case.
 */
export type WealthRowTone = 'neutral' | 'caution' | 'urgent' | 'positive';

export function resolveLiabilityRowTone(engineTone: string, label: string): WealthRowTone {
  if (engineTone === 'success') return 'positive';
  if (engineTone === 'danger') {
    // Genuinely late keeps its urgency; merely soon becomes caution.
    return /overdue|past due|missed/i.test(label) ? 'urgent' : 'caution';
  }
  if (engineTone === 'warning') return 'caution';
  return 'neutral';
}

/** The non-colour cue that must accompany the tone, so status is never
 * carried by ink alone. */
export function liabilityRowToneIcon(tone: WealthRowTone): string | null {
  if (tone === 'urgent') return 'alert-circle';
  if (tone === 'caution') return 'time-outline';
  if (tone === 'positive') return 'checkmark-circle';
  return null;
}
