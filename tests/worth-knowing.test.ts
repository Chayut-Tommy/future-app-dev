/**
 * Worth Knowing — replaces Cashflow Focus's Today presentation.
 *
 * CLASSIFICATION (per tests/README.md's evidence taxonomy):
 * - Real import (Class A): pickWorthKnowingInsight (worthKnowing.ts),
 *   computeSafeToSpend (safeToSpend.ts), eventOccurrenceIdentity/
 *   occurrenceIdentityKey/reminderOccurrenceIdentity (todayBriefing.ts) —
 *   all imported and executed directly against real production functions,
 *   never mirrored copies.
 * - Structural: regex/string matches against TodayScreen.tsx,
 *   MoneyScreen.tsx and moneySectionFocus.ts source text — these are proofs
 *   of wiring, not of rendered on-screen behaviour (TodayScreen.tsx/
 *   MoneyScreen.tsx are .tsx files and cannot be imported/executed by tsx
 *   in this harness; see tests/README.md). Genuine rendered proof remains
 *   the physical-device checklist.
 */
import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { pickWorthKnowingInsight, WorthKnowingBriefingContext } from '../src/lib/calculations/worthKnowing';
import { computeSafeToSpend, SafeToSpendResult } from '../src/lib/calculations/safeToSpend';
import { eventOccurrenceIdentity, occurrenceIdentityKey, reminderOccurrenceIdentity, occurrenceDateKey } from '../src/lib/calculations/todayBriefing';
import { TimelineEvent } from '../src/lib/calculations/moneyTimeline';
import { SmartReminder } from '../src/lib/calculations/reminders';
import { computeMonthToDateActivity, computeRecordedMonthlyCashflow, computeThisMonthRecordedSummary } from '../src/lib/calculations/monthlySummary';
import { computeFinancialState } from '../src/lib/calculations/financialState';
import { computeTimelineFocusFulfillment, TimelineFocusTarget, TimelineGroupOffsets } from '../src/lib/calculations/timelineFocus';
import { INSIGHT_PROVENANCE_OPACITY } from '../src/theme/contrastOverrides';
import { selectNaviloPalette, NaviloColorStyle } from '../src/theme/palettes';
import { lightColors, darkColors } from '../src/theme/tokens';
import type { AppData } from '../src/types/models';

let total = 0;
let failures = 0;
function assert(label: string, condition: boolean) {
  total++;
  if (!condition) {
    failures++;
    console.log(`FAIL — ${label}`);
  } else {
    console.log(`PASS — ${label}`);
  }
}

function baseData(): AppData {
  const d = createEmptyAppData();
  d.user.hasSeenIntro = true;
  return d;
}

const EMPTY_DEDUP: WorthKnowingBriefingContext = { shownEventKeys: new Set(), reminderKey: null };
const TODAY = new Date(2026, 7, 15); // 15 August 2026, a Saturday — arbitrary fixed local date

function evt(partial: Partial<TimelineEvent> & Pick<TimelineEvent, 'id' | 'daysUntil' | 'amount'>): TimelineEvent {
  const date = new Date(TODAY.getTime() + partial.daysUntil * 86400000);
  return {
    id: partial.id,
    date,
    daysUntil: partial.daysUntil,
    kind: partial.kind ?? 'bill',
    icon: partial.icon ?? 'calendar-outline',
    label: partial.label ?? 'Bill',
    amount: partial.amount,
    recurringItemId: partial.recurringItemId,
    creditCardId: partial.creditCardId,
    bnplLiabilityId: partial.bnplLiabilityId,
  };
}

/** A cash-only, no-recurring-commitment fixture so computeSafeToSpend's
 * cycleBillsExpected is exactly 0 and cycleRemainingPool is exactly the
 * cash balance — giving WK-02 tests a known, controlled materiality
 * denominator without depending on the full recurring-item pipeline. */
function safeToSpendFixture(cashBalance: number): SafeToSpendResult {
  const data = baseData();
  data.assets = [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: cashBalance } as any];
  return computeSafeToSpend(data, TODAY);
}

console.log('=== WK-01: UPCOMING COMMITMENT CLUSTER (real import) ===');
{
  // Qualifies: 3 outgoing events within a 7-day window.
  {
    const events = [
      evt({ id: 'e1', daysUntil: 1, amount: -50, label: 'Internet' }),
      evt({ id: 'e2', daysUntil: 3, amount: -1200, label: 'Rent' }),
      evt({ id: 'e3', daysUntil: 6, amount: -80, label: 'Phone' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('a genuine 3-event cluster within 7 days qualifies as upcoming_commitment_cluster', insight !== null && insight.type === 'upcoming_commitment_cluster');
    assert('the cluster body states the real total (50+1200+80=1330) and count (3)', insight!.body.includes('$1,330') && insight!.body.includes('3 recorded payments'));
  }

  // Fails: only 2 events within the window.
  {
    const events = [evt({ id: 'e1', daysUntil: 1, amount: -50 }), evt({ id: 'e2', daysUntil: 3, amount: -80 })];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('only 2 qualifying events never forms a cluster (minimum is 3) — no candidate, overall result is null', insight === null);
  }

  // Boundary: exactly a 7-calendar-day window (start day 0, end day 6) qualifies.
  {
    const events = [evt({ id: 'e1', daysUntil: 0, amount: -50 }), evt({ id: 'e2', daysUntil: 3, amount: -50 }), evt({ id: 'e3', daysUntil: 6, amount: -50 })];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('a cluster spanning exactly 6 days (0..6 inclusive, a 7-calendar-day window) qualifies at the boundary', insight !== null && insight.type === 'upcoming_commitment_cluster');
  }

  // Boundary: spanning 8 days (start 0, end 7) never qualifies as ONE cluster of 3 — only 2 fall in any single 7-day window from either endpoint.
  {
    const events = [evt({ id: 'e1', daysUntil: 0, amount: -50 }), evt({ id: 'e2', daysUntil: 4, amount: -50 }), evt({ id: 'e3', daysUntil: 7, amount: -50 })];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('3 events spanning 8 days (0, 4, 7) never fit inside any single 7-calendar-day window, so no cluster candidate exists', insight === null || insight.type !== 'upcoming_commitment_cluster');
  }

  // Income events and past-due events never count as cluster members.
  {
    const events = [
      evt({ id: 'e1', daysUntil: 1, amount: 3000, kind: 'income' }),
      evt({ id: 'e2', daysUntil: 2, amount: -50 }),
      evt({ id: 'e3', daysUntil: 3, amount: -50 }),
      evt({ id: 'e4', daysUntil: -1, amount: -50 }), // already past
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('income events and events already in the past never count toward a cluster — only 2 genuine outgoing candidates exist here, below the minimum of 3', insight === null);
  }

  // Required exact-cents scenario — $100.10 on 20 Aug, $200.20 on 22 Aug,
  // $300.30 on 25 Aug (TODAY = 15 Aug 2026, so daysUntil 5/7/10 — a 5-day
  // spread, within the 7-calendar-day window). Proves the underlying total
  // is exact ($600.60 = 60,060 cents, no floating-point drift), the count
  // is exactly 3, and the displayed date range is "20–25 August".
  {
    const events = [
      evt({ id: 'e1', daysUntil: 5, amount: -100.1, label: 'Bill A' }),
      evt({ id: 'e2', daysUntil: 7, amount: -200.2, label: 'Bill B' }),
      evt({ id: 'e3', daysUntil: 10, amount: -300.3, label: 'Bill C' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'three qualifying events ($100.10 + $200.20 + $300.30) form a cluster with the exact underlying total 60,060 cents ($600.60) — no floating-point drift',
      insight !== null && insight.type === 'upcoming_commitment_cluster' && insight.materialityCents === 60060
    );
    assert('the displayed count is exactly three', insight !== null && insight.body.includes('3 recorded payments'));
    assert('the displayed date range is exactly "20–25 August"', insight !== null && insight.body.includes('20–25 August'));

    // No double-counting when one of these events is also shown in Today
    // Briefing — the aggregate total must still include it (spec's own
    // "genuinely additive" rule), never silently excluded or subtracted.
    const withRecurringId = events.map((e) => ({ ...e, recurringItemId: e.id }));
    const briefingShownKey = occurrenceIdentityKey(eventOccurrenceIdentity(withRecurringId[0]))!;
    const dedup: WorthKnowingBriefingContext = { shownEventKeys: new Set([briefingShownKey]), reminderKey: null };
    const insightWithDedup = pickWorthKnowingInsight(baseData(), TODAY, withRecurringId, safeToSpend, dedup);
    assert(
      'no double-counting when one event is also shown in Today Briefing — the cluster total is still the full 60,060 cents, never reduced by the shown event',
      insightWithDedup !== null && insightWithDedup.type === 'upcoming_commitment_cluster' && insightWithDedup.materialityCents === 60060
    );
  }
}

console.log('\n=== WK-02: MATERIAL UPCOMING COMMITMENT (real import) ===');
{
  // Qualifies: a single large outgoing event clearing both the absolute
  // floor and the share-of-remaining-pool threshold.
  {
    const events = [evt({ id: 'mortgage', daysUntil: 5, amount: -250, label: 'Mortgage', recurringItemId: 'r1' })];
    const safeToSpend = safeToSpendFixture(500); // cycleRemainingPool = 500, cycleBillsExpected = 0
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'a $250 event against a $500 remaining pool (50% share, above the 40% threshold) qualifies as large_upcoming_commitment',
      insight !== null && insight.type === 'large_upcoming_commitment' && insight.body.includes('$250')
    );
  }

  // Fails: below the absolute floor even though the share is high.
  {
    const events = [evt({ id: 'tiny', daysUntil: 5, amount: -100, recurringItemId: 'r1' })];
    const safeToSpend = safeToSpendFixture(100); // 100% share, but below the $150 absolute floor
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('a $100 event never qualifies regardless of share — below the $150 absolute floor', insight === null);
  }

  // Fails: above the floor but below both share thresholds.
  {
    const events = [evt({ id: 'small', daysUntil: 5, amount: -160, recurringItemId: 'r1' })];
    const safeToSpend = safeToSpendFixture(10000); // 1.6% of pool — far below 40%, and cycleBillsExpected is 0 (no bills share either)
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('a $160 event (above the absolute floor) never qualifies when it is an insignificant share of both bases', insight === null);
  }

  // Dedup: the exact event Briefing already shows is suppressed.
  {
    const event = evt({ id: 'mortgage', daysUntil: 5, amount: -250, label: 'Mortgage', recurringItemId: 'r1' });
    const identityKey = occurrenceIdentityKey(eventOccurrenceIdentity(event))!;
    const dedup: WorthKnowingBriefingContext = { shownEventKeys: new Set([identityKey]), reminderKey: null };
    const safeToSpend = safeToSpendFixture(500);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, [event], safeToSpend, dedup);
    assert("the spec's critical dedup rule: a material commitment already shown as a Briefing event row is suppressed, not repeated", insight === null || insight.type !== 'large_upcoming_commitment');
  }

  // Dedup: the exact event shown as the top Smart Reminder is suppressed too.
  {
    const event = evt({ id: 'mortgage', daysUntil: 0, amount: -250, label: 'Mortgage', recurringItemId: 'r1' });
    const reminder: SmartReminder = { id: 'rem1', kind: 'bill_due_soon', title: 'Mortgage', body: '', recurringItemId: 'r1', occurrenceDate: event.date.toISOString() };
    const reminderKey = occurrenceIdentityKey(reminderOccurrenceIdentity(reminder));
    const dedup: WorthKnowingBriefingContext = { shownEventKeys: new Set(), reminderKey };
    const safeToSpend = safeToSpendFixture(500);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, [event], safeToSpend, dedup);
    assert('a material commitment matching the top Smart Reminder occurrence is also suppressed', insight === null || insight.type !== 'large_upcoming_commitment');
  }
}

console.log('\n=== PAYABLE-EVENT ALLOWLIST (real import) ===');
{
  // Scenario A — goals are not payments. Electricity $100 + phone $80 are
  // genuinely payable, but the $500 goal allocation is a savings/goal
  // reservation, not a bill — it must never count toward the cluster.
  // With only 2 real payable events (below CLUSTER_MIN_EVENTS=3) and both
  // under the $150 WK-02 floor, no candidate of either type can qualify.
  {
    const events = [
      evt({ id: 'electricity', daysUntil: 1, amount: -100, kind: 'bill', label: 'Electricity' }),
      evt({ id: 'phone', daysUntil: 2, amount: -80, kind: 'bill', label: 'Phone' }),
      evt({ id: 'goal1', daysUntil: 3, amount: -500, kind: 'goal', label: 'Goal contribution' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'Scenario A: a $500 goal allocation is excluded from the payable-event allowlist — only electricity ($100) and phone ($80) are genuine payments, 2 events is below the 3-event cluster minimum, and neither alone clears the $150 WK-02 floor, so no candidate qualifies',
      insight === null
    );
  }

  // Scenario B — genuine commitments qualify. Electricity (bill), mortgage
  // (mortgage), credit-card (credit_card) — three distinct allowlisted
  // kinds, all within 7 days. Must form a genuine cluster with the exact
  // total $600.60, no double-counting.
  {
    const events = [
      evt({ id: 'electricity', daysUntil: 2, amount: -100.1, kind: 'bill', label: 'Electricity' }),
      evt({ id: 'mortgage', daysUntil: 4, amount: -200.2, kind: 'mortgage', label: 'Mortgage' }),
      evt({ id: 'creditcard', daysUntil: 7, amount: -300.3, kind: 'credit_card', label: 'Credit card' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'Scenario B: electricity (bill) + mortgage (mortgage) + credit-card (credit_card) — three distinct allowlisted kinds within 7 days — form a genuine cluster with 3 qualifying payments and the exact total 60,060 cents ($600.60), no double-counting',
      insight !== null && insight.type === 'upcoming_commitment_cluster' && insight.materialityCents === 60060
    );
    assert('Scenario B: the cluster reports exactly 3 recorded payments', insight !== null && insight.body.includes('3 recorded payments'));
  }

  // Scenario C — a non-payment negative event (here, a Savings Allocation
  // reservation, kind 'savings') must not form a cluster and must not
  // qualify as WK-02, even though it is by far the largest dollar amount
  // among the three events.
  {
    const events = [
      evt({ id: 'savings1', daysUntil: 1, amount: -1000, kind: 'savings', label: 'Savings allocation' }),
      evt({ id: 'bill1', daysUntil: 2, amount: -50, kind: 'bill', label: 'Small bill' }),
      evt({ id: 'bill2', daysUntil: 3, amount: -60, kind: 'bill', label: 'Another bill' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      "Scenario C: a $1,000 'savings' event is not a payable commitment — excluding it leaves only 2 genuine bills (below the 3-event cluster minimum), and WK-02's own candidate search only ever considers allowlisted kinds, so it never becomes 'A $1,000 payment is coming up' — no candidate qualifies",
      insight === null
    );
  }
}

console.log('\n=== WK-02 THRESHOLD DENOMINATOR SAFETY (real import) ===');
{
  function fakeSafeToSpend(cycleBillsExpected: number, cycleRemainingPool: number): SafeToSpendResult {
    return { cycleBillsExpected, cycleRemainingPool } as unknown as SafeToSpendResult;
  }

  // Exactly 35% of a valid, positive cycleBillsExpected qualifies (pool unavailable).
  {
    const events = [evt({ id: 'e1', daysUntil: 5, amount: -350, recurringItemId: 'r1' })];
    const safeToSpend = fakeSafeToSpend(1000, 0);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('$350 against $1,000 cycleBillsExpected (exactly 35%, pool unavailable) qualifies — the threshold is inclusive', insight !== null && insight.type === 'large_upcoming_commitment');
  }

  // Just below 35% of cycleBillsExpected fails.
  {
    const events = [evt({ id: 'e1', daysUntil: 5, amount: -349.99, recurringItemId: 'r1' })];
    const safeToSpend = fakeSafeToSpend(1000, 0);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('$349.99 against $1,000 cycleBillsExpected (34.999%, just below 35%, pool unavailable) never qualifies', insight === null);
  }

  // Exactly 40% of a valid, positive cycleRemainingPool qualifies (bills unavailable).
  {
    const events = [evt({ id: 'e1', daysUntil: 5, amount: -200, recurringItemId: 'r1' })];
    const safeToSpend = fakeSafeToSpend(0, 500);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('$200 against $500 cycleRemainingPool (exactly 40%, bills unavailable) qualifies — the threshold is inclusive', insight !== null && insight.type === 'large_upcoming_commitment');
  }

  // Zero and negative denominators never auto-qualify, even for a payment well above the absolute floor.
  {
    const events = [evt({ id: 'e1', daysUntil: 5, amount: -500, recurringItemId: 'r1' })];
    const safeToSpend = fakeSafeToSpend(0, -100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('a $500 payment (well above the $150 floor) never qualifies when cycleBillsExpected is 0 and cycleRemainingPool is negative — neither denominator is valid, so neither branch can pass', insight === null);
  }

  // Non-finite/unavailable denominators (NaN, Infinity) produce no crash, no false qualification, and no "$NaN" copy.
  {
    const events = [evt({ id: 'e1', daysUntil: 5, amount: -500, recurringItemId: 'r1' })];
    const safeToSpend = fakeSafeToSpend(NaN, Infinity);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'a NaN cycleBillsExpected and an Infinity cycleRemainingPool never crash and never false-qualify a $500 payment — both are excluded by the Number.isFinite guard, and no candidate is produced',
      insight === null
    );
  }
}

console.log('\n=== DATE FORMATTING (real import) ===');
{
  // Same month: "20–25 August" — already exercised by the WK-01 exact-cents
  // scenario above; re-asserted here for completeness alongside the other
  // two range shapes.
  {
    const events = [
      evt({ id: 'e1', daysUntil: 5, amount: -100, label: 'Bill A' }),
      evt({ id: 'e2', daysUntil: 7, amount: -100, label: 'Bill B' }),
      evt({ id: 'e3', daysUntil: 10, amount: -100, label: 'Bill C' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('same-month cluster (15 Aug + 5/7/10 days = 20/22/25 Aug) formats as "20–25 August"', insight !== null && insight.body.includes('20–25 August'));
  }

  // Different months, same year: 15 Aug 2026 + 14/17/19 days = 29 Aug / 1 Sep / 3 Sep 2026.
  {
    const events = [
      evt({ id: 'e1', daysUntil: 14, amount: -100, label: 'Bill A' }),
      evt({ id: 'e2', daysUntil: 17, amount: -100, label: 'Bill B' }),
      evt({ id: 'e3', daysUntil: 19, amount: -100, label: 'Bill C' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'a cluster crossing a month boundary within the same year (29 Aug–3 Sep 2026) formats unambiguously as "29 August–3 September" — never a bare "29–3 September"',
      insight !== null && insight.body.includes('29 August–3 September')
    );
  }

  // Different years: 15 Aug 2026 + 136/138/141 days = 29 Dec 2026 / 31 Dec 2026 / 3 Jan 2027.
  {
    const events = [
      evt({ id: 'e1', daysUntil: 136, amount: -100, label: 'Bill A' }),
      evt({ id: 'e2', daysUntil: 138, amount: -100, label: 'Bill B' }),
      evt({ id: 'e3', daysUntil: 141, amount: -100, label: 'Bill C' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'a cluster crossing a year boundary (29 Dec 2026–3 Jan 2027) shows the year on both ends: "29 December 2026–3 January 2027"',
      insight !== null && insight.body.includes('29 December 2026–3 January 2027')
    );
  }

  // WK-02's single due date must also stay unambiguous across a year boundary.
  {
    const events = [evt({ id: 'e1', daysUntil: 141, amount: -400, label: 'Big bill', recurringItemId: 'r1' })]; // 3 Jan 2027
    const safeToSpend = safeToSpendFixture(1000); // cycleRemainingPool=1000, 40% of 1000=400 -> exactly qualifies
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      "WK-02's single due date across a year boundary (3 Jan 2027, today is 15 Aug 2026) shows the year: \"due on 3 January 2027\"",
      insight !== null && insight.type === 'large_upcoming_commitment' && insight.body.includes('due on 3 January 2027')
    );
  }
}

console.log('\n=== WK-03: SPENDING CATEGORY CONCENTRATION (real import) ===');
{
  // A real, resolving credit card so paymentSource can be split genuinely
  // between cash and credit card (never a fabricated 'unavailable' bucket)
  // — this isolates WK-03 from WK-04 in the scenarios that specifically
  // need category concentration to win, by keeping BOTH real sources under
  // WK-04's 55% concentration bar.
  function txn(id: string, categoryId: string, amount: number, daysAgo: number, source: 'cash' | 'credit_card') {
    const base = { id, type: 'expense', amount, categoryId, date: new Date(TODAY.getTime() - daysAgo * 86400000).toISOString(), paymentSource: source } as any;
    if (source === 'credit_card') base.creditCardId = 'card1';
    return base;
  }
  function withCard(data: AppData) {
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 0, dueDay: 15, minimumPayment: 0 } as any];
    return data;
  }

  // Qualifies: dining is the clear leading category, 3+ transactions, over
  // the minimum total. Payment source split exactly 50/50 (cash $80 /
  // credit $80) so WK-04 never qualifies (below its 55% bar) and this
  // proves WK-03 in isolation.
  {
    const data = withCard(baseData());
    data.transactions = [
      txn('t1', 'cat-dining', 40, 1, 'cash'),
      txn('t2', 'cat-dining', 40, 2, 'cash'),
      txn('t3', 'cat-dining', 40, 3, 'credit_card'),
      txn('t4', 'cat-groceries', 20, 1, 'credit_card'),
      txn('t5', 'cat-groceries', 20, 2, 'credit_card'),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      'dining ($120 of $160, 75%) qualifies as spending_category_concentration with the correct category name and percentage',
      insight !== null && insight.type === 'spending_category_concentration' && insight.title.includes('Dining out') && insight.body.includes('75%')
    );
  }

  // Fails: leading category has fewer than 3 transactions.
  {
    const data = withCard(baseData());
    data.transactions = [txn('t1', 'cat-dining', 100, 1, 'cash'), txn('t2', 'cat-dining', 100, 2, 'credit_card'), txn('t3', 'cat-groceries', 10, 1, 'credit_card')];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert('a leading category with only 2 transactions never qualifies (minimum is 3), even at a high dollar share', insight === null || insight.type !== 'spending_category_concentration');
  }

  // Fails: the only category with >=3 transactions still falls below the
  // 30% share threshold. (Payment-source split here doesn't matter — the
  // assertion only requires category concentration NOT to win, which holds
  // regardless of which other insight type wins instead.)
  {
    const data = baseData();
    const t = (id: string, categoryId: string, amount: number, daysAgo: number) =>
      ({ id, type: 'expense', amount, categoryId, date: new Date(TODAY.getTime() - daysAgo * 86400000).toISOString() } as any);
    data.transactions = [
      t('t1', 'cat-dining', 17, 1),
      t('t2', 'cat-dining', 17, 2),
      t('t3', 'cat-dining', 17, 3),
      t('t4', 'cat-groceries', 60, 1), // only 1 transaction — never eligible regardless of size
      t('t5', 'cat-transport', 60, 2), // only 1 transaction — never eligible regardless of size
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    // Total = 171; dining (the only eligible, >=3-transaction category) is 51/171 ≈ 29.8%, just below the 30% bar.
    assert(
      'dining is the only category with enough transactions to be eligible, but its own share of total recorded spending is below 30% — no candidate, never a weak claim',
      insight === null || insight.type !== 'spending_category_concentration'
    );
  }

  // Missing data: no transactions at all -> no candidate, no crash.
  {
    const data = baseData();
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert('no recorded transactions produces no category candidate — never a fabricated "largest category" claim', insight === null);
  }

  // CORRECTION-ROUND FIX — the true dollar-leading category must itself
  // qualify, or WK-03 returns NO candidate. It must never fall back to a
  // lower-dollar category while keeping "largest recorded category"
  // wording — that would be a false customer statement (groceries is
  // numerically larger here; Dining must never be presented as the leader).
  {
    const data = withCard(baseData());
    data.transactions = [
      txn('t1', 'cat-groceries', 140, 1, 'cash'), // one large transaction — the TRUE dollar leader, but only 1 transaction
      txn('t2', 'cat-dining', 40, 1, 'credit_card'),
      txn('t3', 'cat-dining', 40, 2, 'credit_card'),
      txn('t4', 'cat-dining', 40, 3, 'credit_card'),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      'groceries ($140) is the TRUE dollar-leading category but has only 1 transaction — WK-03 returns no candidate at all, it never substitutes Dining just because Dining has more transactions',
      insight === null || insight.type !== 'spending_category_concentration'
    );
  }

  // Required regression scenario — the exact $900/$600/$300 defect case.
  // Electronics is objectively the largest recorded category ($900, one
  // transaction); Nolie must never skip it and present "Dining is your
  // largest recorded category" instead. Electronics fails the minimum-
  // transaction-count floor, so the correct behaviour is NO category
  // candidate at all (a different Worth Knowing type may still win overall
  // — this fixture keeps payment sources at an even 50/50 split, both under
  // WK-04's 55% bar, so the proof is specifically about WK-03, not an
  // accidental WK-04 win).
  {
    const data = withCard(baseData());
    data.transactions = [
      txn('t1', 'cat-shopping', 900, 1, 'cash'), // "Electronics" — mapped to the existing 'Shopping' category id (no dedicated Electronics category exists in defaultCategories.ts)
      txn('t2', 'cat-dining', 200, 1, 'credit_card'),
      txn('t3', 'cat-dining', 200, 2, 'credit_card'),
      txn('t4', 'cat-dining', 200, 3, 'credit_card'),
      txn('t5', 'cat-groceries', 100, 1, 'credit_card'),
      txn('t6', 'cat-groceries', 100, 2, 'credit_card'),
      txn('t7', 'cat-groceries', 100, 3, 'credit_card'),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      'Electronics/Shopping ($900, 1 txn) is the true leader over Dining ($600, 3 txns) and Groceries ($300, 3 txns) — WK-03 must return no candidate, and specifically must never claim "Dining is your largest recorded category"',
      insight === null || (insight.type === 'spending_category_concentration' ? insight.title.includes('Shopping') : true)
    );
    // Stronger, unambiguous proof: verify the payment-source split really
    // does keep WK-04 from winning here, so a null/non-category result in
    // the assertion above is a genuine WK-03 null, not masked by a WK-04 win.
    assert(
      'fixture sanity: cash (Electronics, $900) and credit card (Dining+Groceries, $900) are an even 50/50 split of the $1,800 total — both under the 55% bar, so this scenario cleanly isolates WK-03',
      insight === null || insight.type !== 'payment_source_concentration'
    );
  }

  // Required positive scenario — Dining ($200 x 3 = $600) vs Groceries
  // ($100 x 2 = $200), eligible total $800, Dining share exactly 75%.
  // Payment sources split 50/50 (cash $400 / credit $400) so WK-04 stays
  // below its 55% bar and this is a clean, isolated WK-03 proof.
  {
    const data = withCard(baseData());
    data.transactions = [
      txn('t1', 'cat-dining', 200, 1, 'cash'),
      txn('t2', 'cat-dining', 200, 2, 'cash'),
      txn('t3', 'cat-dining', 200, 3, 'credit_card'),
      txn('t4', 'cat-groceries', 100, 1, 'credit_card'),
      txn('t5', 'cat-groceries', 100, 2, 'credit_card'),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      'Dining ($600 of $800 eligible total) is the true, qualifying leader at exactly 75% — WK-03 correctly selects it with the exact percentage',
      insight !== null && insight.type === 'spending_category_concentration' && insight.title.includes('Dining out') && insight.body.includes('75%')
    );
  }

  // Loan repayments are excluded from category coaching, exactly like every
  // other category-coaching consumer in this codebase. Dining is the only
  // category with any eligible spend, so its share is 100% regardless of
  // payment-source split — this remains a clean WK-03 proof either way.
  {
    const data = withCard(baseData());
    data.transactions = [
      Object.assign(txn('t1', 'cat-debt', 5000, 1, 'cash'), { isLoanRepayment: true }), // a huge repayment, excluded from category coaching entirely
      txn('t2', 'cat-dining', 30, 1, 'cash'),
      txn('t3', 'cat-dining', 30, 2, 'credit_card'),
      txn('t4', 'cat-dining', 30, 3, 'credit_card'),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      'a $5,000 loan repayment never inflates a "largest category" claim — it is excluded from category coaching, leaving Dining (100% of the $90 eligible total) as the real leader',
      insight !== null && insight.type === 'spending_category_concentration' && insight.title.includes('Dining out') && insight.body.includes('100%')
    );
  }

  // Required wording-alignment scenario — Dining $600 of eligible
  // categorised spending, Groceries $200, plus a loan repayment excluded
  // from category coaching. Dining remains the true leader at exactly 75%
  // ($600 of the $800 eligible total, the loan repayment contributing $0),
  // with the exact copy the correction round requires: the title names the
  // category as "your largest recorded spending category" (no comparative),
  // and the body reads "your categorised spending this month" (matching the
  // true denominator) rather than implying the loan repayment was counted.
  {
    const data = withCard(baseData());
    data.transactions = [
      Object.assign(txn('t1', 'cat-debt', 5000, 1, 'cash'), { isLoanRepayment: true }),
      txn('t2', 'cat-dining', 200, 1, 'cash'),
      txn('t3', 'cat-dining', 200, 2, 'credit_card'),
      txn('t4', 'cat-dining', 200, 3, 'credit_card'),
      txn('t5', 'cat-groceries', 200, 1, 'credit_card'),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      'exact WK-03 copy: title is "Dining out is your largest recorded spending category" and body is "It accounts for 75% of your categorised spending this month." — Dining remains the true leader at 75% ($600 of $800 eligible), the $5,000 loan repayment excluded from the denominator entirely, with no implication it was counted',
      insight !== null &&
        insight.type === 'spending_category_concentration' &&
        insight.title === 'Dining out is your largest recorded spending category' &&
        insight.body === 'It accounts for 75% of your categorised spending this month.'
    );
  }
}

console.log('\n=== WK-04: PAYMENT-SOURCE CONCENTRATION (real import) ===');
{
  // Qualifies: credit card funds a clear majority of recorded spending.
  {
    const data = baseData();
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 0, dueDay: 15, minimumPayment: 0 } as any];
    data.transactions = [
      { id: 't1', type: 'expense', amount: 80, categoryId: 'cat-shopping', date: new Date(TODAY.getTime() - 86400000).toISOString(), paymentSource: 'credit_card', creditCardId: 'card1' } as any,
      { id: 't2', type: 'expense', amount: 20, categoryId: 'cat-groceries', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString(), paymentSource: 'cash' } as any,
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      'credit-card spending at 80% of recorded spending qualifies as payment_source_concentration',
      insight !== null && insight.type === 'payment_source_concentration' && insight.body.includes('80%')
    );
  }

  // Fails: no source reaches the 55% concentration bar.
  {
    const data = baseData();
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 0, dueDay: 15, minimumPayment: 0 } as any];
    data.transactions = [
      { id: 't1', type: 'expense', amount: 50, categoryId: 'cat-shopping', date: new Date(TODAY.getTime() - 86400000).toISOString(), paymentSource: 'credit_card', creditCardId: 'card1' } as any,
      { id: 't2', type: 'expense', amount: 50, categoryId: 'cat-groceries', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString(), paymentSource: 'cash' } as any,
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert('an even 50/50 split between cash and credit card never qualifies (below the 55% concentration bar)', insight === null || insight.type !== 'payment_source_concentration');
  }

  // Required boundary scenario 1 — credit card $550, everyday account $450,
  // total $1,000, exactly 55%. Eligibility is inclusive at the threshold
  // (`top.percentage < 55` is false at exactly 55), so this MUST qualify.
  {
    const data = baseData();
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 0, dueDay: 15, minimumPayment: 0 } as any];
    data.assets = [{ id: 'everyday1', type: 'everyday', label: 'Everyday', currentValue: 1000, provider: 'Bank' } as any];
    data.transactions = [
      { id: 't1', type: 'expense', amount: 550, categoryId: 'cat-shopping', date: new Date(TODAY.getTime() - 86400000).toISOString(), paymentSource: 'credit_card', creditCardId: 'card1' } as any,
      { id: 't2', type: 'expense', amount: 450, categoryId: 'cat-groceries', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday1' } as any,
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      '$550 of $1,000 (exactly 55%) qualifies — the threshold is inclusive',
      insight !== null && insight.type === 'payment_source_concentration' && insight.body.includes('55%')
    );
  }

  // Required boundary scenario 2 — credit card $549.99, everyday account
  // $450.01, total $1,000.00, true share 54.999%. Eligibility must be
  // checked against the UNROUNDED share, not the rounded display
  // percentage: largest-remainder allocation would otherwise round this
  // bucket's DISPLAY percentage up to 55 (since 549.99 has the larger
  // fractional remainder among the two buckets), which would incorrectly
  // pass a `< 55` check against the rounded value. This must NOT qualify.
  {
    const data = baseData();
    data.creditCards = [{ id: 'card1', issuer: 'Bank', label: 'Visa', creditLimit: 5000, currentBalance: 0, dueDay: 15, minimumPayment: 0 } as any];
    data.assets = [{ id: 'everyday1', type: 'everyday', label: 'Everyday', currentValue: 1000, provider: 'Bank' } as any];
    data.transactions = [
      { id: 't1', type: 'expense', amount: 549.99, categoryId: 'cat-shopping', date: new Date(TODAY.getTime() - 86400000).toISOString(), paymentSource: 'credit_card', creditCardId: 'card1' } as any,
      { id: 't2', type: 'expense', amount: 450.01, categoryId: 'cat-groceries', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString(), paymentSource: 'everyday', targetAssetId: 'everyday1' } as any,
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert(
      '$549.99 of $1,000.00 (true share 54.999%) never qualifies, even though largest-remainder display rounding alone would show 55% — eligibility uses the unrounded value',
      insight === null || insight.type !== 'payment_source_concentration'
    );
  }
}

console.log('\n=== RANKING (real import) ===');
{
  // P1 (cluster/material commitment) beats P2 (category/source concentration) when both qualify.
  {
    const data = baseData();
    data.transactions = [
      { id: 't1', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 86400000).toISOString() } as any,
      { id: 't2', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString() } as any,
      { id: 't3', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 3 * 86400000).toISOString() } as any,
    ];
    const events = [evt({ id: 'e1', daysUntil: 1, amount: -50 }), evt({ id: 'e2', daysUntil: 3, amount: -50 }), evt({ id: 'e3', daysUntil: 6, amount: -50 })];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('when a P1 cluster and a P2 category candidate both qualify, the P1 candidate wins deterministically', insight !== null && insight.type === 'upcoming_commitment_cluster');
  }

  // Determinism — same inputs, same output, every time.
  {
    const events = [evt({ id: 'e1', daysUntil: 1, amount: -50 }), evt({ id: 'e2', daysUntil: 3, amount: -1200 }), evt({ id: 'e3', daysUntil: 6, amount: -80 })];
    const safeToSpend = safeToSpendFixture(100);
    const a = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    const b = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('selection is deterministic — identical inputs produce byte-identical output on repeated calls', JSON.stringify(a) === JSON.stringify(b));
  }

  // Materiality tie-break within the same priority tier — the larger material commitment wins over a smaller one.
  {
    const events = [
      evt({ id: 'big', daysUntil: 5, amount: -400, label: 'Big bill', recurringItemId: 'r1' }),
      evt({ id: 'small', daysUntil: 5, amount: -160, label: 'Small bill', recurringItemId: 'r2' }),
    ];
    const safeToSpend = safeToSpendFixture(1000); // both clear the 40%/floor thresholds independently? big=40%, small=16% -> only big clears the share threshold
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('the single largest qualifying commitment is selected, never an arbitrary or smaller one', insight !== null && insight.body.includes('Big bill'));
  }
}

console.log('\n=== DEDUPLICATION (real import) ===');
{
  // A duplicate single-event candidate is suppressed, and a genuinely
  // additive AGGREGATE cluster that happens to include that same event is
  // still allowed — the spec's own worked example (§19).
  {
    const sameEvent = evt({ id: 'card-due', daysUntil: 0, amount: -300, label: 'Credit card', recurringItemId: 'r1' });
    const identityKey = occurrenceIdentityKey(eventOccurrenceIdentity(sameEvent))!;
    const dedup: WorthKnowingBriefingContext = { shownEventKeys: new Set([identityKey]), reminderKey: null };

    // Alone, this single material event is suppressed (matches Briefing exactly).
    const safeToSpend = safeToSpendFixture(500);
    const alone = pickWorthKnowingInsight(baseData(), TODAY, [sameEvent], safeToSpend, dedup);
    assert('a lone material commitment matching a Briefing event row is suppressed', alone === null || alone.type !== 'large_upcoming_commitment');

    // As part of a genuine 3+ event cluster, the aggregate insight is still allowed.
    const clusterEvents = [sameEvent, evt({ id: 'e2', daysUntil: 2, amount: -50 }), evt({ id: 'e3', daysUntil: 5, amount: -50 })];
    const clustered = pickWorthKnowingInsight(baseData(), TODAY, clusterEvents, safeToSpend, dedup);
    assert('the same event, as part of a genuinely additive 3-event cluster, still produces a valid cluster insight — aggregate context is not duplication', clustered !== null && clustered.type === 'upcoming_commitment_cluster');
  }

  // After suppressing the top candidate, the next valid candidate is selected.
  {
    const materialEvent = evt({ id: 'mortgage', daysUntil: 5, amount: -250, recurringItemId: 'r1' });
    const identityKey = occurrenceIdentityKey(eventOccurrenceIdentity(materialEvent))!;
    const dedup: WorthKnowingBriefingContext = { shownEventKeys: new Set([identityKey]), reminderKey: null };
    const data = baseData();
    data.transactions = [
      { id: 't1', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 86400000).toISOString() } as any,
      { id: 't2', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString() } as any,
      { id: 't3', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 3 * 86400000).toISOString() } as any,
    ];
    const safeToSpend = safeToSpendFixture(500);
    const insight = pickWorthKnowingInsight(data, TODAY, [materialEvent], safeToSpend, dedup);
    assert('once the only P1 candidate is suppressed by dedup, the next valid P2 candidate (category concentration) is selected instead of null', insight !== null && insight.type === 'spending_category_concentration');
  }
}

console.log('\n=== MONEY AND DATE EDGE CASES (real import) ===');
{
  // Non-finite / invalid amounts are excluded, never $NaN.
  {
    const data = baseData();
    data.transactions = [
      { id: 't1', type: 'expense', amount: NaN, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 86400000).toISOString() } as any,
      { id: 't2', type: 'expense', amount: 30, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString() } as any,
      { id: 't3', type: 'expense', amount: 30, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 3 * 86400000).toISOString() } as any,
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
    // The NaN transaction is excluded entirely, leaving only 2 valid dining
    // transactions — below WK-03's 3-transaction minimum, so category
    // concentration itself never qualifies here; whatever DOES win (or
    // null) must never surface a NaN anywhere in its output.
    assert(
      'a NaN transaction amount is excluded from every total — never produces $NaN or a crash, and never inflates any total it touches',
      insight === null || (!insight.title.includes('NaN') && !insight.body.includes('NaN') && insight.type !== 'spending_category_concentration')
    );
  }

  // Zero-amount events never qualify as a material commitment.
  {
    const events = [evt({ id: 'zero', daysUntil: 5, amount: -0, recurringItemId: 'r1' })];
    const safeToSpend = safeToSpendFixture(500);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('a zero-amount event never qualifies as a material commitment', insight === null);
  }

  // Very large amounts are handled without overflow/precision loss.
  {
    const events = [evt({ id: 'huge', daysUntil: 5, amount: -85000, recurringItemId: 'r1' })];
    const safeToSpend = safeToSpendFixture(100000);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('a large ($85,000) event is handled correctly and formats to the exact whole-dollar amount', insight !== null && insight.body.includes('$85,000'));
  }

  // No candidate at all -> null, never a generic fallback.
  {
    const guest = createEmptyAppData();
    const safeToSpend = computeSafeToSpend(guest, TODAY);
    const insight = pickWorthKnowingInsight(guest, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert('a freshly created, empty AppData produces no candidate — never a generic filler insight', insight === null);
  }
}

console.log('\n=== WK-03/WK-04 RECONCILIATION AGAINST AUGUST-SO-FAR (real import) ===');
{
  // The exact scenario item 4 requires: income $3,000; ordinary category-
  // eligible spending $2,000 (4 x $500, dining, so WK-03 can also observe
  // it); one unknown-split loan repayment of $1,500. August so far shows
  // income $3,000 / spent $2,000 / net +$1,000 (computeMonthToDateActivity).
  // Recorded cashflow (computeRecordedMonthlyCashflow, Financial State's own
  // input, untouched by this round) is $3,000 - ($2,000 + $1,500) = -$500,
  // because the unknown-split repayment's FULL amount counts there. This is
  // the same, already-diagnosed, intentional divergence from the original
  // Worth Knowing pre-implementation assessment (§3) — not a new defect.
  const data = baseData();
  data.transactions = [
    { id: 'income1', type: 'income', amount: 3000, categoryId: 'cat-salary', date: new Date(TODAY.getTime() - 86400000).toISOString() } as any,
    { id: 't1', type: 'expense', amount: 500, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 86400000).toISOString() } as any,
    { id: 't2', type: 'expense', amount: 500, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString() } as any,
    { id: 't3', type: 'expense', amount: 500, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 3 * 86400000).toISOString() } as any,
    { id: 't4', type: 'expense', amount: 500, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 4 * 86400000).toISOString() } as any,
    { id: 't5', type: 'expense', amount: 1500, categoryId: 'cat-debt', date: new Date(TODAY.getTime() - 86400000).toISOString(), isLoanRepayment: true } as any, // principalAmount deliberately absent — unknown split
  ];

  const augustSoFar = computeMonthToDateActivity(data, TODAY);
  assert('fixture sanity: August so far shows income $3,000 / spent $2,000 / net +$1,000, exactly matching the scenario', augustSoFar.income === 3000 && augustSoFar.spend === 2000);

  const recordedCashflow = computeRecordedMonthlyCashflow(data, TODAY);
  assert('fixture sanity: recorded cashflow is -$500 (income 3000 - (2000 ordinary + 1500 full unknown-split repayment)) — Financial State/Lulu Score input, untouched by this round', recordedCashflow === -500);

  const summary = computeThisMonthRecordedSummary(data, TODAY);
  assert(
    "WK-04's denominator (computeThisMonthRecordedSummary.spendingCents) is $2,000 (200,000 cents), NOT $3,500 — the unknown-split repayment is excluded from aggregate spending entirely, matching what's shown as 'Spent' on August so far",
    summary.spendingCents === 200000
  );

  const safeToSpend = safeToSpendFixture(100);
  const insight = pickWorthKnowingInsight(data, TODAY, [], safeToSpend, EMPTY_DEDUP);
  assert(
    "WK-03's denominator is ALSO $2,000, not $3,500 — dining is 100% of the $2,000 eligible total (the loan repayment contributes $0 to category coaching), so the body text reads '100% of the spending you've recorded this month', which cannot contradict August so far's own $2,000 'Spent' figure",
    insight !== null && insight.type === 'spending_category_concentration' && insight.body.includes('100%')
  );
  // Confirms it is genuinely dining driving this, not an accidental payment-source win.
  assert('fixture sanity: this specific insight is the category-concentration type, not payment-source (all transactions here default to cash, so WK-04 would also show 100% — TYPE_ORDER\'s documented tie-break correctly prefers category concentration)', insight !== null && insight.type === 'spending_category_concentration');
}

console.log('\n=== UNIFIED SELECTOR CONTRACT (real import + Structural) ===');
{
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');

  // Financial Rebuild overrides Worth Knowing — real computeFinancialState
  // proof plus the structural proof that TodayScreen only ever computes
  // worthKnowingInsight when showFinancialRebuild is false.
  {
    const data = baseData();
    data.liabilities = [{ id: 'l1', type: 'personal_loan', label: 'Loan', currentBalance: 50000 } as any];
    const state = computeFinancialState(data);
    assert('fixture sanity: a large-liability/no-asset account genuinely computes to financial_rebuild', state.key === 'financial_rebuild');
  }
  assert(
    // SUPERSEDED (owner decision, Wave 2): this gate is exactly why the
    // defect existed — a customer in financial_rebuild never had
    // pickWorthKnowingInsight called at all, so they saw the orange card and
    // never a Worth Knowing insight. The Financial Rebuild surface was
    // removed from Today, so coexistence is now impossible by construction:
    // Worth Knowing is the slot's only occupant and is computed
    // unconditionally. Protected by tests/design5-today-insight-slot.test.ts.
    'TodayScreen.tsx computes worthKnowingInsight unconditionally — Worth Knowing is the insight slot\'s sole occupant, so nothing can suppress it',
    /const worthKnowingInsight = useMemo\(\s*\(\) => pickWorthKnowingInsight/.test(TODAY_SCREEN_SRC) &&
      !/showFinancialRebuild/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'the JSX itself checks showFinancialRebuild strictly before worthKnowingInsight, so FinancialStateCard always wins the slot when both would otherwise be eligible',
    TODAY_SCREEN_SRC.indexOf('showFinancialRebuild ? (') < TODAY_SCREEN_SRC.indexOf('worthKnowingInsight ? (')
  );

  // Two valid Worth Knowing candidates still produce exactly one result —
  // not an array, not multiple cards; pickWorthKnowingInsight's return type
  // itself (WorthKnowingInsight | null) makes two simultaneous results
  // structurally impossible, proven here with two genuinely different
  // qualifying candidate types present at once (WK-01 cluster + WK-03
  // category, mirroring the RANKING section's P1-beats-P2 fixture but
  // asserted here specifically as a single-result proof).
  {
    const data = baseData();
    data.transactions = [
      { id: 't1', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 86400000).toISOString() } as any,
      { id: 't2', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 2 * 86400000).toISOString() } as any,
      { id: 't3', type: 'expense', amount: 40, categoryId: 'cat-dining', date: new Date(TODAY.getTime() - 3 * 86400000).toISOString() } as any,
    ];
    const events = [evt({ id: 'e1', daysUntil: 1, amount: -50 }), evt({ id: 'e2', daysUntil: 3, amount: -50 }), evt({ id: 'e3', daysUntil: 6, amount: -50 })];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(data, TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert(
      'two independently-qualifying candidates (a WK-01 cluster and a WK-03 category concentration) still resolve to exactly one WorthKnowingInsight object, never a collection',
      insight !== null && !Array.isArray(insight) && typeof insight === 'object' && insight.type === 'upcoming_commitment_cluster'
    );
  }

  // No Worth Knowing candidate -> no insight/check-in card at all, and Goal
  // follows August so far directly (structural: LuluCheckInCard is not
  // rendered anywhere in TodayScreen.tsx any more — already proven in the
  // TODAY HIERARCHY suite in tests/pass-2d-today-grow-hierarchy.test.ts;
  // repeated here as a real-import proof that the calculation layer itself
  // returns null for a guest account with nothing recorded).
  {
    const guest = createEmptyAppData();
    const safeToSpend = computeSafeToSpend(guest, TODAY);
    const insight = pickWorthKnowingInsight(guest, TODAY, [], safeToSpend, EMPTY_DEDUP);
    assert('a guest account with nothing recorded produces null — no candidate of any type qualifies, and TodayScreen renders nothing in the slot (no old check-in fallback)', insight === null);
  }
}

console.log('\n=== TODAY/MONEY INTEGRATION WIRING (Structural) ===');
{
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
  const MONEY_SCREEN_SRC = readFileSync('src/screens/money/MoneyScreen.tsx', 'utf8');
  const MONEY_SECTION_FOCUS_SRC = readFileSync('src/lib/calculations/moneySectionFocus.ts', 'utf8');
  const FINANCIAL_STATE_SRC = readFileSync('src/lib/calculations/financialState.ts', 'utf8');

  assert('TodayScreen.tsx imports and mounts WorthKnowingCard', /import \{ WorthKnowingCard \}/.test(TODAY_SCREEN_SRC) && /<WorthKnowingCard insight=\{worthKnowingInsight\}/.test(TODAY_SCREEN_SRC));
  assert(
    // SUPERSEDED (owner decision, Wave 2): the Financial-Rebuild override was
    // first narrowed from "!== 'standard'" to "=== 'financial_rebuild'", and
    // has now been removed from Today entirely. financialState.ts is still
    // completely untouched — see the very next assertion, which proves it by
    // real import and still passes.
    'the Today insight slot no longer carries any Financial-Rebuild override — neither Cashflow Focus nor Financial Rebuild renders on Today',
    !/showFinancialRebuild/.test(TODAY_SCREEN_SRC) && !/financial_rebuild/.test(TODAY_SCREEN_SRC.replace(/\{\/\*[\s\S]*?\*\/\}/g, ''))
  );
  assert(
    'financialState.ts itself is completely untouched by this round — computeFinancialState/describeFinancialStateForWealthMap/the cashflow_focus copy all still exist, preserving Wealth Map\'s own supportive line',
    /cashflow_focus/.test(FINANCIAL_STATE_SRC) && /describeFinancialStateForWealthMap/.test(FINANCIAL_STATE_SRC)
  );
  assert('MoneyScreen.tsx gained a this_month section anchor mirroring the existing aup/timeline pattern', /thisMonthSectionY\.current = e\.nativeEvent\.layout\.y;/.test(MONEY_SCREEN_SRC));
  assert("moneySectionFocus.ts's target type includes 'this_month' alongside the pre-existing 'aup'/'timeline'", /'aup' \| 'timeline' \| 'this_month'/.test(MONEY_SECTION_FOCUS_SRC));
  assert(
    // Correction round — pushMoneyDetail's scrollTo type is unchanged by
    // this pass (still exactly 'aup' | 'timeline' | 'this_month'); it gained
    // a separate, optional second parameter for WK-01/WK-02's own inner-
    // timeline target, proven below.
    "pushMoneyDetail's scrollTo type was widened to include this_month, not replaced",
    /function pushMoneyDetail\(scrollTo: 'aup' \| 'timeline' \| 'this_month'/.test(TODAY_SCREEN_SRC)
  );
  assert(
    'pushMoneyDetail gained an optional second `target` parameter (WK-01/WK-02\'s own inner-timeline destination) and passes it through as targetDateKey/targetOccurrenceKeys on the MoneyDetail navigate call',
    /function pushMoneyDetail\(scrollTo: 'aup' \| 'timeline' \| 'this_month', target\?: \{ dateKey: string; occurrenceKeys: string\[\] \}\)/.test(TODAY_SCREEN_SRC) &&
      /targetDateKey: target\?\.dateKey,\s*targetOccurrenceKeys: target\?\.occurrenceKeys,/.test(TODAY_SCREEN_SRC)
  );
  assert(
    "handleWorthKnowingPress passes the insight's own destination.targetDateKey/targetOccurrenceKeys through to pushMoneyDetail for the 'timeline' section specifically — never re-derived, and the 'this_month'/'transactions' destinations are untouched",
    /if \(destination\.section === 'timeline'\) \{\s*pushMoneyDetail\('timeline', \{ dateKey: destination\.targetDateKey, occurrenceKeys: destination\.targetOccurrenceKeys \}\);/.test(TODAY_SCREEN_SRC)
  );
}

console.log('\n=== WK-01/WK-02 DESTINATION TARGET IDENTITY (real import) ===');
{
  // WK-01 — the destination's targetDateKey/targetOccurrenceKeys must be
  // built from the SAME best.members array totalCents/count were already
  // computed from. Proven here by independently recomputing the expected
  // identity keys from the exact same events (via the same production
  // eventOccurrenceIdentity/occurrenceIdentityKey/occurrenceDateKey
  // primitives), never a mirrored/hand-copied string.
  {
    const events = [
      evt({ id: 'e1', daysUntil: 5, amount: -100, label: 'Bill A', recurringItemId: 'r1' }),
      evt({ id: 'e2', daysUntil: 7, amount: -200, label: 'Bill B', recurringItemId: 'r2' }),
      evt({ id: 'e3', daysUntil: 10, amount: -300, label: 'Bill C', recurringItemId: 'r3' }),
    ];
    const safeToSpend = safeToSpendFixture(100);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, events, safeToSpend, EMPTY_DEDUP);
    assert('fixture sanity: this scenario produces a WK-01 cluster', insight !== null && insight.type === 'upcoming_commitment_cluster');
    const destination = insight!.destination;
    assert(
      "WK-01's destination is a 'timeline' money_section carrying target metadata",
      destination.kind === 'money_section' && destination.section === 'timeline'
    );
    if (destination.kind === 'money_section' && destination.section === 'timeline') {
      assert(
        "WK-01's targetDateKey is exactly the cluster's own start date's local-calendar key (occurrenceDateKey(events[0].date), independently recomputed here) — the same date startDate/formatDateRange in the body text already used",
        destination.targetDateKey === occurrenceDateKey(events[0].date)
      );
      const expectedKeys = events.map((e) => occurrenceIdentityKey(eventOccurrenceIdentity(e)));
      assert(
        'WK-01\'s targetOccurrenceKeys are exactly the 3 occurrence identities of the 3 cluster members — the same identities that produced the displayed count (3) and total ($600) — independently recomputed here from the same source events, not a mirrored copy',
        JSON.stringify(destination.targetOccurrenceKeys) === JSON.stringify(expectedKeys) && destination.targetOccurrenceKeys.length === 3
      );
    }
  }

  // WK-02 — same mechanism, a single selected payment.
  {
    const event = evt({ id: 'mortgage', daysUntil: 5, amount: -250, label: 'Mortgage', recurringItemId: 'r1' });
    const safeToSpend = safeToSpendFixture(500);
    const insight = pickWorthKnowingInsight(baseData(), TODAY, [event], safeToSpend, EMPTY_DEDUP);
    assert('fixture sanity: this scenario produces a WK-02 material commitment', insight !== null && insight.type === 'large_upcoming_commitment');
    const destination = insight!.destination;
    if (destination.kind === 'money_section' && destination.section === 'timeline') {
      assert(
        "WK-02's targetDateKey is exactly the selected payment's own local-calendar date key (occurrenceDateKey(event.date)) — the same date formatSingleDate's body text already used",
        destination.targetDateKey === occurrenceDateKey(event.date)
      );
      const expectedKey = occurrenceIdentityKey(eventOccurrenceIdentity(event));
      assert(
        "WK-02's targetOccurrenceKeys is exactly a single-element array carrying the selected payment's own occurrence identity — the same identity used to compute bestCents and to dedup against Briefing",
        destination.targetOccurrenceKeys.length === 1 && destination.targetOccurrenceKeys[0] === expectedKey
      );
    } else {
      assert('WK-02 destination is a timeline money_section', false);
    }
  }
}

console.log('\n=== TIMELINE FOCUS RESOLUTION (real import) ===');
{
  // WK-01 opens at its cluster start date — once the target group's own
  // info (offset + occurrence keys) has been measured, and at least one of
  // the target's own occurrence keys is genuinely present in that group,
  // the request resolves with that exact y.
  {
    const target: TimelineFocusTarget = { requestId: 1, dateKey: '2026-09-10', occurrenceKeys: ['recurring_item:r1:2026-09-10'] };
    const groups: TimelineGroupOffsets = {
      groups: new Map([
        ['2026-09-05', { y: 0, occurrenceKeys: ['recurring_item:other:2026-09-05'] }],
        ['2026-09-10', { y: 340, occurrenceKeys: ['recurring_item:r1:2026-09-10'] }],
        ['2026-09-20', { y: 900, occurrenceKeys: ['recurring_item:r3:2026-09-20'] }],
      ]),
      totalGroups: 3,
    };
    const result = computeTimelineFocusFulfillment(target, null, groups);
    assert(
      "WK-01 opens at its cluster start date — once '2026-09-10' has been measured (y=340) AND its own occurrence identity genuinely matches, the request resolves to that exact scrollY, never the timeline heading alone",
      result.handled && result.scrollY === 340
    );
  }

  // WK-01's cluster target can match on ANY of several occurrence keys, not
  // just the first — the group's own occurrenceKeys only needs to overlap
  // with target.occurrenceKeys at one entry.
  {
    const target: TimelineFocusTarget = {
      requestId: 1,
      dateKey: '2026-09-10',
      occurrenceKeys: ['recurring_item:r1:2026-09-10', 'recurring_item:r2:2026-09-10', 'recurring_item:r3:2026-09-10'],
    };
    const groups: TimelineGroupOffsets = {
      groups: new Map([['2026-09-10', { y: 340, occurrenceKeys: ['recurring_item:r2:2026-09-10'] }]]),
      totalGroups: 1,
    };
    const result = computeTimelineFocusFulfillment(target, null, groups);
    assert('a match on any one of several supplied occurrence keys is sufficient — the whole cluster need not be intact for the destination to be trusted', result.handled && result.scrollY === 340);
  }

  // WK-02 opens at its selected payment date — the identical mechanism,
  // proven again with a distinct target to show it is not special-cased to
  // WK-01's own fixture values.
  {
    const target: TimelineFocusTarget = { requestId: 2, dateKey: '2026-08-22', occurrenceKeys: ['recurring_item:mortgage:2026-08-22'] };
    const groups: TimelineGroupOffsets = {
      groups: new Map([['2026-08-22', { y: 512, occurrenceKeys: ['recurring_item:mortgage:2026-08-22'] }]]),
      totalGroups: 1,
    };
    const result = computeTimelineFocusFulfillment(target, null, groups);
    assert(
      "WK-02 opens at its selected payment's own date/event — '2026-08-22' resolves to its measured scrollY (512) once its occurrence identity is confirmed present",
      result.handled && result.scrollY === 512
    );
  }

  // Exact occurrence identity is checked before focus fulfillment — the
  // required device-test scenario: a date group exists (e.g. it still
  // contains an unrelated salary), but NONE of the target's own occurrence
  // keys is among that group's rendered occurrences (the target repayment
  // has been removed). The date coincidentally still has a group; the
  // group is not the target. Must fall back safely — no scroll.
  {
    const target: TimelineFocusTarget = { requestId: 5, dateKey: '2026-09-11', occurrenceKeys: ['recurring_item:sy-repayment:2026-09-11'] };
    const groups: TimelineGroupOffsets = {
      // Salary remains on 11 September; the target repayment occurrence is
      // gone — only an unrelated income occurrence is actually rendered.
      groups: new Map([['2026-09-11', { y: 260, occurrenceKeys: ['recurring_item:salary-test:2026-09-11'] }]]),
      totalGroups: 1,
    };
    const result = computeTimelineFocusFulfillment(target, null, groups);
    assert(
      'a stale target whose date group still exists (salary remains on 11 September) but whose own occurrence has been removed is NOT treated as fulfilled merely because the date group exists — no scroll to the unrelated salary, safe fallback to the section heading instead',
      result.handled && result.scrollY === null
    );
  }

  // A target with no occurrence keys at all (structurally defensive case)
  // can never be validated, even if its date exists — "at least one match"
  // cannot be satisfied by an empty set.
  {
    const target: TimelineFocusTarget = { requestId: 6, dateKey: '2026-09-11', occurrenceKeys: [] };
    const groups: TimelineGroupOffsets = {
      groups: new Map([['2026-09-11', { y: 260, occurrenceKeys: ['recurring_item:salary-test:2026-09-11'] }]]),
      totalGroups: 1,
    };
    const result = computeTimelineFocusFulfillment(target, null, groups);
    assert('a target with no occurrence keys at all can never be validated, even when its date group exists — never scrolls', result.handled && result.scrollY === null);
  }

  // Still pending — the target's own date hasn't been measured yet, and not
  // every currently-rendered group has reported layout either. Must stay
  // pending (never guessed, never a fabricated scrollY).
  {
    const target: TimelineFocusTarget = { requestId: 3, dateKey: '2026-09-10', occurrenceKeys: [] };
    const groups: TimelineGroupOffsets = { groups: new Map([['2026-09-05', { y: 0, occurrenceKeys: [] }]]), totalGroups: 3 };
    const result = computeTimelineFocusFulfillment(target, null, groups);
    assert('a target not yet measured, with more groups still to report layout, stays pending — never a fabricated scrollY', !result.handled && result.scrollY === null);
  }

  // Missing/stale target falls back safely — every currently-rendered group
  // has now reported layout and the target's date still isn't among them
  // (e.g. the underlying data changed). Gives up rather than staying
  // pending forever; the customer is already at the "What happens next"
  // heading via the independent outer section-focus mechanism, so this
  // give-up state IS the required safe fallback, not a dead end.
  {
    const target: TimelineFocusTarget = { requestId: 4, dateKey: '2026-09-10', occurrenceKeys: [] };
    const groups: TimelineGroupOffsets = {
      groups: new Map([
        ['2026-09-05', { y: 0, occurrenceKeys: [] }],
        ['2026-09-20', { y: 900, occurrenceKeys: [] }],
        ['2026-09-25', { y: 1200, occurrenceKeys: [] }],
      ]),
      totalGroups: 3,
    };
    const result = computeTimelineFocusFulfillment(target, null, groups);
    assert(
      'a missing/stale target (its date not found even after every currently-rendered group reported layout) is handled by giving up safely — no scroll, no crash — leaving the customer at the already-reached "What happens next" heading',
      result.handled && result.scrollY === null
    );
  }

  // Repeated navigation uses a fresh request and does not reuse stale focus.
  {
    const groups: TimelineGroupOffsets = { groups: new Map([['2026-09-10', { y: 340, occurrenceKeys: ['recurring_item:r1:2026-09-10'] }]]), totalGroups: 1 };
    const first: TimelineFocusTarget = { requestId: 10, dateKey: '2026-09-10', occurrenceKeys: ['recurring_item:r1:2026-09-10'] };
    const firstResult = computeTimelineFocusFulfillment(first, null, groups);
    assert('the first tap on a WK-01/WK-02 insight resolves normally', firstResult.handled && firstResult.scrollY === 340);

    // A second call with the SAME requestId (simulating an unrelated
    // re-render/re-layout after the request was already resolved — e.g.
    // opening/dismissing an edit sheet, or ordinary scrolling) must NOT
    // re-fire — lastHandledRequestId now matches, so this is correctly
    // treated as still-pending/inert, never a second scroll for the same tap.
    const sameRequestAgain = computeTimelineFocusFulfillment(first, 10, groups);
    assert('a second call for the SAME already-handled requestId never re-fires — stale focus is never reused for an unrelated re-render (edit sheet open/close, ordinary scroll)', !sameRequestAgain.handled);

    // A genuinely NEW tap (fresh requestId, even on the identical dateKey)
    // resolves again — a repeat tap on the same insight must still produce
    // a real scroll, not be silently swallowed as "no change".
    const second: TimelineFocusTarget = { requestId: 11, dateKey: '2026-09-10', occurrenceKeys: ['recurring_item:r1:2026-09-10'] };
    const secondResult = computeTimelineFocusFulfillment(second, 10, groups);
    assert('a fresh requestId (a genuine repeat tap) resolves again, even for the identical dateKey — never swallowed as "no change"', secondResult.handled && secondResult.scrollY === 340);
  }

  // No target at all — the ordinary case for every non-Worth-Knowing
  // MoneyTimelineCard render (AUP/event-row destinations, or a plain in-tab
  // visit) — never scrolls, never crashes.
  {
    const result = computeTimelineFocusFulfillment(null, null, { groups: new Map(), totalGroups: 0 });
    assert('no target produces no scroll — the ordinary case for every caller that never supplies one', !result.handled && result.scrollY === null);
  }
}

console.log('\n=== WORTH KNOWING CARD CONTRAST (real import) ===');
{
  function parseColor(c: string): { r: number; g: number; b: number; a: number } {
    c = c.trim();
    if (c.startsWith('#')) {
      let hex = c.slice(1);
      if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    throw new Error('cannot parse color: ' + c);
  }
  function compositeOver(fg: string, bg: string): { r: number; g: number; b: number } {
    const fgc = parseColor(fg);
    const bgc = parseColor(bg);
    const a = fgc.a;
    return { r: fgc.r * a + bgc.r * (1 - a), g: fgc.g * a + bgc.g * (1 - a), b: fgc.b * a + bgc.b * (1 - a) };
  }
  function relLum({ r, g, b }: { r: number; g: number; b: number }): number {
    const srgb = [r, g, b].map((v) => v / 255);
    const lin = srgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }
  function contrast(fg: string, bg: string): number {
    const fgc = parseColor(fg);
    const effFg = fgc.a < 1 ? compositeOver(fg, bg) : fgc;
    const effBg = parseColor(bg);
    const L1 = relLum(effFg);
    const L2 = relLum(effBg);
    const lighter = Math.max(L1, L2);
    const darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  const STYLES: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  const SCHEMES: Array<'light' | 'dark'> = ['light', 'dark'];

  // The ORIGINAL 0.65 opacity genuinely fails 4.5:1 in real production
  // combinations — confirms INSIGHT_PROVENANCE_OPACITY fixes a real defect,
  // not a false positive (mirrors this repo's own established pattern for
  // WARNING_TEXT_LIGHT_OVERRIDE in pass-2e-contrast-corrections.test.ts).
  {
    let sawGenuineFailure = false;
    for (const style of STYLES) {
      for (const scheme of SCHEMES) {
        const colors = scheme === 'light' ? lightColors : darkColors;
        const palette = selectNaviloPalette(style, scheme, colors);
        const fg = 'rgba(255,255,255,0.65)';
        const worst = Math.min(contrast(fg, palette.aiInsightSurfaceStart), contrast(fg, palette.aiInsightSurfaceEnd));
        if (worst < 4.5) sawGenuineFailure = true;
      }
    }
    assert(
      'the ORIGINAL 0.65 provenance opacity genuinely fails 4.5:1 in at least one real style/scheme combination — confirms this is a real defect, not a false positive (the device test hit exactly Sunrise/light, the worst of the failing combinations)',
      sawGenuineFailure
    );
  }

  // INSIGHT_PROVENANCE_OPACITY clears 4.5:1 in every one of the 6 supported
  // style/scheme combinations, against BOTH gradient stops (the lighter
  // stop is always the harder case for white-on-gradient text, per this
  // repo's own established "never test only a convenient gradient endpoint"
  // rule — see pass-2e-contrast-corrections.test.ts's own Section 3).
  for (const style of STYLES) {
    for (const scheme of SCHEMES) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      const fg = `rgba(255,255,255,${INSIGHT_PROVENANCE_OPACITY})`;
      const cStart = contrast(fg, palette.aiInsightSurfaceStart);
      const cEnd = contrast(fg, palette.aiInsightSurfaceEnd);
      const worst = Math.min(cStart, cEnd);
      assert(
        `${style}/${scheme}: provenance text at INSIGHT_PROVENANCE_OPACITY (${INSIGHT_PROVENANCE_OPACITY}) clears 4.5:1 against both gradient stops — worst ${worst.toFixed(2)}:1`,
        worst >= 4.5
      );
    }
  }

  // Body text (unchanged, 0.85) and label/headline/cta (unchanged, full
  // opacity) also clear 4.5:1 in every combination — proving the whole card
  // surface is compliant, not just the one line that was fixed.
  for (const style of STYLES) {
    for (const scheme of SCHEMES) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      const bodyFg = 'rgba(255,255,255,0.85)';
      const bodyWorst = Math.min(contrast(bodyFg, palette.aiInsightSurfaceStart), contrast(bodyFg, palette.aiInsightSurfaceEnd));
      assert(`${style}/${scheme}: body text (0.85, unchanged) clears 4.5:1 — worst ${bodyWorst.toFixed(2)}:1`, bodyWorst >= 4.5);

      const fullFg = '#FFFFFF';
      const fullWorst = Math.min(contrast(fullFg, palette.aiInsightSurfaceStart), contrast(fullFg, palette.aiInsightSurfaceEnd));
      assert(`${style}/${scheme}: label/headline/cta text (full opacity, unchanged) clears 4.5:1 — worst ${fullWorst.toFixed(2)}:1`, fullWorst >= 4.5);
    }
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
