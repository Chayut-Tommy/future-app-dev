// Nolie Design 5.1 Wave 9a — Cards and Calculators: presentation migration,
// approved copy corrections, and engine invariance.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (real import): calculatorInputPresentation.ts, the four
//   calculator/card engines (compoundCalculator, homeLoanCalculator,
//   emergencyFund, savingsCoach, creditHealth), repaymentAccounting.ts and
//   dockVisibility.ts are pure (or RN-free enough) and execute for real.
//   The engine-fixture table below was CAPTURED FROM THE ENGINES BEFORE the
//   Wave 9a presentation change and is asserted with exact equality (===)
//   — any drift in outcome or rounding fails.
// - Class C (structural): copy presence/absence, legacy-typography and
//   legacy-colour-token absence, emoji absence, and import wiring on the
//   five Wave 9a screens.
// - NOT proven here: that any of it renders. See
//   tests/rendered/design5-wave9a-calculators.render.test.tsx and
//   tests/rendered/design5-wave9a-cards.render.test.tsx.
//
// Run with: npx tsx tests/design5-wave9a-cards-calculators.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  classifyMoneyInput,
  classifyNumberInput,
  combineCalculatorFields,
  describeNumberInput,
  calculatorGuidance,
} from '../src/lib/calculations/calculatorInputPresentation';
import { computeCompoundGrowth, ContributionFrequency } from '../src/lib/calculations/compoundCalculator';
import { computeHomeLoanRepayment, RepaymentFrequency } from '../src/lib/calculations/homeLoanCalculator';
import { computeEmergencyFund } from '../src/lib/calculations/emergencyFund';
import { rankSavingsOptions, computePotentialImprovement } from '../src/lib/calculations/savingsCoach';
import {
  computeCreditAggregate,
  computeBasicCreditHealthScore,
  resolveExpectedMonthlyRepayment,
  utilisationStatus,
} from '../src/lib/calculations/creditHealth';
import { resolveTransactionAggregateSpendingAmount, resolveTransactionCashflowAmount } from '../src/lib/calculations/repaymentAccounting';
import { isDockVisible, DockRoute } from '../src/navigation/dockVisibility';
import { createEmptyAppData } from '../src/lib/storage';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREENS = {
  cards: 'src/screens/cards/CardsScreen.tsx',
  savings: 'src/screens/discover/SavingsComparisonScreen.tsx',
  compound: 'src/screens/discover/CompoundCalculatorScreen.tsx',
  emergency: 'src/screens/discover/EmergencyFundScreen.tsx',
  homeloan: 'src/screens/discover/HomeLoanCalculatorScreen.tsx',
} as const;
const KIT = 'src/components/discover/calculator/CalculatorSurfaces.tsx';
const NINE_A_FILES = [...Object.values(SCREENS), KIT, 'src/lib/calculations/calculatorInputPresentation.ts'];

const SRC = Object.fromEntries(Object.entries(SCREENS).map(([k, p]) => [k, read(p)])) as Record<keyof typeof SCREENS, string>;
const STRIPPED = Object.fromEntries(Object.entries(SRC).map(([k, s]) => [k, strip(s)])) as Record<keyof typeof SCREENS, string>;

console.log('=== 1. Input classification (Class A — real imports) ===');
{
  // Empty
  assert('1a. empty money input classifies empty, never zero', classifyMoneyInput('').status === 'empty');
  assert('1b. whitespace-only money input classifies empty', classifyMoneyInput('   ').status === 'empty');
  assert('1c. empty number input classifies empty', classifyNumberInput('').status === 'empty');
  // Malformed
  assert('1d. "12abc" money input is invalid (no silent parseFloat prefix)', classifyMoneyInput('12abc').status === 'invalid');
  assert('1e. "1.2.3" money input is invalid', classifyMoneyInput('1.2.3').status === 'invalid');
  assert('1f. "120.123" money input is invalid (cents cap comes from the shared grammar)', classifyMoneyInput('120.123').status === 'invalid');
  assert('1g. "1e3" number input is invalid (no scientific notation)', classifyNumberInput('1e3').status === 'invalid');
  assert('1h. "-5" number input is invalid (no sign branch)', classifyNumberInput('-5').status === 'invalid');
  assert('1i. "5,5" number input is invalid', classifyNumberInput('5,5').status === 'invalid');
  // Non-finite
  assert('1j. "Infinity" money input is invalid', classifyMoneyInput('Infinity').status === 'invalid');
  assert('1k. "NaN" number input is invalid', classifyNumberInput('NaN').status === 'invalid');
  // Boundary and valid-zero
  assert('1l. "0" money input without allowZero is invalid', classifyMoneyInput('0').status === 'invalid');
  assert('1m. "0" money input with allowZero is a VALID zero', (() => { const s = classifyMoneyInput('0', { allowZero: true }); return s.status === 'valid' && s.value === 0; })());
  assert('1n. "0" number input without allowZero is invalid (a 0-year term has no estimate)', classifyNumberInput('0').status === 'invalid');
  assert('1o. "0" number input with allowZero is a VALID zero (a 0% rate is a real scenario)', (() => { const s = classifyNumberInput('0', { allowZero: true }); return s.status === 'valid' && s.value === 0; })());
  assert('1p. ".50" money input is valid 0.5', (() => { const s = classifyMoneyInput('.50'); return s.status === 'valid' && s.value === 0.5; })());
  // Normal and large
  assert('1q. "600000" money input is valid 600000', (() => { const s = classifyMoneyInput('600000'); return s.status === 'valid' && s.value === 600000; })());
  assert('1r. "5.125" number input is valid 5.125 (rates keep precision the cents cap would reject)', (() => { const s = classifyNumberInput('5.125'); return s.status === 'valid' && s.value === 5.125; })());
  assert('1s. "2500000" money input is valid (large)', (() => { const s = classifyMoneyInput('2500000'); return s.status === 'valid' && s.value === 2500000; })());
  // Combination + guidance
  assert('1t. any invalid field wins over any empty field', combineCalculatorFields([{ status: 'empty' }, { status: 'invalid' }]) === 'invalid');
  assert('1u. any empty field blocks readiness', combineCalculatorFields([{ status: 'valid', value: 1 }, { status: 'empty' }]) === 'incomplete');
  assert('1v. all-valid is ready', combineCalculatorFields([{ status: 'valid', value: 1 }, { status: 'valid', value: 0 }]) === 'ready');
  assert('1w. ready state produces NO guidance line', calculatorGuidance('ready') === null);
  assert('1x. incomplete guidance asks to fill, not an error', calculatorGuidance('incomplete') === 'Fill in the fields above to see an estimate.');
  assert('1y. invalid guidance points at the fields', (calculatorGuidance('invalid') ?? '').includes('Check the highlighted fields'));
  assert('1z. blur message is silent for a valid value', describeNumberInput({ raw: '5.5', allowZero: true, required: true, unit: 'rate' }) === null);
  assert('1aa. blur message is silent for an empty optional field', describeNumberInput({ raw: '', unit: 'rate' }) === null);
  assert('1ab. blur message names an empty required field', describeNumberInput({ raw: '', required: true, unit: 'rate' }) === 'Enter a rate.');
  assert('1ac. blur message explains a zero where zero is not allowed', (describeNumberInput({ raw: '0', required: true, unit: 'number of years' }) ?? '').includes('greater than zero'));
}

console.log('=== 2. Engine fixtures — byte-identical outcomes (Class A) ===');
{
  // CAPTURED before the Wave 9a presentation change (see the Wave 9a
  // report §8). Asserted with exact equality: same engine, same input,
  // same double, same rounding.
  const compoundFixtures: { input: { initial: number; contribution: number; frequency: ContributionFrequency; annualRatePct: number; years: number }; fv: number; contributed: number; growth: number }[] = [
    { input: { initial: 0, contribution: 10, frequency: 'weekly', annualRatePct: 5, years: 10 }, fv: 6742.582547117058, contributed: 5200, growth: 1542.5825471170583 },
    { input: { initial: 1000, contribution: 50, frequency: 'monthly', annualRatePct: 0, years: 5 }, fv: 4000, contributed: 4000, growth: 0 },
    { input: { initial: 1000, contribution: 50, frequency: 'monthly', annualRatePct: 5, years: 0 }, fv: 1000, contributed: 1000, growth: 0 },
    { input: { initial: 0, contribution: 0, frequency: 'monthly', annualRatePct: 0, years: 1 }, fv: 0, contributed: 0, growth: 0 },
    { input: { initial: 2500, contribution: 125, frequency: 'fortnightly', annualRatePct: 4.35, years: 7 }, fv: 29956.96232042742, contributed: 25250, growth: 4706.962320427421 },
    { input: { initial: 1000000, contribution: 5000, frequency: 'monthly', annualRatePct: 8, years: 40 }, fv: 41728424.69930172, contributed: 3400000, growth: 38328424.69930172 },
  ];
  for (const f of compoundFixtures) {
    const r = computeCompoundGrowth(f.input);
    assert(`2a. compound ${JSON.stringify(f.input)} → exact captured outcome`, r.futureValue === f.fv && r.totalContributed === f.contributed && r.totalGrowth === f.growth);
  }

  const loanFixtures: { input: { loanAmount: number; annualRatePct: number; years: number; frequency: RepaymentFrequency }; per: number; interest: number; cost: number }[] = [
    { input: { loanAmount: 600000, annualRatePct: 6, years: 30, frequency: 'monthly' }, per: 3597.3031509165417, interest: 695029.1343299551, cost: 1295029.134329955 },
    { input: { loanAmount: 500000, annualRatePct: 0, years: 25, frequency: 'monthly' }, per: 1666.6666666666667, interest: 0, cost: 500000 },
    { input: { loanAmount: 750000, annualRatePct: 5.89, years: 30, frequency: 'weekly' }, per: 1024.7711710817346, interest: 848643.026887506, cost: 1598643.026887506 },
    { input: { loanAmount: 480000, annualRatePct: 6.24, years: 25, frequency: 'fortnightly' }, per: 1459.2053030713341, interest: 468483.4469963672, cost: 948483.4469963672 },
    { input: { loanAmount: 2500000, annualRatePct: 7.5, years: 30, frequency: 'monthly' }, per: 17480.36271381941, interest: 3792930.576974987, cost: 6292930.576974987 },
  ];
  for (const f of loanFixtures) {
    const r = computeHomeLoanRepayment(f.input);
    assert(`2b. home loan ${JSON.stringify(f.input)} → exact captured outcome`, r.repaymentPerPeriod === f.per && r.totalInterest === f.interest && r.totalCost === f.cost);
  }
  // The 0-year fixture the OLD screen used to render as a "repayment":
  // the engine still computes it identically (protected), and the SCREEN
  // now refuses to present it (years must be positive) — see §5.
  {
    const r = computeHomeLoanRepayment({ loanAmount: 500000, annualRatePct: 6, years: 0, frequency: 'monthly' });
    assert('2c. 0-year loan engine outcome unchanged (protected), presentation-refused', r.repaymentPerPeriod === 500000 && r.totalCost === 0);
  }

  // Emergency fund — AppData-driven fixtures.
  {
    const empty = computeEmergencyFund(createEmptyAppData());
    assert('2d. emergency fund with nothing logged → months is null (no fabricated 0)', empty.monthlyExpenses === 0 && empty.monthsCovered === null);

    const d = createEmptyAppData();
    d.recurringItems.push({ id: 'r1', type: 'expense', label: 'Rent', amount: 1800, frequency: 'monthly', nextDueDate: new Date(2026, 8, 3).toISOString(), isFixed: true, active: true } as never);
    d.assets.push({ id: 'a1', type: 'cash', label: 'Cash', currentValue: 5400 } as never);
    const r = computeEmergencyFund(d);
    assert('2e. emergency fund 1800/mo expenses, $5,400 cash → exactly 3.0 months, guideline 5400-10800', r.monthlyExpenses === 1800 && r.recommendedMin === 5400 && r.recommendedMax === 10800 && r.monthsCovered === 3);

    const neg = createEmptyAppData();
    neg.recurringItems.push({ id: 'r1', type: 'expense', label: 'Rent', amount: 1000, frequency: 'monthly', nextDueDate: new Date(2026, 8, 3).toISOString(), isFixed: true, active: true } as never);
    neg.assets.push({ id: 'a1', type: 'cash', label: 'Cash', currentValue: -50 } as never);
    const rn = computeEmergencyFund(neg);
    assert('2f. negative cash floors at 0 — a genuine valid zero, months 0', rn.currentCash === 0 && rn.monthsCovered === 0);
  }

  // Savings comparison ranking.
  {
    const d = createEmptyAppData();
    d.assets.push({ id: 'sav', type: 'savings', label: 'My Saver', currentValue: 20000, interestRate: 0.04 } as never);
    d.savingsComparisons.push(
      { id: 'c1', bankName: 'Bank A', rate: 0.055, createdAt: new Date(2026, 0, 1).toISOString() } as never,
      { id: 'c2', bankName: 'Bank B', rate: 0.031, createdAt: new Date(2026, 0, 2).toISOString() } as never
    );
    const ranked = rankSavingsOptions(d.assets, d.savingsComparisons);
    assert('2g. savings ranking order and interest unchanged', ranked.length === 3 && ranked[0].id === 'c1' && ranked[0].annualInterest === 1100 && ranked[1].id === 'current' && ranked[1].annualInterest === 800 && ranked[2].annualInterest === 620);
    assert('2h. potential improvement exactly 300', computePotentialImprovement(ranked) === 300);
    assert('2i. inline interest arithmetic unchanged: 20000 × 4.85% = 969.9999999999999 (rounds to $970)', 20000 * (4.85 / 100) === 969.9999999999999 && Math.round(20000 * (4.85 / 100)) === 970);
  }

  // Cards aggregates and utilisation.
  {
    const card = { id: 'k1', label: 'Everyday card', creditLimit: 10000, currentBalance: 1150, dueDay: 28, minimumPayment: 80, apr: 0.2099, expectedMonthlyRepayment: 300 };
    const agg = computeCreditAggregate([card] as never);
    assert('2j. credit aggregate unchanged: 10000 limit / 1150 used / 0.115 utilisation / 8850 available', agg.totalLimit === 10000 && agg.totalUsed === 1150 && agg.utilisation === 0.115 && agg.availableCredit === 8850);
    assert('2k. displayed utilisation value unchanged: Math.round(0.115 × 100) = 12', Math.round(agg.utilisation * 100) === 12);
    assert('2l. utilisation status labels unchanged (Healthy / Getting high / High utilisation)', utilisationStatus(0.115).label === 'Healthy' && utilisationStatus(0.45).label === 'Getting high' && utilisationStatus(0.8).label === 'High utilisation');
    assert('2m. expected repayment resolver unchanged (plan 300, fallback to minimum 80)', resolveExpectedMonthlyRepayment(card as never) === 300 && resolveExpectedMonthlyRepayment({ ...card, expectedMonthlyRepayment: undefined } as never) === 80);
    assert('2n. the basic credit-health score still COMPUTES (engine protected) — it is merely no longer presented', computeBasicCreditHealthScore([card] as never) === 87);
  }

  // Repayment accounting — the invariants Cards' repayment flow depends on.
  {
    const d = createEmptyAppData();
    const repayment = { id: 't1', type: 'expense', amount: 250, date: new Date(2026, 7, 20).toISOString(), isRepayment: true } as never;
    const ordinary = { id: 't2', type: 'expense', amount: 250, date: new Date(2026, 7, 20).toISOString() } as never;
    assert('2o. a card repayment is still excluded from ordinary spending ($0 aggregate)', resolveTransactionAggregateSpendingAmount(d, repayment) === 0);
    assert('2p. a card repayment is still excluded from cashflow ($0)', resolveTransactionCashflowAmount(d, repayment) === 0);
    assert('2q. an ordinary expense still counts in full', resolveTransactionAggregateSpendingAmount(d, ordinary) === 250);
  }
}

console.log('=== 3. Approved copy corrections (Class C) ===');
{
  // Comment-stripped: a comment may NAME the removed string (the Cards
  // header documents the removal); applied code may not carry it.
  const allScreensStripped = Object.values(STRIPPED).join('\n');
  assert('3a. "Credit health" is absent from every Wave 9a screen', !/Credit health/.test(allScreensStripped));
  assert('3b. no substitute score is presented: "/100" absent from CardsScreen', !/\/100/.test(strip(SRC.cards)));
  assert('3c. no grade/eligibility/approval language on Cards', !/creditworthiness|approval likelihood|eligib|good credit|bad credit/i.test(strip(SRC.cards)));
  assert('3d. factual utilisation present: "% of limit used"', SRC.cards.includes('% of limit used'));
  assert('3e. computeBasicCreditHealthScore no longer consumed by any screen or component', (() => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const consumers = [...walk('src/screens'), ...walk('src/components')].filter((f) => read(f).includes('computeBasicCreditHealthScore'));
    return consumers.length === 0;
  })());
  assert('3f. "Can I buy a home?" absent from the entire src tree (code, not prose)', (() => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    return walk('src').every((f) => !strip(read(f)).includes('Can I buy a home?'));
  })());
  assert('3g. Home loan screen title is "Home loan repayments"', SRC.homeloan.includes('title="Home loan repayments"'));
  assert('3h. no affordability/borrowing-capacity/approval language on Home loan', !/afford|borrowing capacity|lender approval|eligib|pre-approv/i.test(strip(SRC.homeloan)));
  assert('3i. "Recommended (3-6 months)" absent from Emergency Fund', !strip(SRC.emergency).includes('Recommended (3-6 months)'));
  assert('3j. "A common guideline is 3–6 months" present (en dash)', SRC.emergency.includes('A common guideline is 3–6 months'));
  assert('3k. Emergency Fund never says the customer personally should hold an amount', !/you should hold|you need to hold|you must save/i.test(strip(SRC.emergency)));
  assert('3l. Savings Comparison states the rates are customer-entered', SRC.savings.includes('rates you enter yourself') && SRC.savings.includes("doesn't have live bank rates"));
  assert('3m. Savings Comparison implies no live rates/connectivity/recommendation', !/live rates from|connected to your bank|we recommend|best product for you/i.test(strip(SRC.savings)));
  assert('3n. Compound screen title is the approved customer-visible "Compound growth"', SRC.compound.includes('title="Compound growth"'));
  assert('3o. Compound does not promise or guarantee returns', !/guaranteed|will grow|promise/i.test(strip(SRC.compound).replace(/not a guarantee of real returns/g, '')));
}

console.log('=== 4. Typography and colour migration on Wave 9a files (Class C) ===');
{
  for (const [name, rel] of Object.entries({ ...SCREENS, kit: KIT })) {
    const src = strip(read(rel));
    assert(`4a. ${name}: zero legacy typography.* consumers`, !/typography\.(title|heading|body|caption|micro)/.test(src) && !/\.\.\.typography\./.test(src));
    assert(`4b. ${name}: zero legacy colour-token consumers (colors.*)`, !/[^a-zA-Z]colors\./.test(src));
    assert(`4c. ${name}: semantic roles or type roles are the vocabulary`, /semantic\.|typeStyle\(/.test(src) || name === 'compound' || name === 'homeloan');
    assert(`4d. ${name}: no emoji in customer-facing source`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u.test(src));
    assert(`4e. ${name}: no unsupported font weight (only 400/500/600/700)`, (src.match(/fontWeight:\s*'(\d+)'/g) ?? []).every((m) => ['400', '500', '600', '700'].includes(m.match(/\d+/)![0])));
  }
  assert('4f. medals emoji removed from Savings Comparison specifically', !/🥇|🥈|🥉|MEDALS/.test(SRC.savings));
  assert('4g. the calculator kit resolves text through typeStyle roles', read(KIT).includes("typeStyle('") && read(KIT).includes('figureLarge') && read(KIT).includes('eyebrow'));
  assert('4h. weight overrides always declare the matching family (fontFamilyForWeight)', (() => {
    for (const rel of [...Object.values(SCREENS), KIT]) {
      const src = strip(read(rel));
      const overrides = src.match(/fontWeight:\s*'\d+'/g) ?? [];
      if (overrides.length > 0 && !src.includes('fontFamilyForWeight')) return false;
    }
    return true;
  })());
}

console.log('=== 5. No fabricated zeros (Class C structural + Class A) ===');
{
  assert('5a. Compound screen has zero parseFloat consumers', !strip(SRC.compound).includes('parseFloat'));
  assert('5b. Home loan screen has zero parseFloat consumers', !strip(SRC.homeloan).includes('parseFloat'));
  assert('5c. Savings inline calculator classifies instead of parseFloat (the preserved sheet validator is the only parseFloat left)', (() => {
    const src = strip(SRC.savings);
    const count = (src.match(/parseFloat/g) ?? []).length;
    // handleSave + the Save button's disabled contract — the pre-existing,
    // preserved validation contract for the add/edit sheet. Nothing else.
    return count === 2 && !/parseFloat\(calc/.test(src);
  })());
  assert('5d. every calculator derives result state from structured classification', ['compound', 'homeloan'].every((k) => STRIPPED[k as 'compound'].includes('classifyMoneyInput') && STRIPPED[k as 'compound'].includes('combineCalculatorFields')) && STRIPPED.savings.includes('classifyMoneyInput'));
  assert('5e. no screen parses a formatted money string back into state', Object.values(STRIPPED).every((s) => !/parse[^(]*\(\s*format|replace\(\s*\/\\\$\//.test(s)));
  assert('5f. Emergency Fund still gates on the engine\'s own hasExpenseData/valid-zero rules', STRIPPED.emergency.includes('monthlyExpenses > 0') && STRIPPED.emergency.includes('monthsCovered === null'));
}

console.log('=== 6. Field system and hierarchy wiring (Class C) ===');
{
  assert('6a. calculators take input through the accepted shared field system', ['compound', 'homeloan'].every((k) => STRIPPED[k as 'compound'].includes('CurrencyField') && STRIPPED[k as 'compound'].includes('TextField')) && STRIPPED.savings.includes('CurrencyField'));
  assert('6b. inputs precede the result surface in source order (inputs lead)', (() => {
    for (const k of ['compound', 'homeloan'] as const) {
      const s = STRIPPED[k];
      const inputs = s.indexOf('<CalculatorSection title="Your numbers"');
      const result = s.indexOf('<CalculatorResult');
      if (inputs === -1 || result === -1 || inputs > result) return false;
    }
    return true;
  })());
  assert('6c. exactly one result surface per calculator', ['compound', 'homeloan'].every((k) => (STRIPPED[k as 'compound'].match(/<CalculatorResult/g) ?? []).length === 1));
  assert('6d. result renders only when ready, guidance otherwise', ['compound', 'homeloan'].every((k) => /\{result \? \(/.test(STRIPPED[k as 'compound']) && /CalculatorGuidance/.test(STRIPPED[k as 'compound'])));
  assert('6e. the disclaimer closes the hierarchy', ['compound', 'homeloan', 'emergency'].every((k) => { const s = STRIPPED[k as 'compound']; return s.lastIndexOf('CalculatorDisclaimer') > s.lastIndexOf('CalculatorResult'); }));
  assert('6f. the kit owns no formula: no engine import in CalculatorSurfaces', !/compoundCalculator|homeLoanCalculator|emergencyFund|savingsCoach/.test(read(KIT)));
  assert('6g. the kit duplicates no validator: no parse/classify logic inside', !/parseFloat|parseMoneyInput|classify(Money|Number)Input/.test(strip(read(KIT))));
  assert('6h. cadence selection preserved (FrequencyChips with the same three options)', ['compound', 'homeloan'].every((k) => STRIPPED[k as 'compound'].includes('FrequencyChips') && STRIPPED[k as 'compound'].includes("'weekly'") && STRIPPED[k as 'compound'].includes("'fortnightly'") && STRIPPED[k as 'compound'].includes("'monthly'")));
  assert('6i. Compound preserves the Saving Facts prefill contract (route params)', STRIPPED.compound.includes('params.initial') && STRIPPED.compound.includes('params.frequency') && STRIPPED.compound.includes('params.annualRatePct'));
  assert('6j. Cards preserves its detail/edit route (AddCreditCardModal wiring intact)', STRIPPED.cards.includes('AddCreditCardModal') && STRIPPED.cards.includes('editCard={editCard}'));
  assert('6k. Cards financial rows declare the 56pt floor', SRC.cards.includes('minHeight: 56'));
  assert('6l. breakdown rows in the kit declare the 56pt floor', read(KIT).includes('minHeight: 56'));
}

console.log('=== 7. Tone discipline (Class C) ===');
{
  assert('7a. Cards maps the success tone to the NEUTRAL treatment (no mint for low utilisation)', /case 'success':\s*\n\s*case 'neutral':/.test(SRC.cards));
  assert('7b. caution and urgent states carry an icon, never colour alone', STRIPPED.cards.includes("icon: 'alert-circle-outline'") && STRIPPED.cards.includes("icon: 'alert-circle'"));
  assert('7c. ordinary state carries no alarm icon', STRIPPED.cards.includes('icon: null'));
  assert('7d. utilisation bars use interactive/warningAccent, never success green', STRIPPED.cards.includes('semantic.interactive') && STRIPPED.cards.includes('semantic.warningAccent') && !STRIPPED.cards.includes('semantic.success'));
}

console.log('=== 8. Shell classification unchanged (Class A — real imports) ===');
{
  const calculators: DockRoute[] = ['CompoundCalculator', 'HomeLoanCalculator', 'SavingsComparison', 'EmergencyFund'];
  assert('8a. every calculator remains dock-hidden', calculators.every((r) => !isDockVisible({ route: r, keyboardVisible: false, overlay: 'none' })));
  assert('8b. Cards remains dock-visible (its accepted owner-tab behaviour)', isDockVisible({ route: 'Cards', keyboardVisible: false, overlay: 'none' }));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
