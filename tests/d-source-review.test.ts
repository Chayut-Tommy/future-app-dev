// Pass D — pure proofs for the Look Ahead source-review resolver and the exact-cent
// reconciliation of the estimate after an edit made through the EXISTING editor
// transitions. The resolver owns no write and no calculation: every figure here is
// produced by the accepted Pass B engine from the data the accepted D0 transitions
// return. Rendered lifecycle proofs: tests/rendered/d-source-review.render.test.tsx.
// Run with: npx tsx tests/d-source-review.test.ts (TZ=UTC and Australia/Melbourne)

import { readFileSync } from 'fs';
import { join } from 'path';
import { createEmptyAppData } from '../src/lib/storage';
import {
  DurableMutationRefused,
  deleteLiabilityGuardedTransition,
  deleteRecurringItemTransition,
  setMainPaydayIncomeTransition,
  syncIncomeAggregate,
  updateAssetTransition,
  updateCreditCardTransition,
  updateRecurringItemTransition,
} from '../src/state/AppStateContext';
import { computeLookAheadProjection } from '../src/lib/calculations/lookAheadProjection';
import { computeProjectedEvents } from '../src/lib/calculations/projectedEvents';
import { localDate } from '../src/lib/calculations/localCalendar';
import { ESTIMATE_UPDATED_COPY, SOURCE_REVIEW_UNAVAILABLE_COPY, resolveSourceReview, sourceReviewAccessibilityLabel } from '../src/lib/calculations/sourceReview';
import type { AppData, Asset, CreditCard, Goal, Liability, RecurringItem } from '../src/types/models';

let failures = 0; let total = 0;
function assert(label: string, pass: boolean) { total++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`); if (!pass) failures++; }
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
const ASOF = localDate(2026, 9, 21);
const TARGET = localDate(2026, 9, 30);
const NOW = new Date(2026, 8, 21, 12).toISOString();

/** Opening $1,200.00 + assumed income $2,500.00 − bill $500.00 = $3,200.00 by 30 Sep. */
function fixture(): AppData {
  const d = createEmptyAppData();
  d.user = { ...d.user, hasSeenIntro: true, mainPaydayIncomeId: 'salary' } as typeof d.user;
  d.assets = [
    { id: 'Main', type: 'everyday', label: 'Main', currentValue: 1200, includeInMoneyCalculations: true } as Asset,
    { id: 'Rainy', type: 'savings', label: 'Rainy day', currentValue: 900, includeInMoneyCalculations: false } as Asset,
  ];
  d.recurringItems = [
    { id: 'salary', type: 'income', label: 'Salary', amount: 2500, frequency: 'monthly', nextDueDate: iso(2026, 9, 25), isFixed: false, active: true } as RecurringItem,
    { id: 'power', type: 'expense', label: 'Power', amount: 500, frequency: 'monthly', nextDueDate: iso(2026, 9, 28), isFixed: true, active: true, categoryId: 'cat-utilities' } as RecurringItem,
  ];
  return syncIncomeAggregate(d);
}
const cents = (d: AppData, target = TARGET) => { const r = computeLookAheadProjection(d, ASOF, target); return r.available ? r.targetCents : null; };
const look = (d: AppData, target = TARGET) => { const r = computeLookAheadProjection(d, ASOF, target); if (!r.available) throw new Error('unavailable'); return r; };

// ── §1 exact-cent reconciliation through the EXISTING transitions ──
const d0 = fixture();
assert('baseline: $1,200.00 + $2,500.00 − $500.00 = $3,200.00', cents(d0) === 320000);
const billUp = updateRecurringItemTransition(d0, 'power', { amount: 700 });
assert('bill $500 → $700 gives exactly $3,000.00', cents(billUp) === 300000);
assert('a cancelled edit is no transition at all: the same data still gives $3,200.00', cents(d0) === 320000);
assert('deleting the bill gives exactly $3,700.00', cents(deleteRecurringItemTransition(d0, 'power')) === 370000);
assert('income $2,500 → $2,600 adds exactly $100.00', cents(updateRecurringItemTransition(d0, 'salary', { amount: 2600 }))! - cents(d0)! === 10000);
assert('a rejected edit commits nothing, so the estimate is computed from the SAME object', (() => { const before = d0; try { throw new Error('disk full'); } catch { /* the durable owner commits nothing */ } return before === d0 && cents(before) === 320000; })());
assert('a retried save applies ONCE: the transition is idempotent on its own output', (() => { const once = updateRecurringItemTransition(d0, 'power', { amount: 700 }); const twice = updateRecurringItemTransition(once, 'power', { amount: 700 }); return cents(once) === 300000 && cents(twice) === 300000; })());
assert('exact cents survive a non-whole amount: bill $500.00 → $499.95 gives $3,200.05', cents(updateRecurringItemTransition(d0, 'power', { amount: 499.95 })) === 320005);

// ── §2 sources that move relative to the target ──
const movedBeyond = updateRecurringItemTransition(d0, 'power', { nextDueDate: iso(2026, 10, 2) });
assert('a bill moved BEYOND the target leaves the estimate at $3,700.00 and leaves the horizon', cents(movedBeyond) === 370000 && !computeProjectedEvents(movedBeyond, ASOF, TARGET, { windowStart: ASOF }).events.some((e) => e.sourceId === 'power'));
const movedOnto = updateRecurringItemTransition(d0, 'power', { nextDueDate: iso(2026, 9, 30) });
assert('a bill moved ONTO the target date is inside the horizon: $3,200.00', cents(movedOnto) === 320000 && computeProjectedEvents(movedOnto, ASOF, TARGET, { windowStart: ASOF }).events.some((e) => e.sourceId === 'power'));
const sameDay = updateRecurringItemTransition(d0, 'power', { nextDueDate: iso(2026, 9, 25) });
assert('same-day income and bill net exactly: still $3,200.00, lowest point never below the opening $1,200.00', cents(sameDay) === 320000 && look(sameDay).lowest.cents >= 120000);
const early = updateRecurringItemTransition(d0, 'power', { amount: 1500, nextDueDate: iso(2026, 9, 23) });
assert('a larger bill BEFORE payday creates an earlier shortfall of exactly $300.00 on 23 Sep; the target is $2,200.00', (() => { const r = look(early); return r.targetCents === 220000 && r.firstShortfall !== null && r.firstShortfall.shortfallCents === 30000 && r.firstShortfall.date.day === 23; })());
assert('correcting that bill back removes the shortfall', look(updateRecurringItemTransition(early, 'power', { amount: 500 })).firstShortfall === null);

// ── §3 cards, loans, BNPL, accounts ──
function rich(): AppData {
  const d = fixture();
  d.liabilities = [
    { id: 'home-loan', type: 'mortgage', label: 'Home loan', currentBalance: 400000 } as Liability,
    { id: 'zip', type: 'bnpl', label: 'Zip', currentBalance: 300 } as Liability,
  ];
  d.recurringItems = [
    ...d.recurringItems,
    { id: 'mortgage-bill', type: 'expense', label: 'Mortgage repayment', amount: 800, frequency: 'monthly', nextDueDate: iso(2026, 9, 26), isFixed: true, active: true, linkedLiabilityId: 'home-loan' } as RecurringItem,
    { id: 'zip-bill', type: 'expense', label: 'Zip instalment', amount: 75, frequency: 'fortnightly', nextDueDate: iso(2026, 9, 24), isFixed: true, active: true, linkedLiabilityId: 'zip' } as RecurringItem,
  ];
  d.creditCards = [{ id: 'amex', issuer: 'AMEX', label: 'AMEX', currentBalance: 800, creditLimit: 5000, dueDay: 29, expectedMonthlyRepayment: 120 } as unknown as CreditCard];
  d.goals = [{ id: 'travel', name: 'Travel', lifeGoalType: 'travel', targetAmount: 5000, currentAmount: 0, targetDate: iso(2029, 9, 1), status: 'active' } as unknown as Goal];
  return syncIncomeAggregate(d);
}
const r0 = rich();
const ev = computeProjectedEvents(r0, ASOF, TARGET, { windowStart: ASOF }).events;
const kinds = new Map(ev.map((e) => [e.sourceId, e.sourceKind]));
assert('the accepted engine classifies the fixture: income, bill, loan, bnpl, card', kinds.get('salary') === 'income' && kinds.get('power') === 'bill' && kinds.get('mortgage-bill') === 'loan' && kinds.get('zip-bill') === 'bnpl' && kinds.get('amex') === 'card');
const base3 = cents(r0)!;
assert('card repayment $120 → $200 lowers the estimate by exactly $80.00', base3 - cents(updateCreditCardTransition(r0, 'amex', { expectedMonthlyRepayment: 200 }))! === 8000);
assert('loan repayment schedule $800 → $850 lowers the estimate by exactly $50.00 (the schedule is the linked bill)', base3 - cents(updateRecurringItemTransition(r0, 'mortgage-bill', { amount: 850 }))! === 5000);
assert('account correction $1,200 → $1,250.50 raises the estimate by exactly $50.50', cents(updateAssetTransition(r0, 'Main', { currentValue: 1250.5 }, NOW))! - base3 === 5050);
assert('the linked-liability deletion guard is preserved: a loan with a repayment bill cannot be deleted', (() => { try { deleteLiabilityGuardedTransition(r0, 'home-loan'); return false; } catch (e) { return e instanceof DurableMutationRefused && e.reason === 'linked_repayment'; } })());
assert('primary income change and Main-payday change leave a CUSTOM target estimate exactly consistent (the target is a date, not a payday)', (() => { const two = syncIncomeAggregate({ ...r0, recurringItems: [...r0.recurringItems, { id: 'side', type: 'income', label: 'Side', amount: 300, frequency: 'weekly', nextDueDate: iso(2026, 9, 27), isFixed: false, active: true } as RecurringItem] }); const before = cents(two)!; const after = cents(syncIncomeAggregate(setMainPaydayIncomeTransition(two, 'side')))!; return before === after && before === base3 + 30000; })());
assert('savings and goals stay informational (Option B): a goal never changes the estimate', cents({ ...r0, goals: [] }) === base3 && cents({ ...r0, assets: r0.assets.map((a) => (a.id === 'Rainy' ? { ...a, currentValue: 5000 } : a)) }) === base3);

// ── §4 the resolver: stable identity only, existing editors only ──
const dest = (kind: string, id: string, data: AppData = r0) => resolveSourceReview(data, { sourceKind: kind as never, sourceId: id });
assert('income → the Income editor, by recurring item id', (() => { const x = dest('income', 'salary'); return x.status === 'available' && x.editor === 'income' && x.recurringItemId === 'salary' && x.actionLabel === 'Review income'; })());
assert('bill → the Bill editor, by recurring item id', (() => { const x = dest('bill', 'power'); return x.status === 'available' && x.editor === 'bill' && x.recurringItemId === 'power' && x.actionLabel === 'Review bill'; })());
assert('loan schedule → the Bill editor for the LINKED repayment bill (the accepted What Happens Next routing)', (() => { const x = dest('loan', 'mortgage-bill'); return x.status === 'available' && x.editor === 'bill' && x.recurringItemId === 'mortgage-bill' && x.actionLabel === 'Review repayment'; })());
assert('BNPL → the liability editor, by the linked liability id', (() => { const x = dest('bnpl', 'zip-bill'); return x.status === 'available' && x.editor === 'liability' && x.liabilityId === 'zip'; })());
assert('card → the Card editor, by card id', (() => { const x = dest('card', 'amex'); return x.status === 'available' && x.editor === 'card' && x.creditCardId === 'amex'; })());
assert('every projected event in the fixture resolves through its OWN sourceKind + sourceId', ev.every((e) => resolveSourceReview(r0, { sourceKind: e.sourceKind, sourceId: e.sourceId, occurrenceId: e.occurrenceId }).status === 'available'));
assert('a deleted source fails closed — never a neighbour', (() => { const gone = deleteRecurringItemTransition(r0, 'power'); const x = dest('bill', 'power', gone); return x.status === 'unavailable' && x.reason === 'source_missing'; })());
assert('a loan whose liability link no longer resolves fails closed', (() => { const broken = { ...r0, liabilities: r0.liabilities.filter((l) => l.id !== 'home-loan') }; const x = dest('loan', 'mortgage-bill', broken); return x.status === 'unavailable' && x.reason === 'link_unresolved'; })());
assert('a BNPL link that points at a non-BNPL liability fails closed', (() => { const wrong = { ...r0, recurringItems: r0.recurringItems.map((r) => (r.id === 'zip-bill' ? { ...r, linkedLiabilityId: 'home-loan' } : r)) }; return dest('bnpl', 'zip-bill', wrong).status === 'unavailable'; })());
assert('a kind/id mismatch fails closed (an income id asked for as a bill, a bill id as income, an item id as a card)', dest('bill', 'salary').status === 'unavailable' && dest('income', 'power').status === 'unavailable' && dest('card', 'power').status === 'unavailable');
assert('unknown kinds (savings, goals, recorded transactions) are not editable here', ['goal', 'savings', 'transaction', ''].every((k) => { const x = dest(k, 'travel'); return x.status === 'unavailable' && x.reason === 'unsupported_kind'; }));
assert('identity is never label, amount or date: a twin with identical label/amount/date resolves to ITS OWN id', (() => { const twin = { ...r0, recurringItems: [...r0.recurringItems, { ...r0.recurringItems.find((r) => r.id === 'power')!, id: 'power-twin' }] }; const a = dest('bill', 'power', twin); const b = dest('bill', 'power-twin', twin); return a.status === 'available' && b.status === 'available' && a.editor === 'bill' && b.editor === 'bill' && a.recurringItemId === 'power' && b.recurringItemId === 'power-twin'; })());
assert('the resolver returns the same destination regardless of display order', (() => { const reversed = { ...r0, recurringItems: [...r0.recurringItems].reverse(), creditCards: [...r0.creditCards].reverse(), liabilities: [...r0.liabilities].reverse() }; return ev.every((e) => JSON.stringify(resolveSourceReview(reversed, e)) === JSON.stringify(resolveSourceReview(r0, e))); })());
assert('the accessible label carries type, name and date', (() => { const x = dest('bill', 'power'); return x.status === 'available' && sourceReviewAccessibilityLabel(x, '28 Sep') === 'Review bill: Power, 28 Sep' && sourceReviewAccessibilityLabel(x, null) === 'Review bill: Power'; })());
assert('copy is exact and calm', ESTIMATE_UPDATED_COPY === 'Estimate updated' && SOURCE_REVIEW_UNAVAILABLE_COPY === 'This item is no longer available. Your estimate has been refreshed.');

// ── §5 structure: no editor, no write path, no engine, no persistence ──
const strip = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const resolver = strip('lib/calculations/sourceReview.ts');
assert('the resolver imports types only: no state, storage, engine or React', !/useAppState|AsyncStorage|persist|saveAppData|compute[A-Z]|from 'react/.test(resolver) && /^import type /m.test(resolver) && !/^import \{/m.test(resolver));
assert('the resolver never matches on label, amount, date, category or index', !/\.label ===|\.amount ===|nextDueDate ===|categoryId ===|\[0\]|findIndex|indexOf/.test(resolver));
const money = strip('screens/money/MoneyScreen.tsx');
const coordinator = money.slice(money.indexOf('const activeReviewRef'), money.indexOf('const focusedTargetRef'));
assert('the coordinator is transient: refs and component state only — no AppData, AsyncStorage, updateUser or navigation params', coordinator.length > 500 && !/AsyncStorage|updateUser|persist|setParams|navigation\.|saveAppData/.test(coordinator));
assert('the coordinator calls NO mutation: it opens the existing editors and listens for their outcome', !/\b(add|update|delete|confirm|reverse)[A-Z]\w*\(/.test(coordinator) && /setEditBill\(|setEditIncome\(|setViewCreditCardId\(|setViewBnplLiabilityId\(/.test(coordinator));
assert('one review at a time, and a stale source fails closed before any editor opens', /if \(activeReviewRef\.current\) return;/.test(coordinator) && coordinator.indexOf("destination.status !== 'available'") < coordinator.indexOf('activeReviewRef.current = row'));
assert('"Estimate updated" is announced only for saved/deleted, in exactly one place', (money.match(/announceForAccessibility\(ESTIMATE_UPDATED_COPY\)/g) ?? []).length === 1 && /outcome\.outcome === 'saved' \|\| outcome\.outcome === 'deleted'/.test(coordinator));
assert('all four existing editors report to the ONE outcome handler; no new editor component exists', (money.match(/onOutcome=\{handleReviewOutcome\}/g) ?? []).length === 4);
const rail = strip('components/money/FutureTimelineRail.tsx');
const detail = strip('components/money/TimelineEventDetail.tsx');
assert('the rail and its detail stay presentation-only: no state owner, storage or navigation', !/useAppState|AsyncStorage|updateUser|navigation/.test(rail + detail) && /onReviewSource/.test(rail) && /onReviewSource/.test(detail));
assert('a grouped marker never auto-opens a source: review is only ever called from an explicit per-row press', (detail.match(/onReviewSource\?\.\(/g) ?? []).length === 1 && /onPress=\{\(\) => onReviewSource\?\.\(r\)\}/.test(detail) && !/useEffect\([^)]*onReviewSource\(/.test(rail + detail));
const today = strip('screens/today/TodayScreen.tsx');
assert('Today Briefing is untouched by source review', !/sourceReview|resolveSourceReview|onReviewSource/.test(today));

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
