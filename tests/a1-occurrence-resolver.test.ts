// A1 — canonical occurrence resolver + partial-payment (pure).
// Run: ./node_modules/.bin/tsx tests/a1-occurrence-resolver.test.ts

import type { Transaction, TransactionOccurrenceResolution } from '../src/types/models';
import { buildOccurrenceId, OccurrenceId } from '../src/lib/calculations/occurrenceIdentity';
import {
  resolveOccurrence,
  classifyTransaction,
  linkWouldConflict,
  orderLinkCandidates,
  buildClassificationOptions,
  interpretClassificationSelection,
  CLASSIFICATION_INDEPENDENT_KEY,
  OccurrenceDescriptor,
} from '../src/lib/calculations/occurrenceResolution';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (y: number, m: number, d: number) => D(y, m, d).toISOString();

let seq = 0;
function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? `t${++seq}`,
    type: partial.type ?? 'income',
    amount: partial.amount ?? 100,
    categoryId: partial.categoryId ?? 'cat-x',
    date: partial.date ?? iso(2026, 8, 25),
    ...partial,
  } as Transaction;
}
const linkedRes = (id: OccurrenceId): TransactionOccurrenceResolution => ({ version: 1, state: 'linked', occurrenceId: id });
const independentRes: TransactionOccurrenceResolution = { version: 1, state: 'independent' };
const unresolvedRes: TransactionOccurrenceResolution = { version: 1, state: 'unresolved' };

const augWage = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
const sepWage = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: D(2026, 9, 25), cadence: 'monthly' });
const occIncome = (id: OccurrenceId, extra?: Partial<OccurrenceDescriptor>): OccurrenceDescriptor => ({ id, sourceKind: 'income', sourceId: 'wage', isRepayment: false, ...extra });

console.log('=== resolver: linked / independent / eligible ===');
{
  const salary = tx({ id: 'sal-aug', type: 'income', amount: 2000, occurrenceResolution: linkedRes(augWage) });
  const rAug = resolveOccurrence(occIncome(augWage), [salary]);
  assert('1a. linked salary → August occurrence satisfied', rAug.state === 'satisfied' && rAug.linkedTransactionIds[0] === 'sal-aug');
  const rSep = resolveOccurrence(occIncome(sepWage), [salary]);
  assert('1b. September remains eligible (link suppresses only its explicit occurrence)', rSep.state === 'eligible');

  const bonus = tx({ id: 'bonus', type: 'income', amount: 1000, occurrenceResolution: independentRes });
  const rAugBonus = resolveOccurrence(occIncome(augWage), [bonus]);
  assert('1c. independent bonus does NOT suppress the scheduled salary occurrence', rAugBonus.state === 'eligible');
  assert('1d. classifyTransaction: independent', classifyTransaction(bonus).classification === 'independent');
  assert('1e. classifyTransaction: linked carries the occurrence id', classifyTransaction(salary).classification === 'linked' && classifyTransaction(salary).occurrenceId === augWage);
  assert('1f. classifyTransaction: absent field → unclassified (NOT unresolved)', classifyTransaction(tx({})).classification === 'unclassified');
}

console.log('\n=== resolver: unresolved legacy collision (typed blocker) ===');
{
  const r = resolveOccurrence(occIncome(augWage, { unresolvedCandidateTxnIds: ['legacy-1'] }), []);
  assert('2a. material unclassified collision → unresolved', r.state === 'unresolved');
  assert('2b. typed blocking issue names the record', r.blockingIssue?.kind === 'unresolved_ambiguity' && (r.blockingIssue as any).transactionIds[0] === 'legacy-1');
}

console.log('\n=== resolver: delete / unlink re-expose ===');
{
  const salary = tx({ id: 's', type: 'income', amount: 2000, occurrenceResolution: linkedRes(augWage) });
  assert('3a. before: satisfied', resolveOccurrence(occIncome(augWage), [salary]).state === 'satisfied');
  // Delete the transaction entirely.
  assert('3b. delete linked record → occurrence eligible again', resolveOccurrence(occIncome(augWage), []).state === 'eligible');
  // Unlink = clear the resolution field (no cursor concept in the resolver).
  const unlinked = tx({ id: 's', type: 'income', amount: 2000 });
  assert('3c. unlink (clear resolution) → occurrence eligible again', resolveOccurrence(occIncome(augWage), [unlinked]).state === 'eligible');
}

console.log('\n=== resolver: conflict (never resolved by first/newest) ===');
{
  const a = tx({ id: 'a', type: 'income', amount: 2000, occurrenceResolution: linkedRes(augWage) });
  const b = tx({ id: 'b', type: 'income', amount: 2000, occurrenceResolution: linkedRes(augWage) });
  const r = resolveOccurrence(occIncome(augWage), [a, b]);
  assert('4a. two live links to one income occurrence → conflict', r.state === 'conflict');
  assert('4b. conflict lists BOTH transactions (does not pick one)', r.blockingIssue?.kind === 'conflict' && (r.blockingIssue as any).transactionIds.length === 2);
  // Order independence of the conflict detection.
  const rRev = resolveOccurrence(occIncome(augWage), [b, a]);
  assert('4c. conflict is order-independent', rRev.state === 'conflict');
  // Write-time guard.
  assert('4d. linkWouldConflict true for a second link to a non-repayment occurrence', linkWouldConflict(occIncome(augWage), 'b', [a]));
}

console.log('\n=== resolver: one transaction satisfies at most one occurrence ===');
{
  const salary = tx({ id: 's', type: 'income', amount: 2000, occurrenceResolution: linkedRes(augWage) });
  // The same transaction resolved against a DIFFERENT occurrence does not satisfy it.
  assert('5a. a linked txn does not satisfy a different occurrence', resolveOccurrence(occIncome(sepWage), [salary]).state === 'eligible');
  assert('5b. classifyTransaction yields exactly one occurrence id', classifyTransaction(salary).occurrenceId === augWage);
}

console.log('\n=== resolver: invalid / unsafe fails closed ===');
{
  assert('6a. missing/invalid identity → invalid', resolveOccurrence({ id: undefined, sourceKind: 'income', sourceId: 'wage', isRepayment: false }, []).state === 'invalid');
  const card = buildOccurrenceId({ sourceKind: 'card', sourceId: 'c1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
  const bad = tx({ id: 'x', amount: Number.NaN, occurrenceResolution: linkedRes(card) });
  const r = resolveOccurrence({ id: card, sourceKind: 'card', sourceId: 'c1', isRepayment: true, expectedCents: 20000 }, [bad]);
  assert('6b. non-finite linked repayment amount → invalid', r.state === 'invalid' && r.blockingIssue?.kind === 'invalid_amount');
  const rExp = resolveOccurrence({ id: card, sourceKind: 'card', sourceId: 'c1', isRepayment: true, expectedCents: -5 }, []);
  assert('6c. invalid expected cents → invalid', rExp.state === 'invalid');
  // Unknown resolution version fails closed.
  const unk = tx({ id: 'u', occurrenceResolution: { version: 2, state: 'linked', occurrenceId: augWage } as any });
  assert('6d. unknown resolution version on a claim → unresolved (fail closed)', resolveOccurrence(occIncome(augWage), [unk]).state === 'unresolved');
  assert('6e. classifyTransaction flags unknown version', classifyTransaction(unk).unknownVersion === true);
}

console.log('\n=== resolver: deterministic regardless of transaction order ===');
{
  const card = buildOccurrenceId({ sourceKind: 'card', sourceId: 'c1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
  const p1 = tx({ id: 'p1', amount: 80, occurrenceResolution: linkedRes(card) });
  const p2 = tx({ id: 'p2', amount: 40, occurrenceResolution: linkedRes(card) });
  const noise = tx({ id: 'n', amount: 999, occurrenceResolution: independentRes });
  const occ: OccurrenceDescriptor = { id: card, sourceKind: 'card', sourceId: 'c1', isRepayment: true, expectedCents: 20000 };
  const r1 = resolveOccurrence(occ, [p1, noise, p2]);
  const r2 = resolveOccurrence(occ, [p2, p1, noise]);
  assert('7a. same satisfiedCents regardless of order', r1.satisfiedCents === r2.satisfiedCents && r1.satisfiedCents === 12000);
  assert('7b. same state regardless of order', r1.state === r2.state);
}

console.log('\n=== partial repayment contract ===');
{
  const card = buildOccurrenceId({ sourceKind: 'card', sourceId: 'c1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
  const occ = (extra?: Partial<OccurrenceDescriptor>): OccurrenceDescriptor => ({ id: card, sourceKind: 'card', sourceId: 'c1', isRepayment: true, expectedCents: 20000, ...extra });
  const pay80 = tx({ id: 'pay80', amount: 80, occurrenceResolution: linkedRes(card) });
  const pay120 = tx({ id: 'pay120', amount: 120, occurrenceResolution: linkedRes(card) });

  const r1 = resolveOccurrence(occ(), [pay80]);
  assert('8a. expected $200, linked $80 → partially_satisfied, remaining $120', r1.state === 'partially_satisfied' && r1.satisfiedCents === 8000 && r1.remainingCents === 12000);
  const r2 = resolveOccurrence(occ(), [pay80, pay120]);
  assert('8b. add linked $120 → satisfied exactly, remaining 0', r2.state === 'satisfied' && r2.satisfiedCents === 20000 && r2.remainingCents === 0);
  const r3 = resolveOccurrence(occ(), [pay80]);
  assert('8c. delete the $120 → remaining $120 again (recomputed from live records)', r3.state === 'partially_satisfied' && r3.remainingCents === 12000);
  const over = tx({ id: 'over', amount: 300, occurrenceResolution: linkedRes(card) });
  const r4 = resolveOccurrence(occ(), [pay80, over]);
  assert('8d. overpayment never produces negative remaining cents', r4.state === 'satisfied' && r4.remainingCents === 0 && r4.satisfiedCents === 38000);
  const r5 = resolveOccurrence(occ({ expectedCents: undefined }), [pay80]);
  assert('8e. missing expected amount with a live link → unresolved, never satisfied', r5.state === 'unresolved' && r5.blockingIssue?.kind === 'missing_expected_amount');
  const r6 = resolveOccurrence(occ(), []);
  assert('8f. no linked repayment → eligible (remaining = full expected)', r6.state === 'eligible' && r6.remainingCents === 20000);
}

console.log('\n=== monthly cycle: due-day 25→28 stays one cycle (identity level) ===');
{
  const c25 = buildOccurrenceId({ sourceKind: 'card', sourceId: 'c1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
  const c28 = buildOccurrenceId({ sourceKind: 'card', sourceId: 'c1', occurrenceDate: D(2026, 8, 28), cadence: 'monthly' });
  assert('9a. the paid August cycle id is identical after a due-day change', c25 === c28);
  const pay = tx({ id: 'pay', amount: 200, occurrenceResolution: linkedRes(c25) });
  // After due day moves to 28, resolving the (same-id) August occurrence still sees it satisfied.
  const r = resolveOccurrence({ id: c28, sourceKind: 'card', sourceId: 'c1', isRepayment: true, expectedCents: 20000 }, [pay]);
  assert('9b. no second August cycle — the same cycle stays satisfied', r.state === 'satisfied');
}

console.log('\n=== legacy recurringOccurrenceKey adaptation (read-only) ===');
{
  const billOcc = buildOccurrenceId({ sourceKind: 'bill', sourceId: 'rent', occurrenceDate: D(2026, 8, 1), cadence: 'monthly' });
  const legacyKey = `rent:${iso(2026, 8, 1)}`;
  const legacyTxn = tx({ id: 'legacy', type: 'expense', amount: 900, recurringItemId: 'rent', recurringOccurrenceKey: legacyKey }); // no occurrenceResolution
  const occ: OccurrenceDescriptor = { id: billOcc, sourceKind: 'bill', sourceId: 'rent', isRepayment: false, legacyKey };
  assert('10a. a pre-A1 record linked via recurringOccurrenceKey is adapted to satisfied', resolveOccurrence(occ, [legacyTxn]).state === 'satisfied');
  assert('10b. without the legacyKey the same record does not link (no accidental match)', resolveOccurrence({ ...occ, legacyKey: undefined }, [legacyTxn]).state === 'eligible');
}

console.log('\n=== candidate ordering never establishes identity ===');
{
  const c1 = { occurrenceId: augWage, occurrenceDate: D(2026, 8, 25), expectedCents: 200000, label: 'Salary — 25 Aug', isRepayment: false };
  const c2 = { occurrenceId: sepWage, occurrenceDate: D(2026, 9, 25), expectedCents: 200000, label: 'Salary — 25 Sep', isRepayment: false };
  const ordered = orderLinkCandidates([c2, c1], { date: iso(2026, 8, 24), amount: 2000 });
  assert('11a. ordering brings the closest occurrence first (ordering only, no auto-link)', ordered[0].occurrenceId === augWage);
  assert('11b. ordering returns all candidates (customer still chooses)', ordered.length === 2);
}

console.log('\n=== classification options: explicit choice, no preselection ===');
{
  const cands = [
    { occurrenceId: augWage, occurrenceDate: D(2026, 8, 25), expectedCents: 200000, label: 'Salary — 25 Aug', isRepayment: false },
    { occurrenceId: sepWage, occurrenceDate: D(2026, 9, 25), expectedCents: 200000, label: 'Salary — 25 Sep', isRepayment: false },
  ];
  const opts = buildClassificationOptions(cands);
  assert('12a. one "This is …" option per candidate plus a single "Keep separate"', opts.length === 3 && opts[0].label === 'This is Salary — 25 Aug' && opts[2].kind === 'independent' && opts[2].label === 'Keep separate');
  assert('12b. no option is flagged as a default/preselected choice', !opts.some((o) => (o as any).selected || (o as any).default));
  const link = interpretClassificationSelection(opts[0].key, opts);
  assert('12c. selecting a candidate → an explicit link choice with its occurrence id', link?.kind === 'link' && (link as any).occurrenceId === augWage && (link as any).isRepayment === false);
  const sep = interpretClassificationSelection(CLASSIFICATION_INDEPENDENT_KEY, opts);
  assert('12d. selecting Keep separate → independent', sep?.kind === 'independent');
  assert('12e. an unknown key → no choice (no write)', interpretClassificationSelection('nope', opts) === undefined);
  const repayCands = [{ occurrenceId: buildOccurrenceId({ sourceKind: 'card', sourceId: 'c1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' }), occurrenceDate: D(2026, 8, 25), expectedCents: 20000, label: 'Card — August', isRepayment: true }];
  const repayLink = interpretClassificationSelection(buildClassificationOptions(repayCands)[0].key, buildClassificationOptions(repayCands));
  assert('12f. a repayment candidate carries isRepayment through to the link choice', repayLink?.kind === 'link' && (repayLink as any).isRepayment === true);
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
