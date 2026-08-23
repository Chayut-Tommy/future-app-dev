// Nolie Design 5.1 Wave 9a closure — credit-card compliance and interest
// disclosure (Corrections A, B and C).
//
// WHY THIS SUITE EXISTS. Three compliance problems shared one shape: the
// same claim was authored independently on more than one surface.
//   A. "Add your card so Nolie can help you: Reduce interest / Improve
//      credit utilisation / Create a payoff plan / Avoid missed payments"
//      appeared in BOTH AddCreditCardModal and the Cards empty state.
//   B. Utilisation was labelled "Healthy" / "Getting high" — a claim about
//      the customer's standing, not a fact about the recorded number; and
//      the debt overview offered "real payoff scenarios".
//   C. Interest illustrations did not distinguish the 19.5% ASSUMPTION from
//      a rate the customer recorded — and a recorded 0% was silently
//      replaced by 19.5%.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): §3–§6 run the real creditHealth engine and the
//   real creditCardPresentation module.
// - Class C (structural): §1, §2 and §7 read the real source files.
//
// Paths resolve from THIS worktree. Run with:
//   ./node_modules/.bin/tsx tests/design5-wave9a-card-compliance.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import {
  ASSUMED_CREDIT_CARD_APR,
  isRecordedAnnualRate,
  effectiveApr,
  utilisationStatus,
  computeCreditCardInterestEstimate,
  creditCardLiabilityInsight,
} from '../src/lib/calculations/creditHealth';
import {
  CARD_DETAILS_PANEL,
  OUTCOME_PROMISE_TERMS,
  DEBT_SCENARIO_PROMPT,
  PURCHASE_RATE_FIELD,
  purchaseRateBlankHelper,
  ISSUER_TERMS_QUALIFICATION,
  ISSUER_TERMS_SHORT,
  UTILISATION_BAND_LABEL,
  utilisationBand,
  utilisationPresentation,
  resolveInterestRate,
  formatAnnualRate,
  compactInterestIllustration,
  detailedInterestIllustration,
} from '../src/lib/creditCardPresentation';
import { composeCardReminderFacts, cardReminderRateProvenance, CARD_REMINDER_CAUTION } from '../src/lib/reminderPresentation';
import { CreditCard } from '../src/types/models';

const REPO_ROOT = path.resolve(__dirname, '..');
const srcPath = (rel: string) => path.join(REPO_ROOT, rel);
const read = (rel: string) => readFileSync(srcPath(rel), 'utf-8');

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

/** Every customer-facing credit-card surface. */
const CARD_SURFACES: readonly string[] = [
  'src/components/credit/AddCreditCardModal.tsx',
  'src/screens/cards/CardsScreen.tsx',
  'src/components/debt/DebtCoachSheet.tsx',
  'src/components/today/SmartReminderCard.tsx',
  'src/screens/wealth/WealthScreen.tsx',
  'src/lib/reminderPresentation.ts',
  'src/lib/creditCardPresentation.ts',
];

/** Rendered copy only — comments are stripped so a doc comment describing
 * the OLD wording can never fail a ban, and can never satisfy a
 * requirement either. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

console.log('=== 1. Correction A — the four outcome promises are gone everywhere ===');
{
  const BANNED = ['Reduce interest', 'Improve credit utilisation', 'Create a payoff plan', 'Avoid missed payments'];
  for (const rel of CARD_SURFACES) {
    const c = code(read(rel));
    for (const b of BANNED) {
      assert(`1a. ${rel.split('/').pop()} no longer says "${b}"`, !c.includes(b));
    }
  }
  // The "can help you" framing itself, and the empty state's prose variant.
  for (const rel of CARD_SURFACES) {
    // creditCardPresentation.ts DECLARES the banned-term list; it renders
    // nothing, so sweeping it for its own list is meaningless.
    if (rel.endsWith('creditCardPresentation.ts')) continue;
    const c = code(read(rel));
    assert(`1b. ${rel.split('/').pop()} makes no "can help you" promise`, !/can help you/i.test(c));
    assert(`1c. ${rel.split('/').pop()} has no benefit checkmarks`, !c.includes('✓'));
  }
  // Sweep the shared banned-term list across every surface's rendered copy.
  for (const rel of CARD_SURFACES) {
    const c = code(read(rel)).toLowerCase();
    for (const term of OUTCOME_PROMISE_TERMS) {
      // The list itself lives in creditCardPresentation.ts, so skip that file
      // for the sweep — it declares the terms, it does not display them.
      if (rel.endsWith('creditCardPresentation.ts')) continue;
      assert(`1d. ${rel.split('/').pop()} does not display "${term}"`, !c.includes(term));
    }
  }
}

console.log('\n=== 2. Correction A — one shared factual panel, no drift ===');
{
  assert('2a. title is exactly the approved copy', CARD_DETAILS_PANEL.title === 'Keep your card details together');
  assert(
    '2b. body is exactly the approved copy',
    CARD_DETAILS_PANEL.body ===
      'Record your balance, limit, due date, expected repayment and optional annual purchase rate. Nolie uses what you record to show reminders and illustrative estimates.'
  );
  assert('2c. it promises no outcome', !/help|reduce|improve|avoid|plan|optimi/i.test(CARD_DETAILS_PANEL.body.replace('repayment', '')));
  assert(
    '2d. it never claims Nolie moves money, contacts the issuer or guarantees a reminder',
    !/\btransfers?\b|\bpays\b|\bcontacts?\b|\bissuer\b|\bguarantee/i.test(CARD_DETAILS_PANEL.body)
  );
  // Both entry points consume the SAME constant — the drift guard.
  const add = read('src/components/credit/AddCreditCardModal.tsx');
  const cards = read('src/screens/cards/CardsScreen.tsx');
  assert('2e. the Add form renders the shared constant', add.includes('CARD_DETAILS_PANEL.title') && add.includes('CARD_DETAILS_PANEL.body'));
  assert('2f. the Cards empty state renders the shared constant', cards.includes('CARD_DETAILS_PANEL.body'));
  assert('2g. neither hard-codes the panel copy', !code(add).includes('Keep your card details together') && !code(cards).includes('Keep your card details together'));
}

console.log('\n=== 3. Correction B — factual utilisation labels, unchanged thresholds ===');
{
  assert('3a. "real payoff scenarios" is gone', !code(read('src/components/debt/DebtCoachSheet.tsx')).includes('real payoff scenarios'));
  assert('3b. replaced by the approved illustrative prompt', DEBT_SCENARIO_PROMPT === 'Add an annual rate and expected repayment to view an illustrative scenario based on what you recorded.');
  assert('3c. the sheet renders it from the shared constant', read('src/components/debt/DebtCoachSheet.tsx').includes('DEBT_SCENARIO_PROMPT'));
  assert('3d. and the qualification stays visible beside it', read('src/components/debt/DebtCoachSheet.tsx').includes('Interest, fees, repayment rules and your circumstances may change the result.'));

  // Labels.
  assert('3e. low band label', UTILISATION_BAND_LABEL.low === 'Low utilisation');
  assert('3f. moderate band label', UTILISATION_BAND_LABEL.moderate === 'Moderate utilisation');
  assert('3g. high band label retained', UTILISATION_BAND_LABEL.high === 'High utilisation');
  assert('3h. "Healthy" is no longer a customer-facing label', Object.values(UTILISATION_BAND_LABEL).every((l) => l !== 'Healthy'));
  assert('3i. "Getting high" is no longer a customer-facing label', Object.values(UTILISATION_BAND_LABEL).every((l) => l !== 'Getting high'));

  // THRESHOLDS AND TONES ARE UNCHANGED — derived from the protected engine.
  const probes: { u: number; band: 'low' | 'moderate' | 'high' }[] = [
    { u: 0, band: 'low' },
    { u: 0.0005, band: 'low' },
    { u: 0.2999, band: 'low' },
    { u: 0.3, band: 'moderate' },
    { u: 0.5, band: 'moderate' },
    { u: 0.6999, band: 'moderate' },
    { u: 0.7, band: 'high' },
    { u: 1.5, band: 'high' },
  ];
  for (const p of probes) {
    assert(`3j. utilisation ${p.u} → ${p.band}`, utilisationBand(p.u) === p.band);
    assert(`3k. …tone is the engine's own, unchanged`, utilisationPresentation(p.u).tone === utilisationStatus(p.u).tone);
  }
  assert('3l. the engine itself still returns its original labels (not edited)', utilisationStatus(0).label === 'Healthy' && utilisationStatus(0.5).label === 'Getting high');
  assert('3m. no customer surface renders the engine label directly', CARD_SURFACES.filter((r) => r.endsWith('.tsx')).every((r) => !code(read(r)).includes('utilisationStatus(')));
  // No credit-score / creditworthiness implication anywhere.
  for (const rel of CARD_SURFACES) {
    assert(`3n. ${rel.split('/').pop()} implies no credit score or approval`, !/credit score|creditworth|approval|pre-?approved/i.test(code(read(rel))));
  }
  assert('3o. "Credit health {n}/100" remains absent from rendered copy', !code(read('src/screens/cards/CardsScreen.tsx')).includes('Credit health'));
}

console.log('\n=== 4. Correction C — assumed / recorded / unavailable rate states ===');
{
  const A = ASSUMED_CREDIT_CARD_APR;
  assert('4a. the assumption is still 19.5%', A === 0.195);

  // recorded_rate — including 0%.
  assert('4b. recorded 20% is recorded', resolveInterestRate(0.2, A).source === 'recorded_rate');
  assert('4c. recorded 0% is RECORDED, never assumed', resolveInterestRate(0, A).source === 'recorded_rate');
  assert('4d. …and uses 0, not 19.5%', resolveInterestRate(0, A).rate === 0);
  // assumed_rate — genuinely absent only.
  assert('4e. undefined falls back to the assumption', resolveInterestRate(undefined, A).source === 'assumed_rate');
  assert('4f. null falls back to the assumption', resolveInterestRate(null, A).source === 'assumed_rate');
  assert('4g. …at exactly 19.5%', resolveInterestRate(undefined, A).rate === A);
  // unavailable — never fabricated.
  for (const bad of [NaN, Infinity, -Infinity, -0.05]) {
    assert(`4h. ${String(bad)} is unavailable, not silently assumed`, resolveInterestRate(bad, A).source === 'unavailable');
  }
  // Executable code only — both files' doc comments deliberately QUOTE the
  // retired patterns to explain what was corrected and why.
  assert('4i. no truthiness fallback exists in the resolver code', !/\|\|\s*(ASSUMED|0?\.195|19\.5)/.test(code(read('src/lib/creditCardPresentation.ts'))));
  assert('4j. nor a `> 0` rate test in the engine code', !/apr\s*>\s*0|annualRate\s*>\s*0/.test(code(read('src/lib/calculations/creditHealth.ts'))));

  // The engine's own predicate agrees.
  assert('4k. engine: 0 is a recorded rate', isRecordedAnnualRate(0));
  assert('4l. engine: undefined is not', !isRecordedAnnualRate(undefined));
  assert('4m. engine: NaN is not', !isRecordedAnnualRate(NaN));
  assert('4n. effectiveApr honours a recorded 0%', effectiveApr({ apr: 0 } as CreditCard).isAssumed === false && effectiveApr({ apr: 0 } as CreditCard).rate === 0);
  assert('4o. effectiveApr still assumes when absent', effectiveApr({} as CreditCard).isAssumed === true && effectiveApr({} as CreditCard).rate === A);
}

console.log('\n=== 5. Correction C — the accepted financial examples, unchanged formula ===');
{
  // balance * (rate/365) * cycleDays, cycleDays 30. Rounded only for display.
  const est = (balance: number, annualRate?: number) =>
    computeCreditCardInterestEstimate({ balance, annualRate, daysUntilDue: 2 });

  const a = est(500);
  assert('5a. $500, no rate → assumed 19.5%', a.isAssumedRate === true && a.rateUsed === 0.195);
  assert('5b. …≈ $8 over 30 days', Math.round(a.estimatedCycleInterest) === 8);

  const b = est(1000);
  assert('5c. $1,000, no rate → assumed 19.5%', b.isAssumedRate === true);
  assert('5d. …≈ $16 over 30 days', Math.round(b.estimatedCycleInterest) === 16);

  const c = est(1000, 0.2);
  assert('5e. $1,000, recorded 20% → NOT assumed', c.isAssumedRate === false && c.rateUsed === 0.2);
  assert('5f. …≈ $16 over 30 days', Math.round(c.estimatedCycleInterest) === 16);

  const d = est(1000, 0);
  assert('5g. recorded 0% → NOT assumed', d.isAssumedRate === false);
  assert('5h. …and the estimate is exactly $0', d.estimatedCycleInterest === 0 && d.dailyInterest === 0);

  for (const bad of [NaN, Infinity]) {
    const r = resolveInterestRate(bad, 0.195);
    assert(`5i. rate ${String(bad)} produces no illustration`, compactInterestIllustration({ amount: 10, resolved: r, cycleDays: 30 }) === null);
  }
  const invalidBalance = est(NaN);
  assert('5j. a non-finite balance yields a non-finite estimate, never a fabricated number', !Number.isFinite(invalidBalance.estimatedCycleInterest));
  assert('5k. …and no illustration is composed from it', detailedInterestIllustration({ amount: invalidBalance.estimatedCycleInterest, resolved: resolveInterestRate(0.2, 0.195), cycleDays: 30 }) === null);
}

console.log('\n=== 6. Correction C — compact and detailed wording agree ===');
{
  const A = ASSUMED_CREDIT_CARD_APR;
  assert('6a. rate formats without trailing zeros', formatAnnualRate(0.195) === '19.5%' && formatAnnualRate(0.2) === '20%' && formatAnnualRate(0) === '0%');

  const assumed = { amount: 16, resolved: resolveInterestRate(undefined, A), cycleDays: 30, dueLabel: 'Due in 2 days' };
  const recorded = { amount: 16, resolved: resolveInterestRate(0.2, A), cycleDays: 30, dueLabel: 'Due in 2 days' };

  const ca = compactInterestIllustration(assumed)!;
  const cr = compactInterestIllustration(recorded)!;
  assert('6b. compact assumed line 1', ca.amountLine === 'Due in 2 days · estimated ~$16 interest over 30 days if the recorded balance stayed unpaid');
  assert('6c. compact assumed line 2', ca.sourceLine === 'Using an assumed 19.5% p.a. · issuer terms may differ');
  assert('6d. compact recorded line 2', cr.sourceLine === 'Using your recorded 20% p.a. · issuer terms may differ');
  assert('6e. compact recorded 0%', compactInterestIllustration({ amount: 0, resolved: resolveInterestRate(0, A), cycleDays: 30 })!.sourceLine === 'Using your recorded 0% p.a. · issuer terms may differ');

  const da = detailedInterestIllustration(assumed)!;
  const dr = detailedInterestIllustration(recorded)!;
  assert('6f. detailed heading', da.heading === 'Illustrative interest over 30 days if the recorded balance stayed unpaid');
  assert('6g. detailed assumed source', da.sourceText === 'Uses an assumed annual rate of 19.5% because no rate is recorded.');
  assert('6h. detailed recorded source', dr.sourceText === 'Uses the 20% p.a. rate you recorded.');
  assert('6i. the qualification is the approved text', da.qualification === ISSUER_TERMS_QUALIFICATION);
  assert('6j. …and names what is excluded', /Interest-free periods, fees, cash-advance rates, compounding/.test(ISSUER_TERMS_QUALIFICATION));

  // Compact and detailed agree on amount and on rate source.
  assert('6k. both forms quote the same amount', ca.amountLine.includes('~$16') && da.amountText === '~$16');
  assert('6l. both forms agree the rate is assumed', ca.sourceLine.includes('assumed 19.5%') && da.sourceText.includes('assumed annual rate of 19.5%'));
  assert('6m. both forms agree the rate is recorded', cr.sourceLine.includes('recorded 20%') && dr.sourceText.includes('20% p.a. rate you recorded'));

  // Every estimate surface says estimated or illustrative.
  for (const line of [ca.amountLine, cr.amountLine, da.heading, dr.heading]) {
    assert(`6n. "${line.slice(0, 34)}…" is marked estimated/illustrative`, /estimated|illustrative/i.test(line));
  }
  // Never a penalty/charge/forecast/bill.
  for (const line of [ca.amountLine, ca.sourceLine, da.heading, da.sourceText, da.qualification]) {
    assert(`6o. "${line.slice(0, 28)}…" is not framed as a charge`, !/penalty|will be charged|forecast|your bill|you will pay/i.test(line));
  }

  // Accessibility: the assumption is NOT sight-only.
  assert('6p. the a11y label names the rate source', da.accessibilityLabel.includes('assumed annual rate of 19.5%'));
  assert('6q. the a11y label carries the issuer qualification', da.accessibilityLabel.includes(ISSUER_TERMS_QUALIFICATION));
  assert('6r. the recorded a11y label names the recorded rate', dr.accessibilityLabel.includes('20% p.a. rate you recorded'));
  assert('6s. the reminder composes an a11y label including both', read('src/components/today/SmartReminderCard.tsx').includes('estimateAccessibilityLabel'));
}

console.log('\n=== 7. Correction C — the shipped reminder and Wealth surfaces ===');
{
  // Reminder facts use the corrected wording.
  const facts = composeCardReminderFacts({ expectedMonthlyRepayment: 50, recordedBalance: 1000, estimatedCycleInterest: 16, cycleDays: 30 });
  const est = facts.find((f) => f.estimated)!;
  assert('7a. the reminder fact is labelled illustrative', est.label === 'Illustrative interest over 30 days if the recorded balance stayed unpaid');
  assert('7b. and shows the amount alone', est.value === '~$16');
  assert('7c. provenance names an assumed rate correctly', cardReminderRateProvenance(0.195, true) === 'Uses an assumed annual rate of 19.5% because no rate is recorded.');
  assert('7d. provenance names a recorded rate correctly', cardReminderRateProvenance(0.2, false) === 'Uses the 20% p.a. rate you recorded.');
  assert('7e. the caution is now the issuer qualification', CARD_REMINDER_CAUTION === ISSUER_TERMS_QUALIFICATION);
  assert('7f. behavioural coaching is gone', !/Paying more than the expected amount/.test(CARD_REMINDER_CAUTION));

  // Wealth compact row: two lines, second names the source.
  const card = (apr?: number): CreditCard => ({ id: 'c', issuer: 'AMEX', label: 'AMEX', creditLimit: 10000, currentBalance: 1000, dueDay: new Date().getDate() + 2, minimumPayment: 0, apr });
  const insightAssumed = creditCardLiabilityInsight(card(undefined));
  const insightRecorded = creditCardLiabilityInsight(card(0.2));
  assert('7g. Wealth row line 1 is an estimate over a window', (insightAssumed?.text ?? '').includes('estimated ~$') && (insightAssumed?.text ?? '').includes('if the recorded balance stayed unpaid'));
  assert('7h. Wealth row line 2 names the assumption', (insightAssumed?.sourceLine ?? '').startsWith('Using an assumed 19.5% p.a.'));
  assert('7i. Wealth row line 2 names a recorded rate', (insightRecorded?.sourceLine ?? '').startsWith('Using your recorded 20% p.a.'));
  assert('7j. both carry the short qualification', (insightAssumed?.sourceLine ?? '').includes(ISSUER_TERMS_SHORT));
  assert('7k. the bare "(est. rate)" suffix is retired', !code(read('src/screens/wealth/WealthScreen.tsx')).includes('(est. rate)'));
  assert('7l. Wealth renders the second line', read('src/screens/wealth/WealthScreen.tsx').includes('ccInsight.sourceLine'));

  // Rate field.
  assert('7m. the rate field is named for what it feeds', PURCHASE_RATE_FIELD.label === 'Purchase interest rate p.a. % (optional)');
  assert('7n. its helper points at the statement', PURCHASE_RATE_FIELD.helper === 'Use the annual purchase rate shown on your card statement. Other rates and card terms may differ.');
  assert('7o. the blank helper states the assumption plainly', purchaseRateBlankHelper(ASSUMED_CREDIT_CARD_APR) === 'Leave blank and Nolie will use an assumed 19.5% p.a. for illustrative estimates.');
  assert('7p. …and promises no better outcome', !/accuracy|better|closer|real/i.test(purchaseRateBlankHelper(ASSUMED_CREDIT_CARD_APR)));
  assert('7q. the form renders the shared field copy', read('src/components/credit/AddCreditCardModal.tsx').includes('PURCHASE_RATE_FIELD.label'));
  assert('7r. the old "Interest rate / APR" label is gone', !code(read('src/components/credit/AddCreditCardModal.tsx')).includes('Interest rate / APR'));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
