// Move Money atomic transfer — correction round, 2026-08-10 (This Month
// flip card round; further corrected in the same-day Move Money
// architecture correction round).
//
// transferFunds's arithmetic previously lived inline inside a useCallback
// closure, unreachable outside a mounted React provider, so this file could
// only do structural source-text matching. As part of this round it was
// extracted into a pure, exported, directly-testable function
// (transferFundsTransition, AppStateContext.tsx) — the same "pull the real
// transition out of the hook" convention already used throughout this file
// for confirmRecurringOccurrenceTransition, deleteLiabilityTransition, etc.
// This file now imports and executes that REAL function directly — no
// mirrored/reimplemented arithmetic — for both the asset/liability transfer
// contract and the credit-card-mirror fix.
//
// Move Money architecture correction round, 2026-08-10: transferFundsTransition
// now returns a typed TransferFundsResult union (never AppData directly),
// re-validates eligibility against the shared moveMoneyEligibility.ts
// allowlist, does all arithmetic in integer cents, and REJECTS (never
// floors/clamps) an amount that would overdraw the source or exceed the
// liability's recorded balance. Every assertion below reads result.data
// after first checking result.applied, per the new contract.
//
// Run with: npx tsx tests/transfer-funds-wiring.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import { createEmptyAppData, createAppDataSaver } from '../src/lib/storage';
import { transferFundsTransition, TransferTarget, TransferFundsResult } from '../src/state/AppStateContext';
import type { AppData, Asset, Liability, CreditCard } from '../src/types/models';

// TEST-INFRASTRUCTURE CORRECTION (Wave 9a verification pass) — this file's
// structural reads were pinned to an absolute path naming one specific
// checkout on one machine. Run from any other worktree that silently reads
// a DIFFERENT
// repository, so a structural assertion could pass against code that is not
// the code under test. Paths now resolve from this file's own location,
// matching the convention design5-add-architecture.test.ts and others
// already use. No product assertion, expected value or production file is
// changed by this correction.
const REPO_ROOT = path.resolve(__dirname, '..');
const srcPath = (rel: string) => path.join(REPO_ROOT, rel);

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

function baseData(): AppData {
  return createEmptyAppData();
}
function withEntities(data: AppData, patch: Partial<Pick<AppData, 'assets' | 'liabilities' | 'creditCards'>>): AppData {
  return { ...data, ...patch };
}
function computeNetWorth(data: AppData): number {
  return data.assets.reduce((s, a) => s + a.currentValue, 0) - data.liabilities.reduce((s, l) => s + l.currentBalance, 0);
}
function expectApplied(result: TransferFundsResult): AppData {
  if (!result.applied) throw new Error(`expected applied:true, got rejected with reason "${result.reason}"`);
  return result.data;
}
function expectRejected(result: TransferFundsResult): Extract<TransferFundsResult, { applied: false }> {
  if (result.applied) throw new Error('expected applied:false, got applied:true');
  return result;
}

const APP_STATE_SRC = readFileSync(srcPath('src/state/AppStateContext.tsx'), 'utf-8');

// ============================================================================
// Section 1 — asset-to-asset and asset-to-liability transfer (real import)
// ============================================================================
console.log('=== Section 1: transferFundsTransition — asset/liability contract (real import) ===');
{
  // Source debited, destination asset credited — combined value preserved.
  {
    const data = withEntities(baseData(), {
      assets: [
        { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 },
        { id: 'everyday1', type: 'everyday', label: 'Everyday', currentValue: 500 },
      ],
    });
    const to: TransferTarget = { kind: 'asset', assetId: 'everyday1' };
    const raw = transferFundsTransition(data, 'cash1', to, 10.01);
    assert('Transfer is applied for two eligible liquid balances', raw.applied === true);
    const result = expectApplied(raw);
    assert('Source debited by exactly the transfer amount (1000 -> 989.99)', Math.abs(result.assets.find((a) => a.id === 'cash1')!.currentValue - 989.99) < 0.001);
    assert('Destination asset credited by exactly the transfer amount (500 -> 510.01)', Math.abs(result.assets.find((a) => a.id === 'everyday1')!.currentValue - 510.01) < 0.001);
    assert('Combined asset value is preserved (a transfer between two owned assets is zero-sum)', Math.abs(result.assets.reduce((s, a) => s + a.currentValue, 0) - 1500) < 0.001);
    assert('Net worth is unchanged by an asset-to-asset transfer', Math.abs(computeNetWorth(result) - computeNetWorth(data)) < 0.001);
    assert('effectiveAmountCents reports the exact requested amount in cents (1001)', raw.applied && raw.effectiveAmountCents === 1001);
  }

  // A non-eligible asset type (e.g. an investment) is rejected as a source —
  // the shared moveMoneyEligibility.ts allowlist (cash/everyday/savings
  // only), independently re-validated inside the transition itself.
  {
    const data = withEntities(baseData(), {
      assets: [
        { id: 'inv1', type: 'etf', label: 'ETF', currentValue: 1000 },
        { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 500 },
      ],
    });
    const raw = transferFundsTransition(data, 'inv1', { kind: 'asset', assetId: 'cash1' }, 100);
    const rejected = expectRejected(raw);
    assert('A non-liquid source (ETF) is rejected with source_not_eligible', rejected.reason === 'source_not_eligible');
    assert('A rejected transfer returns the untouched original data', rejected.data === data);
  }

  // A non-eligible destination asset type is rejected.
  {
    const data = withEntities(baseData(), {
      assets: [
        { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 },
        { id: 'inv1', type: 'etf', label: 'ETF', currentValue: 500 },
      ],
    });
    const raw = transferFundsTransition(data, 'cash1', { kind: 'asset', assetId: 'inv1' }, 100);
    assert('A non-liquid destination (ETF) is rejected with destination_not_eligible', !raw.applied && raw.reason === 'destination_not_eligible');
  }

  // A liability payment that EXCEEDS the recorded balance is now REJECTED
  // outright — never floored/clamped at 0 (the confirmed, fixed defect that
  // previously debited the source in full while flooring the liability,
  // destroying value).
  {
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 150 }],
    });
    const to: TransferTarget = { kind: 'liability', liabilityId: 'loan1' };
    const raw = transferFundsTransition(data, 'cash1', to, 500);
    const rejected = expectRejected(raw);
    assert('A paydown larger than the recorded balance is rejected with exceeds_liability_balance, never floored', rejected.reason === 'exceeds_liability_balance');
    assert('The rejected transfer leaves the liability balance completely untouched ($150)', rejected.data.liabilities.find((l) => l.id === 'loan1')!.currentBalance === 150);
    assert('The rejected transfer leaves the source asset completely untouched ($1000) — never debited on rejection', rejected.data.assets.find((a) => a.id === 'cash1')!.currentValue === 1000);
  }

  // An exact full payoff (amount === balance) is allowed and lands at
  // exactly 0.
  {
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 150 }],
    });
    const to: TransferTarget = { kind: 'liability', liabilityId: 'loan1' };
    const result = expectApplied(transferFundsTransition(data, 'cash1', to, 150));
    assert('An amount exactly equal to the liability balance is applied and floors it at exactly 0', result.liabilities.find((l) => l.id === 'loan1')!.currentBalance === 0);
    assert('The source asset is debited by the full requested amount (1000 -> 850)', result.assets.find((a) => a.id === 'cash1')!.currentValue === 850);
  }

  // Requesting more than the source holds is rejected with
  // insufficient_source, before any mutation.
  {
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 }],
      liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 1000 }],
    });
    const raw = transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'loan1' }, 500);
    const rejected = expectRejected(raw);
    assert('Requesting more than the source balance is rejected with insufficient_source', rejected.reason === 'insufficient_source');
    assert('Rejected insufficient-source transfer leaves the liability completely untouched ($1000)', rejected.data.liabilities.find((l) => l.id === 'loan1')!.currentBalance === 1000);
  }

  // Net worth changes correctly (decreases owed) when paying debt from an owned balance.
  {
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 300 }],
    });
    const to: TransferTarget = { kind: 'liability', liabilityId: 'loan1' };
    const result = expectApplied(transferFundsTransition(data, 'cash1', to, 100));
    assert('Net worth (assets - liabilities) is unchanged by paying debt from an owned balance: cash -100, liability -100, net worth flat', computeNetWorth(result) === computeNetWorth(data));
  }

  // Selecting the same balance as both source and destination is rejected.
  {
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
    });
    const raw = transferFundsTransition(data, 'cash1', { kind: 'asset', assetId: 'cash1' }, 100);
    assert('Transferring a balance to itself is rejected with same_balance', !raw.applied && raw.reason === 'same_balance');
  }

  // An invalid requested amount (zero, negative, non-finite) is rejected
  // before any lookup.
  {
    const data = withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }] });
    const zero = transferFundsTransition(data, 'cash1', { kind: 'asset', assetId: 'does-not-exist' }, 0);
    assert('An amount of exactly 0 is rejected with invalid_amount (checked before source/destination lookup)', !zero.applied && zero.reason === 'invalid_amount');
    const negative = transferFundsTransition(data, 'cash1', { kind: 'asset', assetId: 'does-not-exist' }, -10);
    assert('A negative amount is rejected with invalid_amount', !negative.applied && negative.reason === 'invalid_amount');
  }

  // No Transaction is ever created by a transfer.
  {
    const data = withEntities(baseData(), {
      assets: [
        { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 },
        { id: 'everyday1', type: 'everyday', label: 'Everyday', currentValue: 0 },
      ],
    });
    const result = expectApplied(transferFundsTransition(data, 'cash1', { kind: 'asset', assetId: 'everyday1' }, 250));
    assert('transferFundsTransition never creates a Transaction record', result.transactions.length === 0);
  }
}

// ============================================================================
// Section 2 — credit-card mirror correction (real import): the exact
// controlled cases A-D from the approved correction package.
// ============================================================================
console.log('\n=== Section 2: transferFundsTransition — credit-card mirror correction (real import) ===');
{
  function cardAndLiability(cardBalance: number, liabilityBalance: number, cardId = 'card1', liabilityId = 'liab1'): { creditCards: CreditCard[]; liabilities: Liability[] } {
    return {
      creditCards: [{ id: cardId, issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: cardBalance, dueDay: 15, minimumPayment: 25 }],
      liabilities: [{ id: liabilityId, type: 'credit_card', label: 'AMEX', currentBalance: liabilityBalance, creditCardId: cardId }],
    };
  }

  // Case A — in-sync state.
  {
    const entities = cardAndLiability(500, 500);
    const data = withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }], ...entities });
    const result = expectApplied(transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200));
    assert('Case A: liability reduces to exactly $300 (500 - 200)', result.liabilities.find((l) => l.id === 'liab1')!.currentBalance === 300);
    assert('Case A: the mirrored credit card is healed to the SAME $300', result.creditCards.find((c) => c.id === 'card1')!.currentBalance === 300);
    assert('Case A: source Cash decreases by exactly $200 per the existing transfer contract (1000 -> 800)', result.assets.find((a) => a.id === 'cash1')!.currentValue === 800);
    assert('Case A: net worth unchanged (cash -200, liability -200)', computeNetWorth(result) === computeNetWorth(data));
    assert('Case A: no Transaction is created merely by Move Money', result.transactions.length === 0);
  }

  // Case B — previously stale state: the card is HEALED to the liability's
  // resulting balance, not decremented from its own stale figure.
  {
    const entities = cardAndLiability(650, 500);
    const data = withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }], ...entities });
    const result = expectApplied(transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200));
    assert('Case B: resulting liability is exactly $300 (500 - 200)', result.liabilities.find((l) => l.id === 'liab1')!.currentBalance === 300);
    assert('Case B: the previously-stale card ($650) is healed to $300 — NOT $450 (650 - 200), proving the fix sets the card to the liability\'s resulting value, never decrements the card\'s own stale figure', result.creditCards.find((c) => c.id === 'card1')!.currentBalance === 300);
    assert('Case B: liability and card agree exactly after the transfer, closing the pre-existing disagreement', result.liabilities.find((l) => l.id === 'liab1')!.currentBalance === result.creditCards.find((c) => c.id === 'card1')!.currentBalance);
    assert('Case B: no historical transaction or migration record is created by the heal', result.transactions.length === 0);
  }

  // Case C — a second, unrelated card must never change.
  {
    const entities = cardAndLiability(500, 500, 'card1', 'liab1');
    const secondCard: CreditCard = { id: 'card2', issuer: 'Visa', label: 'Visa', creditLimit: 3000, currentBalance: 900, dueDay: 20, minimumPayment: 30 };
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      creditCards: [...entities.creditCards, secondCard],
      liabilities: entities.liabilities,
    });
    const result = expectApplied(transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200));
    assert('Case C: only the linked card (AMEX) changes (500 -> 300)', result.creditCards.find((c) => c.id === 'card1')!.currentBalance === 300);
    assert('Case C: the second, unrelated card (Visa) is completely untouched ($900)', result.creditCards.find((c) => c.id === 'card2')!.currentBalance === 900);
  }

  // Case D — missing/no linked card: safe, no crash, no unrelated change.
  {
    // D1: the target liability has no creditCardId at all (an ordinary loan).
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 500 }],
      creditCards: [{ id: 'card1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 700, dueDay: 15, minimumPayment: 25 }],
    });
    const result = expectApplied(transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'loan1' }, 200));
    assert('Case D1 (no linked card): the ordinary liability transfer contract still applies safely (500 -> 300)', result.liabilities.find((l) => l.id === 'loan1')!.currentBalance === 300);
    assert('Case D1 (no linked card): the unrelated existing credit card is completely untouched ($700)', result.creditCards.find((c) => c.id === 'card1')!.currentBalance === 700);

    // D2: the liability references a creditCardId that no longer resolves
    // (the card was deleted after the liability was created) — safe no-op
    // for the credit-card side, ordinary liability transfer still applies.
    const data2 = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [{ id: 'liab1', type: 'credit_card', label: 'Orphaned Card', currentBalance: 500, creditCardId: 'does-not-exist' }],
      creditCards: [],
    });
    const result2 = expectApplied(transferFundsTransition(data2, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200));
    assert('Case D2 (dangling creditCardId): liability transfer still applies safely (500 -> 300)', result2.liabilities.find((l) => l.id === 'liab1')!.currentBalance === 300);
    assert('Case D2 (dangling creditCardId): no crash, and creditCards array remains empty, not mutated into anything', result2.creditCards.length === 0);

    // D3: a to.liabilityId that doesn't resolve to anything at all — now
    // rejected with destination_missing rather than silently no-op applying.
    const data3 = withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }] });
    const raw3 = transferFundsTransition(data3, 'cash1', { kind: 'liability', liabilityId: 'does-not-exist' }, 200);
    const rejected3 = expectRejected(raw3);
    assert('Case D3 (unresolvable liabilityId): rejected with destination_missing', rejected3.reason === 'destination_missing');
    assert('Case D3 (unresolvable liabilityId): the source is left completely untouched on rejection ($1000)', rejected3.data.assets.find((a) => a.id === 'cash1')!.currentValue === 1000);
  }

  // Restart preserves agreement — JSON round-trip (the real persistence
  // format) after Case A, still agrees.
  {
    const entities = cardAndLiability(500, 500);
    const data = withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }], ...entities });
    const result = expectApplied(transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200));
    const restored: AppData = JSON.parse(JSON.stringify(result));
    assert('Restart (JSON round-trip): liability and card still agree exactly ($300 each)', restored.liabilities.find((l) => l.id === 'liab1')!.currentBalance === restored.creditCards.find((c) => c.id === 'card1')!.currentBalance);
  }
}

// ============================================================================
// Section 3 — concurrency/serialization proof: two sequential calls against
// the same starting balance must never "race" past each other, because each
// call reads the *result* of the one before it (mirroring the real
// dataRef/commitData latest-state pattern — see AppStateContext.tsx).
// ============================================================================
console.log('\n=== Section 3: transferFundsTransition — sequential-call serialization proof ===');
{
  // $100 source, two back-to-back $80 transfer attempts. If (and only if)
  // each call is threaded through the previous call's OWN resulting data —
  // exactly how the real dataRef-based transferFunds wrapper behaves — the
  // second call must see an $20 source and reject with insufficient_source,
  // never silently double-spend down to -$60.
  const data = withEntities(baseData(), {
    assets: [
      { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 100 },
      { id: 'everyday1', type: 'everyday', label: 'Everyday', currentValue: 0 },
    ],
  });
  const first = expectApplied(transferFundsTransition(data, 'cash1', { kind: 'asset', assetId: 'everyday1' }, 80));
  assert('First $80 transfer against $100 succeeds, leaving $20 in the source', first.assets.find((a) => a.id === 'cash1')!.currentValue === 20);
  const second = transferFundsTransition(first, 'cash1', { kind: 'asset', assetId: 'everyday1' }, 80);
  assert('A second $80 transfer, threaded through the FIRST call\'s resulting data (the real dataRef pattern), correctly rejects with insufficient_source instead of double-spending', !second.applied && second.reason === 'insufficient_source');
  assert('The rejected second call leaves the already-applied first transfer intact ($20 source, $80 destination)', !second.applied && second.data.assets.find((a) => a.id === 'cash1')!.currentValue === 20 && second.data.assets.find((a) => a.id === 'everyday1')!.currentValue === 80);
}

// ============================================================================
// Section 4 — Structural: single-persist-call wiring, unchanged contract
// ============================================================================
console.log('\n=== Section 4: transferFunds wrapper — structural wiring (single persist call, latest-state read) ===');
{
  assert(
    'transferFunds (the useCallback wrapper) reads dataRef.current for the latest state, passes the real, pure transferFundsTransition\'s result straight to persist() — one atomic write, not two separate writes that could partially apply',
    /\(fromAssetId: string, to: TransferTarget, amount: number\): TransferFundsResult => \{\s*\n\s*const result = transferFundsTransition\(dataRef\.current, fromAssetId, to, amount\);\s*\n\s*if \(result\.applied\) persist\(result\.data\);\s*\n\s*return result;\s*\n\s*\},/.test(
      APP_STATE_SRC
    )
  );
  assert(
    'transferFundsTransition itself is exported and pure (data in, TransferFundsResult out) — genuinely real-importable, not trapped inside the hook',
    /export function transferFundsTransition\(data: AppData, fromAssetId: string, to: TransferTarget, amount: number\): TransferFundsResult \{/.test(APP_STATE_SRC)
  );
}

// ============================================================================
// Section 5 — exact controlled-cents scenarios (verification-and-correction
// pass, per-user-specified inputs). Every case below prints the actual
// returned values so the implementation report can quote them verbatim,
// not merely pass/fail.
// ============================================================================
console.log('\n=== Section 5: exact controlled-cents scenarios (real import) ===');

// A — asset-to-asset exact cents.
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'main-everyday', type: 'everyday', label: 'Main Everyday', currentValue: 10.01 },
      { id: 'savings', type: 'savings', label: 'Savings', currentValue: 1.99 },
    ],
  });
  const before = computeNetWorth(data);
  const raw = transferFundsTransition(data, 'main-everyday', { kind: 'asset', assetId: 'savings' }, 3.02);
  const result = expectApplied(raw);
  const everydayAfter = result.assets.find((a) => a.id === 'main-everyday')!.currentValue;
  const savingsAfter = result.assets.find((a) => a.id === 'savings')!.currentValue;
  console.log(`  A: Main Everyday 10.01 -> ${everydayAfter}, Savings 1.99 -> ${savingsAfter}, effectiveAmountCents=${raw.applied ? raw.effectiveAmountCents : 'n/a'}`);
  assert('A: Main Everyday becomes exactly $6.99', everydayAfter === 6.99);
  assert('A: Savings becomes exactly $5.01', savingsAfter === 5.01);
  assert('A: net worth unchanged', computeNetWorth(result) === before);
  assert('A: transaction count unchanged (0 -> 0), no income or expense transaction created', result.transactions.length === 0 && data.transactions.length === 0);
  assert('A: effectiveAmountCents is exactly 302', raw.applied && raw.effectiveAmountCents === 302);
}

// B — asset-to-liability exact payoff, with linked-card healing to $0.
{
  const data = withEntities(baseData(), {
    assets: [{ id: 'cash', type: 'cash', label: 'Cash', currentValue: 10.01 }],
    liabilities: [{ id: 'liab', type: 'credit_card', label: 'Card', currentBalance: 3.02, creditCardId: 'card1' }],
    creditCards: [{ id: 'card1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 3.02, dueDay: 15, minimumPayment: 25 }],
  });
  const before = computeNetWorth(data);
  const raw = transferFundsTransition(data, 'cash', { kind: 'liability', liabilityId: 'liab' }, 3.02);
  const result = expectApplied(raw);
  const cashAfter = result.assets.find((a) => a.id === 'cash')!.currentValue;
  const liabAfter = result.liabilities.find((l) => l.id === 'liab')!.currentBalance;
  const cardAfter = result.creditCards.find((c) => c.id === 'card1')!.currentBalance;
  console.log(`  B: Cash 10.01 -> ${cashAfter}, Liability 3.02 -> ${liabAfter}, Card 3.02 -> ${cardAfter}`);
  assert('B: Cash becomes exactly $6.99', cashAfter === 6.99);
  assert('B: Liability becomes exactly $0', liabAfter === 0);
  assert('B: Linked card becomes exactly $0', cardAfter === 0);
  assert('B: net worth unchanged', computeNetWorth(result) === before);
  assert('B: transaction count unchanged (0 -> 0)', result.transactions.length === 0);
}

// C — insufficient source.
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'source', type: 'cash', label: 'Source', currentValue: 100 },
      { id: 'dest', type: 'savings', label: 'Dest', currentValue: 20 },
    ],
  });
  const raw = transferFundsTransition(data, 'source', { kind: 'asset', assetId: 'dest' }, 150);
  const rejected = expectRejected(raw);
  console.log(`  C: reason=${rejected.reason}, data===original: ${rejected.data === data}`);
  assert('C: rejected with insufficient_source', rejected.reason === 'insufficient_source');
  assert('C: the returned data is the literal original object reference (no copy, no mutation)', rejected.data === data);
  assert('C: source balance unchanged ($100)', rejected.data.assets.find((a) => a.id === 'source')!.currentValue === 100);
  assert('C: destination balance unchanged ($20)', rejected.data.assets.find((a) => a.id === 'dest')!.currentValue === 20);
  assert('C: transaction count unchanged (0)', rejected.data.transactions.length === 0);
  // "No persistence call" — transferFundsTransition is a pure function with
  // no side effects at all (proven by referential equality above); the only
  // call site that can ever reach persist() is the transferFunds wrapper,
  // and Section 4's structural assertion above proves persist() is gated
  // strictly behind `if (result.applied)` — a rejected result can never
  // reach it.
}

// D — liability overpayment.
{
  const data = withEntities(baseData(), {
    assets: [{ id: 'source', type: 'cash', label: 'Source', currentValue: 500 }],
    liabilities: [{ id: 'loan', type: 'personal_loan', label: 'Loan', currentBalance: 100 }],
  });
  const raw = transferFundsTransition(data, 'source', { kind: 'liability', liabilityId: 'loan' }, 300);
  const rejected = expectRejected(raw);
  console.log(`  D: reason=${rejected.reason}`);
  assert('D: rejected with exceeds_liability_balance', rejected.reason === 'exceeds_liability_balance');
  assert('D: source unchanged ($500)', rejected.data.assets.find((a) => a.id === 'source')!.currentValue === 500);
  assert('D: liability unchanged ($100)', rejected.data.liabilities.find((l) => l.id === 'loan')!.currentBalance === 100);
  assert('D: no transaction created', rejected.data.transactions.length === 0);
  assert('D: net worth unchanged', computeNetWorth(rejected.data) === computeNetWorth(data));
}

// E — both constraints exceeded: deterministic rejection priority.
// The production code (AppStateContext.tsx, transferFundsTransition) checks
// `requestedCents > sourceCents` BEFORE `requestedCents > liabilityCents` —
// insufficient_source is therefore always reported first when an amount
// exceeds both the source balance AND the liability balance.
{
  const data = withEntities(baseData(), {
    assets: [{ id: 'source', type: 'cash', label: 'Source', currentValue: 50 }],
    liabilities: [{ id: 'loan', type: 'personal_loan', label: 'Loan', currentBalance: 30 }],
  });
  const raw = transferFundsTransition(data, 'source', { kind: 'liability', liabilityId: 'loan' }, 1000);
  const rejected = expectRejected(raw);
  console.log(`  E: amount 1000 exceeds both source $50 and liability $30 -> reason=${rejected.reason}`);
  assert('E: when an amount exceeds BOTH the source balance and the liability balance, insufficient_source is the deterministic result (source-sufficiency is checked before liability-sufficiency)', rejected.reason === 'insufficient_source');
}

// F — same balance.
{
  const data = withEntities(baseData(), { assets: [{ id: 'only', type: 'cash', label: 'Only', currentValue: 100 }] });
  const raw = transferFundsTransition(data, 'only', { kind: 'asset', assetId: 'only' }, 10);
  const rejected = expectRejected(raw);
  console.log(`  F: reason=${rejected.reason}`);
  assert('F: rejected with same_balance', rejected.reason === 'same_balance');
  assert('F: no mutation (unchanged balance)', rejected.data.assets.find((a) => a.id === 'only')!.currentValue === 100);
}

// G — invalid recorded balance, all three sides independently.
{
  // G1: invalid SOURCE.
  const data1 = withEntities(baseData(), {
    assets: [
      { id: 'source', type: 'cash', label: 'Source', currentValue: NaN },
      { id: 'dest', type: 'savings', label: 'Dest', currentValue: 100 },
    ],
  });
  const raw1 = transferFundsTransition(data1, 'source', { kind: 'asset', assetId: 'dest' }, 10);
  const rejected1 = expectRejected(raw1);
  console.log(`  G1 (invalid source): reason=${rejected1.reason}, invalidBalanceSide=${rejected1.invalidBalanceSide}`);
  assert('G1: rejected with invalid_recorded_balance, side=source', rejected1.reason === 'invalid_recorded_balance' && rejected1.invalidBalanceSide === 'source');
  assert('G1: no mutation', rejected1.data.assets.find((a) => a.id === 'dest')!.currentValue === 100);

  // G2: invalid DESTINATION asset.
  const data2 = withEntities(baseData(), {
    assets: [
      { id: 'source', type: 'cash', label: 'Source', currentValue: 100 },
      { id: 'dest', type: 'savings', label: 'Dest', currentValue: NaN },
    ],
  });
  const raw2 = transferFundsTransition(data2, 'source', { kind: 'asset', assetId: 'dest' }, 10);
  const rejected2 = expectRejected(raw2);
  console.log(`  G2 (invalid destination): reason=${rejected2.reason}, invalidBalanceSide=${rejected2.invalidBalanceSide}`);
  assert('G2: rejected with invalid_recorded_balance, side=destination', rejected2.reason === 'invalid_recorded_balance' && rejected2.invalidBalanceSide === 'destination');
  assert('G2: no mutation', rejected2.data.assets.find((a) => a.id === 'source')!.currentValue === 100);

  // G3: invalid LIABILITY balance.
  const data3 = withEntities(baseData(), {
    assets: [{ id: 'source', type: 'cash', label: 'Source', currentValue: 100 }],
    liabilities: [{ id: 'loan', type: 'personal_loan', label: 'Loan', currentBalance: NaN }],
  });
  const raw3 = transferFundsTransition(data3, 'source', { kind: 'liability', liabilityId: 'loan' }, 10);
  const rejected3 = expectRejected(raw3);
  console.log(`  G3 (invalid liability): reason=${rejected3.reason}, invalidBalanceSide=${rejected3.invalidBalanceSide}`);
  assert('G3: rejected with invalid_recorded_balance, side=liability', rejected3.reason === 'invalid_recorded_balance' && rejected3.invalidBalanceSide === 'liability');
  assert('G3: no mutation', rejected3.data.assets.find((a) => a.id === 'source')!.currentValue === 100);
}

// H — linked-card healing, exact user-specified numbers (also proven,
// identically, by Section 2 Case B above — restated here with the exact
// values from this pass's own spec for direct citation).
{
  const data = withEntities(baseData(), {
    assets: [{ id: 'source', type: 'cash', label: 'Source', currentValue: 1000 }],
    liabilities: [{ id: 'liab', type: 'credit_card', label: 'Card', currentBalance: 500, creditCardId: 'card1' }],
    creditCards: [{ id: 'card1', issuer: 'AMEX', label: 'AMEX', creditLimit: 5000, currentBalance: 650, dueDay: 15, minimumPayment: 25 }],
  });
  const before = computeNetWorth(data);
  const raw = transferFundsTransition(data, 'source', { kind: 'liability', liabilityId: 'liab' }, 200);
  const result = expectApplied(raw);
  const liabAfter = result.liabilities.find((l) => l.id === 'liab')!.currentBalance;
  const cardAfter = result.creditCards.find((c) => c.id === 'card1')!.currentBalance;
  console.log(`  H: liability 500 -> ${liabAfter}, stale card 650 -> ${cardAfter}`);
  assert('H: liability becomes exactly $300', liabAfter === 300);
  assert('H: stale linked card is healed to exactly $300 (not 650-200=450)', cardAfter === 300);
  assert('H: net worth unchanged', computeNetWorth(result) === before);
}

// I — sequential duplicate attempt, exact user-specified numbers (also
// proven, identically, by Section 3 above — restated here for direct
// citation with this pass's own numbers).
{
  const data = withEntities(baseData(), {
    assets: [
      { id: 'source', type: 'cash', label: 'Source', currentValue: 100 },
      { id: 'dest', type: 'everyday', label: 'Dest', currentValue: 0 },
    ],
  });
  const firstRaw = transferFundsTransition(data, 'source', { kind: 'asset', assetId: 'dest' }, 80);
  const first = expectApplied(firstRaw);
  const secondRaw = transferFundsTransition(first, 'source', { kind: 'asset', assetId: 'dest' }, 80);
  const second = expectRejected(secondRaw);
  const finalSource = second.data.assets.find((a) => a.id === 'source')!.currentValue;
  const finalDest = second.data.assets.find((a) => a.id === 'dest')!.currentValue;
  console.log(`  I: first applies (source -> $20), second re-validates against $20 -> reason=${second.reason}, final source=${finalSource}, final dest=${finalDest}`);
  assert('I: first $80 request applies', firstRaw.applied === true);
  assert('I: second $80 request is rejected (revalidated against the $20 remaining, not the original $100)', second.reason === 'insufficient_source');
  assert('I: final source balance is exactly $20 (one effect applied, not two, not zero)', finalSource === 20);
  assert('I: exactly one destination effect ($80 credited once, not twice)', finalDest === 80);
}

// J — restart: serialize each successful result through the real
// createAppDataSaver save path (the same convention already established in
// tests/everyday-account-move-money-and-expense-routing.test.ts section 14),
// then parse it back and confirm every exact value survives.
async function runRestartSection() {
  console.log('\n=== Section 5J: restart — real save-path round-trip ===');
  const data = withEntities(baseData(), {
    assets: [
      { id: 'main-everyday', type: 'everyday', label: 'Main Everyday', currentValue: 10.01 },
      { id: 'savings', type: 'savings', label: 'Savings', currentValue: 1.99 },
    ],
  });
  const applied = expectApplied(transferFundsTransition(data, 'main-everyday', { kind: 'asset', assetId: 'savings' }, 3.02));

  let written: string | null = null;
  const save = createAppDataSaver((_key, value) => {
    written = value;
    return Promise.resolve();
  });
  await save(applied);
  const restored = JSON.parse(written as unknown as string) as AppData;
  const everydayRestored = restored.assets.find((a) => a.id === 'main-everyday')!.currentValue;
  const savingsRestored = restored.assets.find((a) => a.id === 'savings')!.currentValue;
  console.log(`  J: restored Main Everyday=${everydayRestored}, restored Savings=${savingsRestored}`);
  assert('J: restart — Main Everyday remains exactly $6.99 after the real save path and reload', everydayRestored === 6.99);
  assert('J: restart — Savings remains exactly $5.01 after the real save path and reload', savingsRestored === 5.01);
  assert('J: restart — net worth is identical before and after the real save/reload round-trip', computeNetWorth(restored) === computeNetWorth(applied));

  console.log(`\n${total - failures}/${total} passed.`);
  if (failures > 0) process.exit(1);
}

runRestartSection();
