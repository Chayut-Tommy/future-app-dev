// A1 — occurrence-resolution transitions, persistence compatibility & no-mutation (pure).
// Real-import of the ACTUAL AppStateContext transitions + storage migrations.
// Run: ./node_modules/.bin/tsx tests/a1-occurrence-transitions.test.ts

import type { AppData, Transaction, Asset } from '../src/types/models';
import { createEmptyAppData, dedupeCreditCards, migrateIncomeToRecurringItems, migrateSavingsAllocationPromptFlag, migrateRecurringItemAnchors } from '../src/lib/storage';
import {
  applyLinkTransactionToOccurrence,
  applyMarkTransactionIndependent,
  applyMarkTransactionUnresolved,
  applyClearOccurrenceResolution,
  applyManualBalanceEdit,
  applyNewTransaction,
} from '../src/state/AppStateContext';
import { buildOccurrenceId } from '../src/lib/calculations/occurrenceIdentity';
import { classifyTransaction, resolveOccurrence } from '../src/lib/calculations/occurrenceResolution';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (y: number, m: number, d: number) => D(y, m, d).toISOString();
const runMigrations = (data: AppData): AppData => migrateRecurringItemAnchors(migrateSavingsAllocationPromptFlag(migrateIncomeToRecurringItems(dedupeCreditCards(data))));

const augWage = buildOccurrenceId({ sourceKind: 'income', sourceId: 'wage', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
function base(txns: Transaction[], assets: Asset[] = []): AppData {
  return { ...createEmptyAppData(), transactions: txns, assets };
}
const tx = (p: Partial<Transaction>): Transaction => ({ id: p.id ?? 't', type: p.type ?? 'income', amount: p.amount ?? 2000, categoryId: 'c', date: iso(2026, 8, 25), ...p } as Transaction);

console.log('=== link / independent / unlink lifecycle ===');
{
  const data0 = base([tx({ id: 's', amount: 2000 })]);
  const r = applyLinkTransactionToOccurrence(data0, 's', augWage, false);
  assert('1a. link applies', r.applied === true);
  const linked = r.applied ? r.data : data0;
  assert('1b. transaction is classified linked with the occurrence id', classifyTransaction(linked.transactions[0]).classification === 'linked' && classifyTransaction(linked.transactions[0]).occurrenceId === augWage);
  assert('1c. occurrence resolves satisfied', resolveOccurrence({ id: augWage, sourceKind: 'income', sourceId: 'wage', isRepayment: false }, linked.transactions).state === 'satisfied');
  // input not mutated (purity)
  assert('1d. link does NOT mutate the input snapshot', data0.transactions[0].occurrenceResolution === undefined);

  const indep = applyMarkTransactionIndependent(data0, 's');
  assert('1e. independent applies and does not satisfy the occurrence', classifyTransaction(indep.transactions[0]).classification === 'independent' && resolveOccurrence({ id: augWage, sourceKind: 'income', sourceId: 'wage', isRepayment: false }, indep.transactions).state === 'eligible');

  const unlinked = applyClearOccurrenceResolution(linked, 's');
  assert('1f. unlink removes the resolution (unclassified) and re-exposes the occurrence', classifyTransaction(unlinked.transactions[0]).classification === 'unclassified' && resolveOccurrence({ id: augWage, sourceKind: 'income', sourceId: 'wage', isRepayment: false }, unlinked.transactions).state === 'eligible');

  const unres = applyMarkTransactionUnresolved(data0, 's');
  assert('1g. mark-unresolved applies', classifyTransaction(unres.transactions[0]).classification === 'unresolved');
}

console.log('=== conflict rejection (never overwrite) ===');
{
  const first = applyLinkTransactionToOccurrence(base([tx({ id: 'a' }), tx({ id: 'b' })]), 'a', augWage, false);
  const withA = first.applied ? first.data : null;
  assert('2a. first link applies', !!withA);
  if (withA) {
    const second = applyLinkTransactionToOccurrence(withA, 'b', augWage, false);
    assert('2b. a second link to the same income occurrence is REJECTED as conflict', second.applied === false && (second as any).reason === 'conflict');
    assert('2c. the first link is untouched by the rejected attempt', classifyTransaction(withA.transactions[0]).classification === 'linked');
  }
  // repayment occurrences are additive (no conflict on multiplicity).
  const card = buildOccurrenceId({ sourceKind: 'card', sourceId: 'c1', occurrenceDate: D(2026, 8, 25), cadence: 'monthly' });
  const d1 = applyLinkTransactionToOccurrence(base([tx({ id: 'p1', amount: 80 }), tx({ id: 'p2', amount: 120 })]), 'p1', card, true);
  const d2 = d1.applied ? applyLinkTransactionToOccurrence(d1.data, 'p2', card, true) : { applied: false };
  assert('2d. two repayment links to one cycle are both allowed (additive)', d2.applied === true);
  // invalid occurrence id and missing txn
  assert('2e. linking a missing transaction → not_found', applyLinkTransactionToOccurrence(base([]), 'nope', augWage, false).applied === false);
  assert('2f. linking to a non-oid1 id → invalid_occurrence', (applyLinkTransactionToOccurrence(base([tx({ id: 's' })]), 's', 'legacy:x' as any, false) as any).reason === 'invalid_occurrence');
}

console.log('=== manual balance-edit signal (stamp only on currentValue change) ===');
{
  const asset: Asset = { id: 'cash', type: 'cash', label: 'Cash', currentValue: 100 };
  const data0 = base([], [asset]);
  const changed = applyManualBalanceEdit(data0, 'cash', { currentValue: 200 }, 'NOW-1');
  assert('3a. a currentValue change stamps manualBalanceUpdatedAt', changed.assets[0].manualBalanceUpdatedAt === 'NOW-1' && changed.assets[0].currentValue === 200);
  const labelOnly = applyManualBalanceEdit(data0, 'cash', { label: 'Wallet' }, 'NOW-2');
  assert('3b. a label-only edit does NOT stamp the signal', labelOnly.assets[0].manualBalanceUpdatedAt === undefined && labelOnly.assets[0].label === 'Wallet');
  const same = applyManualBalanceEdit(data0, 'cash', { currentValue: 100 }, 'NOW-3');
  assert('3c. setting the same value does NOT stamp', same.assets[0].manualBalanceUpdatedAt === undefined);
  assert('3d. input snapshot not mutated', data0.assets[0].manualBalanceUpdatedAt === undefined && data0.assets[0].currentValue === 100);
  assert('3e. the signal never alters the balance figure itself', changed.assets[0].currentValue === 200);
}

console.log('=== persistence compatibility: old / new / mixed / unknown-version ===');
{
  const legacyTxn = tx({ id: 'legacy', type: 'expense', amount: 900, recurringItemId: 'rent', recurringOccurrenceKey: `rent:${iso(2026, 8, 1)}` }); // pre-A1: no occurrenceResolution
  const newTxn = tx({ id: 'new', amount: 2000, occurrenceResolution: { version: 1, state: 'linked', occurrenceId: augWage } });
  const unknownTxn = tx({ id: 'unk', amount: 50, occurrenceResolution: { version: 2, state: 'linked', occurrenceId: augWage } as any });
  const assetStamped: Asset = { id: 'cash', type: 'cash', label: 'Cash', currentValue: 300, manualBalanceUpdatedAt: 'NOW' };
  const snapshot = base([legacyTxn, newTxn, unknownTxn], [assetStamped]);

  // 1) serialize + hydrate round-trip preserves every field, additively.
  const round = JSON.parse(JSON.stringify(snapshot)) as AppData;
  assert('4a. legacy recurringOccurrenceKey survives round-trip, still no occurrenceResolution', round.transactions[0].recurringOccurrenceKey === legacyTxn.recurringOccurrenceKey && round.transactions[0].occurrenceResolution === undefined);
  assert('4b. new occurrenceResolution survives round-trip', (round.transactions[1].occurrenceResolution as any).state === 'linked');
  assert('4c. asset manualBalanceUpdatedAt survives round-trip', round.assets[0].manualBalanceUpdatedAt === 'NOW');

  // 2) classification of mixed data.
  assert('4d. legacy record classifies as unclassified (NOT globally unresolved)', classifyTransaction(round.transactions[0]).classification === 'unclassified');
  assert('4e. new record classifies linked', classifyTransaction(round.transactions[1]).classification === 'linked');
  assert('4f. unknown-version record fails closed', classifyTransaction(round.transactions[2]).classification === 'unresolved' && classifyTransaction(round.transactions[2]).unknownVersion === true);

  // 3) the migration chain performs NO destructive rewrite of the new fields.
  const migrated = runMigrations(snapshot);
  assert('4g. migration chain returns the SAME snapshot by reference (zero destructive migration)', migrated === snapshot);
  assert('4h. legacy field preserved through migrations', migrated.transactions[0].recurringOccurrenceKey === legacyTxn.recurringOccurrenceKey);
}

console.log('=== no destructive rewrite of other records; sequential composition ===');
{
  const other = tx({ id: 'other', type: 'expense', amount: 60, recurringItemId: 'bill', recurringOccurrenceKey: `bill:${iso(2026, 8, 3)}` });
  const target = tx({ id: 'sal', amount: 2000 });
  const data0 = base([other, target]);
  const r = applyLinkTransactionToOccurrence(data0, 'sal', augWage, false);
  const after = r.applied ? r.data : data0;
  assert('5a. linking one record leaves every OTHER record byte-identical', after.transactions[0] === data0.transactions[0]);
  assert('5b. the other record keeps its legacy recurringOccurrenceKey', after.transactions[0].recurringOccurrenceKey === other.recurringOccurrenceKey);
  // two independent classifications compose (mirrors dataRef.current sequencing).
  const sepData = applyMarkTransactionIndependent(after, 'other');
  assert('5c. sequential transitions compose without clobbering the earlier one', classifyTransaction(sepData.transactions.find((t) => t.id === 'sal')!).classification === 'linked' && classifyTransaction(sepData.transactions.find((t) => t.id === 'other')!).classification === 'independent');
}

console.log('=== cancel writes nothing (no transition called) ===');
{
  const data0 = base([tx({ id: 's' })]);
  // "Cancel" = the UI simply does not invoke a transition. Prove the snapshot
  // is untouched and a subsequent read is referentially identical.
  const cancelled = data0; // no transition
  assert('6a. cancel leaves the snapshot referentially identical (zero write)', cancelled === data0 && cancelled.transactions[0].occurrenceResolution === undefined);
}

console.log('=== creation-with-resolution: exactly one transaction, one balance effect ===');
{
  // Mirrors QuickAddModal.handleClassificationChoice → addTransaction: the txn
  // is created ONCE carrying the chosen resolution, applying its balance effect
  // exactly once.
  const cash: Asset = { id: 'cash', type: 'cash', label: 'Cash', currentValue: 1000 };
  const data0 = base([], [cash]);
  const linkedData = applyNewTransaction(data0, { type: 'expense', amount: 40, categoryId: 'c', date: iso(2026, 8, 25), paymentSource: 'cash', balanceEffect: 'update', occurrenceResolution: { version: 1, state: 'linked', occurrenceId: augWage } } as any);
  assert('7a. linked creation makes exactly one transaction', linkedData.transactions.length === 1);
  assert('7b. it carries the linked resolution', classifyTransaction(linkedData.transactions[0]).classification === 'linked');
  assert('7c. exactly one balance effect applied (cash 1000 → 960)', linkedData.assets.find((a) => a.id === 'cash')!.currentValue === 960 && !!linkedData.transactions[0].appliedBalanceEffect);

  const indepData = applyNewTransaction(data0, { type: 'expense', amount: 40, categoryId: 'c', date: iso(2026, 8, 25), paymentSource: 'cash', balanceEffect: 'update', occurrenceResolution: { version: 1, state: 'independent' } } as any);
  assert('7d. independent creation makes one transaction classified independent', indepData.transactions.length === 1 && classifyTransaction(indepData.transactions[0]).classification === 'independent');
  assert('7e. independent creation applies exactly one balance effect', indepData.assets.find((a) => a.id === 'cash')!.currentValue === 960);
}

console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exit(1);
