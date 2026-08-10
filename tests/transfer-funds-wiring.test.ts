// Move Money atomic transfer — correction round, 2026-08-10 (This Month
// flip card round).
//
// transferFunds's arithmetic previously lived inline inside a useCallback
// closure, unreachable outside a mounted React provider, so this file could
// only do structural source-text matching. As part of this round it was
// extracted into a pure, exported, directly-testable function
// (transferFundsTransition, AppStateContext.tsx) — the same "pull the real
// transition out of the hook" convention already used throughout this file
// for confirmRecurringOccurrenceTransition, deleteLiabilityTransition, etc.
// This file now imports and executes that REAL function directly — no
// mirrored/reimplemented arithmetic — for both the pre-existing
// asset/liability transfer contract and the new credit-card-mirror fix.
//
// Run with: npx tsx tests/transfer-funds-wiring.test.ts

import { readFileSync } from 'fs';
import { createEmptyAppData } from '../src/lib/storage';
import { transferFundsTransition, TransferTarget } from '../src/state/AppStateContext';
import type { AppData, Asset, Liability, CreditCard } from '../src/types/models';

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

const APP_STATE_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/state/AppStateContext.tsx', 'utf-8');

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
        { id: 'inv1', type: 'etf', label: 'ETF', currentValue: 500 },
      ],
    });
    const to: TransferTarget = { kind: 'asset', assetId: 'inv1' };
    const result = transferFundsTransition(data, 'cash1', to, 10.01);
    assert('Source debited by exactly the transfer amount (1000 -> 989.99)', Math.abs(result.assets.find((a) => a.id === 'cash1')!.currentValue - 989.99) < 0.001);
    assert('Destination asset credited by exactly the transfer amount (500 -> 510.01)', Math.abs(result.assets.find((a) => a.id === 'inv1')!.currentValue - 510.01) < 0.001);
    assert('Combined asset value is preserved (a transfer between two owned assets is zero-sum)', Math.abs(result.assets.reduce((s, a) => s + a.currentValue, 0) - 1500) < 0.001);
    assert('Net worth is unchanged by an asset-to-asset transfer', Math.abs(computeNetWorth(result) - computeNetWorth(data)) < 0.001);
  }

  // Liability paydown, floored at 0 — never goes negative.
  {
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 150 }],
    });
    const to: TransferTarget = { kind: 'liability', liabilityId: 'loan1' };
    const result = transferFundsTransition(data, 'cash1', to, 500);
    assert('A paydown larger than the balance floors the liability at exactly 0, never negative', result.liabilities.find((l) => l.id === 'loan1')!.currentBalance === 0);
    assert('The source asset is still debited by the FULL requested amount, not clamped to the balance', result.assets.find((a) => a.id === 'cash1')!.currentValue === 500);
  }

  // Net worth changes correctly (decreases owed) when paying debt from an owned balance.
  {
    const data = withEntities(baseData(), {
      assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }],
      liabilities: [{ id: 'loan1', type: 'personal_loan', label: 'Personal Loan', currentBalance: 300 }],
    });
    const to: TransferTarget = { kind: 'liability', liabilityId: 'loan1' };
    const result = transferFundsTransition(data, 'cash1', to, 100);
    assert('Net worth (assets - liabilities) is unchanged by paying debt from an owned balance: cash -100, liability -100, net worth flat', computeNetWorth(result) === computeNetWorth(data));
  }

  // No Transaction is ever created by a transfer.
  {
    const data = withEntities(baseData(), {
      assets: [
        { id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 },
        { id: 'inv1', type: 'etf', label: 'ETF', currentValue: 0 },
      ],
    });
    const result = transferFundsTransition(data, 'cash1', { kind: 'asset', assetId: 'inv1' }, 250);
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
    const result = transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200);
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
    const result = transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200);
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
    const result = transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200);
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
    const result = transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'loan1' }, 200);
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
    const result2 = transferFundsTransition(data2, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200);
    assert('Case D2 (dangling creditCardId): liability transfer still applies safely (500 -> 300)', result2.liabilities.find((l) => l.id === 'liab1')!.currentBalance === 300);
    assert('Case D2 (dangling creditCardId): no crash, and creditCards array remains empty, not mutated into anything', result2.creditCards.length === 0);

    // D3: a to.liabilityId that doesn't resolve to anything at all — the
    // pre-existing, unmodified safe-no-op behaviour.
    const data3 = withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }] });
    const result3 = transferFundsTransition(data3, 'cash1', { kind: 'liability', liabilityId: 'does-not-exist' }, 200);
    assert('Case D3 (unresolvable liabilityId): still debits the source (existing contract, unchanged)', result3.assets.find((a) => a.id === 'cash1')!.currentValue === 800);
    assert('Case D3 (unresolvable liabilityId): no crash; liabilities/creditCards arrays unchanged', result3.liabilities.length === 0 && result3.creditCards.length === 0);
  }

  // Restart preserves agreement — JSON round-trip (the real persistence
  // format) after Case A, still agrees.
  {
    const entities = cardAndLiability(500, 500);
    const data = withEntities(baseData(), { assets: [{ id: 'cash1', type: 'cash', label: 'Cash', currentValue: 1000 }], ...entities });
    const result = transferFundsTransition(data, 'cash1', { kind: 'liability', liabilityId: 'liab1' }, 200);
    const restored: AppData = JSON.parse(JSON.stringify(result));
    assert('Restart (JSON round-trip): liability and card still agree exactly ($300 each)', restored.liabilities.find((l) => l.id === 'liab1')!.currentBalance === restored.creditCards.find((c) => c.id === 'card1')!.currentBalance);
  }
}

// ============================================================================
// Section 3 — Structural: single-persist-call wiring, unchanged contract
// ============================================================================
console.log('\n=== Section 3: transferFunds wrapper — structural wiring (single persist call) ===');
{
  assert(
    'transferFunds (the useCallback wrapper) is a thin call to the real, pure transferFundsTransition, passed straight to persist() — one atomic write, not two separate writes that could partially apply',
    /const transferFunds = useCallback\(\s*\n\s*\(fromAssetId: string, to: TransferTarget, amount: number\) => \{\s*\n\s*persist\(transferFundsTransition\(data, fromAssetId, to, amount\)\);\s*\n\s*\},\s*\n\s*\[data, persist\]\s*\n\s*\);/.test(
      APP_STATE_SRC
    )
  );
  assert(
    'transferFundsTransition itself is exported and pure (data in, AppData out) — genuinely real-importable, not trapped inside the hook',
    /export function transferFundsTransition\(data: AppData, fromAssetId: string, to: TransferTarget, amount: number\): AppData \{/.test(APP_STATE_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
