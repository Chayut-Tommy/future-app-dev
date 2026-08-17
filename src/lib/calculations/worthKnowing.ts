import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { TimelineEvent, TimelineEventKind } from './moneyTimeline';
import { eventOccurrenceIdentity, occurrenceIdentityKey, occurrenceDateKey } from './todayBriefing';
import { SafeToSpendResult } from './safeToSpend';
import { monthToDateWindowStart, isWithinMonthToDate, computeThisMonthRecordedSummary, ThisMonthSpendingSource } from './monthlySummary';
import { resolveTransactionCategoryCoachingAmount } from './repaymentAccounting';
import { moneyAmountToCents } from './money';

/**
 * Worth Knowing — retires the Cashflow Focus presentation on Today (the
 * underlying financialState engine/computeRecordedMonthlyCashflow are
 * untouched; see financialState.ts and TodayScreen.tsx's own doc comments).
 *
 * Architecture decision (correction round): Worth Knowing does NOT become a
 * second, independently-selected single-insight slot alongside the
 * pre-existing todayContextualInsight.ts pool (emergencyFund/savingsInterest/
 * goalImpact, rendered via LuluCheckInCard). That would recreate exactly the
 * "two competing contextual insight systems" problem this codebase already
 * corrected once (see todayContextualInsight.ts's own doc comment on
 * LuluRecommendationCard's retirement) — two independently-computed
 * selectors glued by view-layer ternary priority is NOT "one engine" merely
 * because they render into the same visual slot.
 *
 * TodayScreen.tsx's insight slot is now a genuine two-tier tree with exactly
 * one Worth Knowing selector call: Financial Rebuild (financialState.key)
 * overrides everything; otherwise `pickWorthKnowingInsight` — this file's
 * single exported decision function — is the ONLY thing that can put an
 * insight in that slot. There is no second, independently-eligible fallback
 * card. When `pickWorthKnowingInsight` returns null, the slot renders
 * nothing and Goal follows August so far directly (spec's own "no insight is
 * a valid state," never a generic filler). `todayContextualInsight.ts`,
 * `dailyInsight.ts` and `LuluCheckInCard.tsx` remain in the repository
 * (their own real-import tests still cover them) but are no longer called
 * from TodayScreen.tsx at all — they do not compete with, feed, or fall back
 * for Worth Knowing.
 *
 * MVP scope: WK-01 (upcoming commitment cluster), WK-02 (material upcoming
 * commitment), WK-03 (spending category concentration), WK-04 (payment-
 * source concentration). WK-05 (upcoming commitment pattern) is explicitly
 * deferred — real dedup-ambiguity risk against WK-01 (both are fundamentally
 * "payments clustered in time," just anchored differently) and the spec's
 * own lowest-priority tier; revisit only after WK-01 has real usage
 * evidence to design the two apart safely.
 *
 * Every candidate reuses an existing canonical engine (computeMoneyTimeline/
 * recurringOccurrencesInRange for events, computeSafeToSpend for materiality,
 * computeThisMonthRecordedSummary for payment-source attribution) — WK-03's
 * calendar-month category breakdown is the one genuinely new calculation
 * here, and it is composed entirely from monthlySummary.ts's own exported
 * month-to-date window helpers plus repaymentAccounting.ts's established
 * category-coaching resolver, never a re-derived date boundary or a new
 * transaction-amount rule.
 */

export type WorthKnowingInsightType =
  | 'upcoming_commitment_cluster'
  | 'large_upcoming_commitment'
  | 'spending_category_concentration'
  | 'payment_source_concentration';

// Correction round — the 'timeline' destination now carries the exact
// destination it was computed from, not just the section name. A device
// test found that landing on the timeline's HEADING is not the same as
// landing on the specific date group the insight is actually about — once
// "What happens next" exceeds a handful of events it becomes its own
// independently-scrollable box (see MoneyTimelineCard.tsx's own
// SCROLL_BOX_HEIGHT), and the outer page scroll alone could leave a
// genuinely distant cluster or payment many seconds of manual scrolling
// away. targetDateKey/targetOccurrenceKeys are built from the SAME
// candidate data (best.members / best) already used for this insight's own
// materialityCents/count — never re-derived — so the destination can never
// disagree with what the card's own body text claims. 'this_month' and
// 'transactions' need no such target — they land on an existing section/
// screen whose own content IS the destination, not a specific row within it.
export type WorthKnowingDestination =
  | { kind: 'money_section'; section: 'timeline'; targetDateKey: string; targetOccurrenceKeys: string[] }
  | { kind: 'money_section'; section: 'this_month' }
  | { kind: 'transactions' };

export interface WorthKnowingInsight {
  type: WorthKnowingInsightType;
  icon: keyof typeof Ionicons.glyphMap;
  /** 1 = material near-term context (WK-01/WK-02), 2 = material recorded
   * pattern (WK-03/WK-04) — the spec's own two-tier priority framework. */
  priority: 1 | 2;
  title: string;
  body: string;
  ctaLabel: string;
  destination: WorthKnowingDestination;
  /** Reproducible identity for this exact insight instance — a developer
   * (or a test) can always answer "why was this selected" from this string
   * alone, per the spec's explainability requirement. */
  fingerprint: string;
  /** Tie-break inputs only — not part of the presentation contract.
   * `materialityCents` is a real dollar figure, used to compare WK-01
   * against WK-02 (both priority 1, both fundamentally "how much money is
   * at stake"). `rankBasisPoints` (0-10000) is the normalized concentration
   * signal used to compare WK-03 against WK-04 (both priority 2): a raw
   * dollar comparison there is structurally biased — payment-source
   * concentration's materiality is always a sum across every category, so
   * it would out-rank category concentration by construction even when its
   * concentration is objectively weaker. Comparing normalized share instead
   * makes "how strong/surprising is this pattern" the actual tie-break
   * question for that tier. */
  materialityCents: number;
  rankBasisPoints: number;
  daysUntil: number;
}

/** What Today Briefing already shows, so Worth Knowing never repeats a
 * single event Briefing already surfaces (the spec's own worked example:
 * "Credit card — Today" in Briefing must suppress a lone "your credit card
 * is due today" insight, but an AGGREGATE cluster that happens to include
 * that same event is still genuinely additive). Built by the caller
 * (TodayScreen.tsx) from the exact same eventRows/topReminder Briefing
 * itself renders — never re-derived independently, so the two can never
 * silently disagree about what's already visible. */
export interface WorthKnowingBriefingContext {
  shownEventKeys: Set<string>;
  reminderKey: string | null;
}

const CLUSTER_MIN_EVENTS = 3;
const CLUSTER_WINDOW_DAYS = 6; // a 7-calendar-day window (start day + 6 more)

// Correction round — WK-01/WK-02 must never treat every negative-amount
// TimelineEvent as a "payment." An explicit allowlist of genuinely payable
// commitment kinds, not the amount sign alone: 'bill' covers ordinary
// recurring bills/expenses AND car-loan/personal-loan repayments (moneyTimeline.ts
// only distinguishes 'mortgage' as its own kind; every other loan-linked
// recurring item is still kind 'bill' — see that file's own isMortgage
// branch), 'mortgage' and 'credit_card' and 'bnpl' are self-explanatory.
// Deliberately excludes 'income' (not an outflow), 'savings' (a Savings
// Allocation reservation — the user's own forecasting preference, not a
// bill), and 'goal' (a goal-contribution reservation, same reasoning) — a
// customer has not "recorded a payment" merely because Nolie is estimating
// how much of their pay it plans to set aside. Shared by both WK-01 and
// WK-02 so the two candidates can never disagree about what counts.
const PAYABLE_EVENT_KINDS: TimelineEventKind[] = ['bill', 'mortgage', 'credit_card', 'bnpl'];

function isPayableCommitment(e: TimelineEvent): boolean {
  return e.amount < 0 && e.daysUntil >= 0 && PAYABLE_EVENT_KINDS.includes(e.kind);
}

// Materiality thresholds for WK-02 — a deterministic, documented default,
// not an arbitrary hard-coded dollar figure alone (spec §12): a payment
// must be significant relative to EITHER what's typically owed each cycle
// or what's actually left to spend, plus an absolute floor so a genuinely
// small recorded amount never qualifies regardless of how it compares to a
// near-zero pool.
const MATERIAL_MIN_ABSOLUTE_CENTS = 15000; // $150
const MATERIAL_SHARE_OF_CYCLE_BILLS = 0.35;
const MATERIAL_SHARE_OF_REMAINING_POOL = 0.4;

// WK-03 — a leading category must represent a real, repeated pattern (not
// one or two transactions) and a clear majority-ish share of recorded
// spending, over a large enough total that the percentage itself is
// meaningful.
const CATEGORY_MIN_TRANSACTIONS = 3;
const CATEGORY_MIN_SHARE = 0.3;
const CATEGORY_MIN_TOTAL_CENTS = 5000; // $50

// WK-04 — mirrors WK-03's minimum-activity floor; the concentration bar is
// higher (a genuine majority) since "most of your spending" is a stronger
// claim than "your largest category out of several."
const SOURCE_MIN_SHARE_PERCENT = 55;
const SOURCE_MIN_TOTAL_CENTS = 5000; // $50

const TYPE_ORDER: WorthKnowingInsightType[] = [
  'upcoming_commitment_cluster',
  'large_upcoming_commitment',
  'spending_category_concentration',
  'payment_source_concentration',
];

function formatWholeDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

// Correction round — month names are spelled out explicitly rather than via
// `toLocaleDateString(undefined, {...})`. That call resolves the DEVICE's
// default locale, whose field order is not day-month (e.g. en-US renders
// "August 29", not "29 August") — so the exact, unambiguous day-month(-year)
// shape this file requires would silently vary by customer locale, and on
// Hermes without full-icu the options argument may be ignored altogether.
// A fixed month-name table keeps this deterministic on every device.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatDayMonthYear(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// Correction round — WK-02's single due date must stay unambiguous across a
// year boundary (e.g. today in December, the payment due "3 January" — of
// which year?). The year is shown only when it differs from `today`'s year,
// keeping the common case ("due on 22 August") exactly as before.
function formatSingleDate(d: Date, today: Date): string {
  if (d.getFullYear() !== today.getFullYear()) return formatDayMonthYear(d);
  return formatDayMonth(d);
}

// Correction round — three distinct, unambiguous shapes, never a bare
// "29–3 September" (the end date's own day number with no month is
// meaningless once the range crosses a month boundary). Local-calendar
// getFullYear/getMonth/getDate only — no millisecond arithmetic.
function formatDateRange(start: Date, end: Date): string {
  if (start.getFullYear() === end.getFullYear()) {
    if (start.getMonth() === end.getMonth()) {
      // Same month: "20–25 August"
      return `${start.getDate()}–${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`;
    }
    // Different months, same year: "29 August–3 September"
    return `${formatDayMonth(start)}–${formatDayMonth(end)}`;
  }
  // Different years: "29 December 2026–3 January 2027"
  return `${formatDayMonthYear(start)}–${formatDayMonthYear(end)}`;
}

/** WK-01 — a rolling CLUSTER_WINDOW_DAYS+1-day window with the most
 * qualifying outgoing events wins; ties broken by the earliest window start
 * (deterministic — never array-order-dependent, since `outgoing` is sorted
 * by daysUntil first and every window is evaluated from that same sorted
 * list). Reuses TimelineEvent.daysUntil directly (already computed by
 * moneyTimeline.ts's own DST-safe calendarOrdinal arithmetic) rather than
 * re-deriving any date math here. */
function buildUpcomingCommitmentCluster(events: TimelineEvent[]): WorthKnowingInsight | null {
  const outgoing = events.filter(isPayableCommitment).sort((a, b) => a.daysUntil - b.daysUntil);
  if (outgoing.length < CLUSTER_MIN_EVENTS) return null;

  let best: { startDay: number; members: TimelineEvent[] } | null = null;
  for (const candidateStart of outgoing) {
    const members = outgoing.filter((e) => e.daysUntil >= candidateStart.daysUntil && e.daysUntil <= candidateStart.daysUntil + CLUSTER_WINDOW_DAYS);
    if (members.length < CLUSTER_MIN_EVENTS) continue;
    if (!best || members.length > best.members.length || (members.length === best.members.length && candidateStart.daysUntil < best.startDay)) {
      best = { startDay: candidateStart.daysUntil, members };
    }
  }
  if (!best) return null;

  let totalCents = 0;
  for (const e of best.members) {
    const v = moneyAmountToCents(Math.abs(e.amount));
    if (v.valid) totalCents += v.cents;
  }
  if (totalCents <= 0) return null;

  const minDay = Math.min(...best.members.map((e) => e.daysUntil));
  const maxDay = Math.max(...best.members.map((e) => e.daysUntil));
  const startDate = best.members.find((e) => e.daysUntil === minDay)!.date;
  const endDate = best.members.find((e) => e.daysUntil === maxDay)!.date;

  // Correction round — the destination target is built from best.members,
  // the exact same array totalCents/best.members.length above were just
  // computed from — never a second, independently-filtered pass over
  // `events`. targetDateKey anchors Money's timeline to the cluster's own
  // START date (the same date startDate/formatDateRange already use); a
  // member whose occurrence identity can't be resolved (structurally
  // unreachable for an allowlisted payable event — see isPayableCommitment
  // — but guarded defensively) is simply omitted from the identity list
  // rather than breaking the whole insight.
  const targetOccurrenceKeys = best.members
    .map((e) => occurrenceIdentityKey(eventOccurrenceIdentity(e)))
    .filter((k): k is string => k !== null);

  return {
    type: 'upcoming_commitment_cluster',
    icon: 'calendar-outline',
    priority: 1,
    // Correction round — "busiest" was never proven against the complete
    // supplied horizon (ranking here is by materiality/temporal proximity,
    // not event count across the whole window), so it could overstate what
    // was actually found. "A busy payment week" is the safe, defensible
    // MVP claim — a real, qualifying cluster exists, without asserting it
    // is THE busiest anywhere in the horizon.
    title: 'A busy payment week is coming up',
    body: `You have ${formatWholeDollars(totalCents)} across ${best.members.length} recorded payments between ${formatDateRange(startDate, endDate)}.`,
    ctaLabel: 'See what’s coming',
    destination: { kind: 'money_section', section: 'timeline', targetDateKey: occurrenceDateKey(startDate), targetOccurrenceKeys },
    fingerprint: `wk01:${minDay}:${maxDay}:${best.members.length}:${totalCents}`,
    materialityCents: totalCents,
    rankBasisPoints: 0,
    daysUntil: minDay,
  };
}

/** WK-02 — the single largest qualifying upcoming outflow, suppressed if it
 * is the exact same occurrence Today Briefing already shows (its own event
 * row, or the top Smart Reminder) with no new context — the spec's
 * "critical deduplication rule" (§12). */
function buildMaterialUpcomingCommitment(
  events: TimelineEvent[],
  today: Date,
  safeToSpend: SafeToSpendResult,
  dedup: WorthKnowingBriefingContext
): WorthKnowingInsight | null {
  const candidates = events.filter(isPayableCommitment);
  let best: TimelineEvent | null = null;
  let bestCents = 0;
  for (const e of candidates) {
    const v = moneyAmountToCents(Math.abs(e.amount));
    if (!v.valid) continue;
    if (v.cents > bestCents) {
      best = e;
      bestCents = v.cents;
    }
  }
  if (!best || bestCents < MATERIAL_MIN_ABSOLUTE_CENTS) return null;

  // Correction round — a percentage comparison is only ever evaluated when
  // its denominator is finite, present, and strictly positive. A zero,
  // negative, NaN or infinite denominator must never "automatically pass"
  // (and previously couldn't via the `> 0` guard alone for zero/negative,
  // but NaN/Infinity were not explicitly excluded — Number.isFinite closes
  // both: NaN fails `> 0` already, but stating it explicitly documents the
  // contract rather than relying on an incidental JS comparison quirk).
  const cycleBillsExpected = safeToSpend.cycleBillsExpected;
  const cycleRemainingPool = safeToSpend.cycleRemainingPool;
  const meetsBillsShare =
    Number.isFinite(cycleBillsExpected) && cycleBillsExpected > 0 && bestCents / 100 / cycleBillsExpected >= MATERIAL_SHARE_OF_CYCLE_BILLS;
  const meetsPoolShare =
    Number.isFinite(cycleRemainingPool) && cycleRemainingPool > 0 && bestCents / 100 / cycleRemainingPool >= MATERIAL_SHARE_OF_REMAINING_POOL;
  if (!meetsBillsShare && !meetsPoolShare) return null;

  const identityKey = occurrenceIdentityKey(eventOccurrenceIdentity(best));
  if (identityKey && (dedup.shownEventKeys.has(identityKey) || dedup.reminderKey === identityKey)) return null;

  return {
    type: 'large_upcoming_commitment',
    icon: 'cash-outline',
    priority: 1,
    // Correction round — a specific factual title ("A $2,850 payment is
    // coming up") rather than the unexplained comparative "A larger payment
    // is coming up" (larger than what, to the customer reading only the
    // title, was never stated).
    title: `A ${formatWholeDollars(bestCents)} payment is coming up`,
    body: `Your recorded ${best.label} of ${formatWholeDollars(bestCents)} is due on ${formatSingleDate(best.date, today)}.`,
    ctaLabel: 'See upcoming money',
    // Correction round — targetDateKey/targetOccurrenceKeys are built from
    // `best`/`identityKey`, the exact same values bestCents/the body text
    // above already read — never re-derived independently.
    destination: {
      kind: 'money_section',
      section: 'timeline',
      targetDateKey: occurrenceDateKey(best.date),
      targetOccurrenceKeys: identityKey ? [identityKey] : [],
    },
    fingerprint: `wk02:${identityKey ?? best.id}`,
    materialityCents: bestCents,
    rankBasisPoints: 0,
    daysUntil: best.daysUntil,
  };
}

/** WK-03 — calendar-month-to-date category breakdown, composed from
 * monthlySummary.ts's exported window helpers (never a re-derived date
 * boundary) and repaymentAccounting.ts's established category-coaching
 * resolver (the same one spendingInsights.ts uses, so a repayment/loan
 * transaction is excluded here exactly as it already is everywhere else
 * category-based coaching reads from). This is the one genuinely new
 * calculation in this file — see this file's own header comment. */
function buildSpendingCategoryConcentration(data: AppData, today: Date): WorthKnowingInsight | null {
  const monthStart = monthToDateWindowStart(today);
  const byCategory = new Map<string, { cents: number; count: number }>();
  let totalCents = 0;

  for (const t of data.transactions) {
    if (t.type !== 'expense' || !isWithinMonthToDate(t.date, monthStart, today)) continue;
    const amount = resolveTransactionCategoryCoachingAmount(data, t);
    if (amount <= 0) continue;
    const v = moneyAmountToCents(amount);
    if (!v.valid) continue;
    const entry = byCategory.get(t.categoryId) ?? { cents: 0, count: 0 };
    entry.cents += v.cents;
    entry.count += 1;
    byCategory.set(t.categoryId, entry);
    totalCents += v.cents;
  }
  if (byCategory.size === 0 || totalCents < CATEGORY_MIN_TOTAL_CENTS) return null;

  // Correction round — the TRUE dollar-leading category must be identified
  // FIRST, by exact cents, before any qualification check runs. Falling
  // back to a lower-dollar category that happens to meet the transaction-
  // count floor (the previous version's behaviour) can produce a false
  // customer statement: e.g. one $900 Electronics transaction is the real
  // "largest recorded category," and Nolie must never silently skip it and
  // instead tell the customer "Dining is your largest recorded category"
  // because Dining happens to have more transactions. If the true leader
  // fails ANY requirement (transaction count, concentration share), WK-03
  // returns no candidate at all — it never substitutes a different category
  // while keeping "largest recorded category" wording. A different, valid
  // Worth Knowing candidate may still win via pickWorthKnowingInsight's own
  // selection across all four types.
  let topCategoryId: string | null = null;
  let topEntry = { cents: 0, count: 0 };
  for (const [categoryId, entry] of byCategory) {
    // Deterministic tie-break (categoryId ascending) for the structurally
    // unreachable case of two categories tied to the exact cent — never
    // Map iteration order.
    if (!topCategoryId || entry.cents > topEntry.cents || (entry.cents === topEntry.cents && categoryId < topCategoryId)) {
      topCategoryId = categoryId;
      topEntry = entry;
    }
  }
  if (!topCategoryId) return null;
  if (topEntry.count < CATEGORY_MIN_TRANSACTIONS) return null;

  const share = topEntry.cents / totalCents;
  if (share < CATEGORY_MIN_SHARE) return null;

  const categoryName = data.categories.find((c) => c.id === topCategoryId)?.name ?? 'This category';
  const percentage = Math.round(share * 100);

  return {
    type: 'spending_category_concentration',
    icon: 'pie-chart-outline',
    priority: 2,
    // Correction round — wording aligned with the actual denominator
    // (category-coaching-eligible spend, which excludes every loan
    // repayment — see resolveTransactionCategoryCoachingAmount). "the
    // spending you've recorded this month" would overstate the claim by
    // implying the denominator is complete recorded spending, which is not
    // what this percentage is computed against; "categorised spending"
    // states exactly what was measured.
    title: `${categoryName} is your largest recorded spending category`,
    body: `It accounts for ${percentage}% of your categorised spending this month.`,
    ctaLabel: 'View spending',
    destination: { kind: 'transactions' },
    fingerprint: `wk03:${topCategoryId}:${percentage}`,
    materialityCents: topEntry.cents,
    rankBasisPoints: Math.round(share * 10000),
    daysUntil: 0,
  };
}

function describeSourcePhrase(kind: ThisMonthSpendingSource['kind'], label: string): { subject: string; verbPhrase: string } {
  switch (kind) {
    case 'cash':
      return { subject: 'cash', verbPhrase: 'Cash spending' };
    case 'credit_card':
      return { subject: 'a credit card', verbPhrase: 'Credit card spending' };
    case 'everyday':
      return { subject: label, verbPhrase: `${label} spending` };
    case 'loan':
      return { subject: label, verbPhrase: `${label} spending` };
    case 'other':
      return { subject: 'other funding', verbPhrase: 'Other-funded spending' };
    default:
      return { subject: label, verbPhrase: `${label} spending` };
  }
}

/** WK-04 — wraps computeThisMonthRecordedSummary's own spendingSources
 * (already exact-cent, already source-attributed, already percentage-
 * allocated via the shared largest-remainder rule) rather than building a
 * second payment-source aggregator. */
function buildPaymentSourceConcentration(data: AppData, today: Date): WorthKnowingInsight | null {
  const summary = computeThisMonthRecordedSummary(data, today);
  if (summary.spendingCents < SOURCE_MIN_TOTAL_CENTS) return null;
  const top = summary.spendingSources[0];
  if (!top) return null;
  // Correction round — eligibility is checked against the UNROUNDED share,
  // never `top.percentage` (an integer already through largest-remainder
  // allocation across every bucket, which can round a sub-threshold true
  // share UP past the threshold — e.g. a true 54.999% share can display as
  // 55% once every other bucket's remainder is allocated). `top.percentage`
  // is presentation-only from here on; it must never gate a decision.
  const rawShare = top.amountCents / summary.spendingCents;
  if (rawShare < SOURCE_MIN_SHARE_PERCENT / 100) return null;
  // 'unavailable' is a data gap (the original source no longer resolves),
  // not a reliable attribution — spec §14 requires attribution to be
  // reliable before this insight qualifies.
  if (top.kind === 'unavailable') return null;

  const phrase = describeSourcePhrase(top.kind, top.label);

  return {
    type: 'payment_source_concentration',
    icon: 'card-outline',
    priority: 2,
    title: `Most of your recorded spending used ${phrase.subject}`,
    body: `${phrase.verbPhrase} accounts for ${top.percentage}% of recorded spending this month.`,
    ctaLabel: 'See spending sources',
    destination: { kind: 'money_section', section: 'this_month' },
    fingerprint: `wk04:${top.key}:${top.percentage}`,
    materialityCents: top.amountCents,
    rankBasisPoints: Math.round(rawShare * 10000),
    daysUntil: 0,
  };
}

/** Deterministic tie-break, per the spec's own priority framework (§18):
 * priority class -> materiality -> temporal proximity -> stable type order
 * -> stable fingerprint. Never array-insertion order or randomness.
 *
 * Materiality comparison is priority-tier-specific (see rankBasisPoints's
 * own doc comment): priority 1 (WK-01/WK-02) compares real dollar amounts —
 * "how much money is at stake" is meaningfully comparable there. Priority 2
 * (WK-03/WK-04) compares normalized concentration share instead — a raw
 * dollar comparison would systematically favour payment-source
 * concentration (whose materiality is a sum across every category) over
 * category concentration, regardless of which pattern is actually stronger. */
function compareInsights(a: WorthKnowingInsight, b: WorthKnowingInsight): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const rankDiff = a.priority === 1 ? b.materialityCents - a.materialityCents : b.rankBasisPoints - a.rankBasisPoints;
  if (rankDiff !== 0) return rankDiff;
  if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
  const typeOrderDiff = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  if (typeOrderDiff !== 0) return typeOrderDiff;
  return a.fingerprint.localeCompare(b.fingerprint);
}

/**
 * The single Worth Knowing selection — candidate generation, validation,
 * deduplication and ranking in one pure, deterministic function. Returns
 * `null` when no candidate clears its own qualification bar (a valid,
 * expected state — see this file's own header comment); never a generic
 * fallback.
 *
 * `timelineEvents` and `safeToSpend` are passed in rather than recomputed —
 * the exact same results TodayScreen.tsx already computed for Briefing/AUP,
 * so Worth Knowing can never disagree with what's already on screen about
 * what's due or what's available.
 */
export function pickWorthKnowingInsight(
  data: AppData,
  today: Date,
  timelineEvents: TimelineEvent[],
  safeToSpend: SafeToSpendResult,
  dedup: WorthKnowingBriefingContext
): WorthKnowingInsight | null {
  const candidates: WorthKnowingInsight[] = [];

  const cluster = buildUpcomingCommitmentCluster(timelineEvents);
  if (cluster) candidates.push(cluster);

  const material = buildMaterialUpcomingCommitment(timelineEvents, today, safeToSpend, dedup);
  if (material) candidates.push(material);

  const category = buildSpendingCategoryConcentration(data, today);
  if (category) candidates.push(category);

  const source = buildPaymentSourceConcentration(data, today);
  if (source) candidates.push(source);

  // General finite backstop (mirrors safeToSpend.ts's own convention) — a
  // candidate with a non-finite/negative materiality can never win, even if
  // an upstream computation somehow produced one; belt-and-braces, not a
  // substitute for each builder's own validation above.
  const valid = candidates.filter(
    (c) => Number.isFinite(c.materialityCents) && c.materialityCents >= 0 && Number.isFinite(c.rankBasisPoints) && Number.isFinite(c.daysUntil)
  );
  if (valid.length === 0) return null;

  valid.sort(compareInsights);
  return valid[0];
}
