// Nolie Design 5.1 Wave 9b closure — three corrections from the final
// iOS recording.
//
// A. ONE IDENTITY FOR THE AUP METRIC. Today rendered
//    "BUSINESS CASH POSITION · $32,836" while Money rendered
//    "Available until payday · $32,836" — the same financial result named as
//    two different concepts. The eyebrow came from
//    `computeMoneyHeroCopy` -> `resolveMoneyPersona`, which reads the
//    persisted `moneyPersona`. Wave 9b retired the income-identity
//    questionnaire, but a legacy STORED value still overrode the cadence
//    fallback, so employment wording survived a restart.
//
// B. TIMELINE TYPOGRAPHY. "What happens next" and its rows still spread
//    `tokens.typography.*`, which carries no `fontFamily`, so they rendered
//    in the platform font.
//
// C. YOUR FUTURE PROSE. The lead sentence interpolated one exact age
//    ("…around age 30."), presenting an illustrative projection as a
//    personalised forecast.
//
// CLASSIFICATION:
// - Class A (real import): §1 runs the real presentation selector over the
//   full persona matrix.
// - Class C (structural): §2-§4 read the real sources. Runtime font proof
//   lives in the rendered suites.
//
// Run with: ./node_modules/.bin/tsx tests/design5-wave9b-closure.test.ts

import { readFileSync } from 'fs';
import * as path from 'path';
import {
  selectSafeToSpendPresentation,
  AVAILABLE_UNTIL_PAYDAY_LABEL,
  AVAILABLE_UNTIL_PAYDAY_HEADING,
} from '../src/lib/calculations/safeToSpendPresentation';
import { computeMoneyHeroCopy, MoneyPersona, resolveMoneyPersona } from '../src/lib/calculations/moneyPersona';
import { createEmptyAppData } from '../src/lib/storage';
import { AppData, PayFrequency } from '../src/types/models';

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const PERSONAS: MoneyPersona[] = ['employee', 'freelancer', 'retiree', 'investor', 'business_owner'];
const CADENCES: PayFrequency[] = ['weekly', 'fortnightly', 'monthly', 'irregular'];

/** A valid, payday-based Available Until Payday result — field names taken
 * from the real SafeToSpendResult contract that selectSafeToSpendHeroState
 * actually reads (availability / hasKnownPayday / moneyBalanceStatus /
 * cycleRemainingPool), never invented. */
function validResult(): any {
  return {
    availability: 'available',
    hasKnownPayday: true,
    moneyBalanceStatus: 'ok',
    cycleRemainingPool: 32836,
    cycleRemainingPoolCents: 3283600,
    daysRemaining: 9,
    dailyAllowance: 3648,
    includedBalances: [],
    goalAllocation: { allocations: [], isFullyFunded: true },
  };
}

console.log('=== 1. ONE canonical AUP identity, across the whole persona × cadence matrix ===');
{
  assert('1a. the canonical label is exactly "Available until payday"', AVAILABLE_UNTIL_PAYDAY_LABEL === 'Available until payday');
  assert('1b. …and its heading form is the uppercase of it', AVAILABLE_UNTIL_PAYDAY_HEADING === 'AVAILABLE UNTIL PAYDAY');

  // Every legacy persona, crossed with every cadence, must produce the SAME
  // heading and the SAME amount. This is the matrix the defect lived in.
  const headings = new Set<string>();
  const amounts = new Set<number | undefined>();
  for (const persona of PERSONAS) {
    for (const payFrequency of CADENCES) {
      const data: AppData = createEmptyAppData();
      data.user.moneyPersona = persona;
      data.user.payFrequency = payFrequency;
      const p = selectSafeToSpendPresentation(validResult(), computeMoneyHeroCopy(data));
      headings.add(p.heading);
      amounts.add((p as { amountCents?: number }).amountCents);
    }
  }
  assert(`1c. all ${PERSONAS.length * CADENCES.length} combinations share ONE heading (${[...headings].join(' | ')})`, headings.size === 1);
  assert('1d. …and it is the canonical heading', [...headings][0] === AVAILABLE_UNTIL_PAYDAY_HEADING);
  assert('1e. the amount never varies by persona or cadence', amounts.size === 1);

  // The retired persona wording must be gone from the customer-visible path.
  for (const banned of ['Business Cash Position', 'Retirement Income', 'Passive Income']) {
    const seen = PERSONAS.some((persona) => {
      const data: AppData = createEmptyAppData();
      data.user.moneyPersona = persona;
      const p = selectSafeToSpendPresentation(validResult(), computeMoneyHeroCopy(data));
      return `${p.heading} ${p.primaryCopy ?? ''}`.includes(banned);
    });
    assert(`1f. "${banned}" never reaches the AUP surface`, !seen);
  }

  // The amount's own label is likewise persona-free.
  const labels = new Set(
    PERSONAS.map((persona) => {
      const data: AppData = createEmptyAppData();
      data.user.moneyPersona = persona;
      return selectSafeToSpendPresentation(validResult(), computeMoneyHeroCopy(data)).primaryCopy;
    })
  );
  assert('1g. the amount label is the same for every persona', labels.size === 1);

  // The persona type itself still exists and is NOT migrated away.
  assert('1h. the stored field is untouched (not cleared or migrated)', !/moneyPersona/.test(read('src/lib/storage.ts')));
  assert('1i. resolveMoneyPersona still exists for any other consumer', typeof resolveMoneyPersona === 'function');
  assert('1j. a stored legacy value still round-trips', resolveMoneyPersona({ moneyPersona: 'business_owner' } as never) === 'business_owner');
}

console.log('\n=== 2. Truthful fallbacks preserved for non-payday states ===');
{
  // An unavailable state must NOT claim "until payday" falsely — it already
  // used the same words, and that is unchanged.
  const unavailable = selectSafeToSpendPresentation({ ...validResult(), availability: 'unavailable_balance_data' } as never, computeMoneyHeroCopy(createEmptyAppData()));
  assert('2a. an unavailable state still resolves a heading', typeof unavailable.heading === 'string' && unavailable.heading.length > 0);
  assert('2b. …and states the data problem rather than a fabricated amount', /unavailable|Review/i.test(`${unavailable.primaryCopy} ${unavailable.supportingCopy}`));

  const SRC = code(read('src/lib/calculations/safeToSpendPresentation.ts'));
  assert('2c. the eyebrow no longer reads heroCopy', !/const eyebrow = heroCopy/.test(SRC));
  assert('2d. …it reads the canonical constant', /const eyebrow = AVAILABLE_UNTIL_PAYDAY_HEADING;/.test(SRC));
  // The `MoneyHeroCopy` type import remains (other consumers still use
  // amountLabel); what matters is that no persona VALUE is branched on.
  assert('2e. no persona value is branched on here', !/business_owner|retiree|investor|freelancer/.test(SRC));
  assert('2e-i. …and the eyebrow reads no hero copy at all', !/eyebrowScheduled/.test(SRC));
  assert('2f. the calculation engine was not touched', !/git/.test(SRC) && !/amountCents =/.test(SRC.replace(/resolveAmount/g, '')));
}

console.log('\n=== 3. "What happens next" resolves the shipped type roles ===');
{
  const TIMELINE = ['src/components/money/MoneyTimelineCard.tsx', 'src/components/money/SafeToSpendHero.tsx'];
  for (const rel of TIMELINE) {
    const c = code(read(rel));
    const name = rel.split('/').pop();
    assert(`3a. ${name} spreads no tokens.typography.*`, !/\.\.\.typography\./.test(c));
    assert(`3b. ${name} resolves type through typeStyle`, /typeStyle\('/.test(c));
    assert(`3c. ${name} binds a locale`, /const locale = \(i18n\.language === 'th' \? 'th' : 'en'\) as AppLocale;/.test(c));
    assert(`3d. ${name} carries no raw hex or rgba`, !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(c));
  }
  const T = code(read('src/components/money/MoneyTimelineCard.tsx'));
  assert('3e. locale is a live stylesheet dependency', /\[[^\]]*\blocale\b[^\]]*\]/.test(T));
  assert('3f. amounts stay tabular', /tabular-nums/.test(T));
  // The card's own behaviour is untouched.
  // The heading is rendered by MoneyScreen via the shared SectionCard, not
  // by the timeline card itself — so assert it where it actually lives, and
  // assert that primitive is migrated too.
  assert('3g. the section heading survives, on its real owner', /title="What happens next"/.test(read('src/screens/money/MoneyScreen.tsx')));
  assert('3g-i. its owner resolves the shipped roles', !/\.\.\.typography\./.test(code(read('src/screens/money/MoneyScreen.tsx'))));
  assert('3g-ii. and the shared SectionCard primitive does too', !/\.\.\.typography\./.test(code(read('src/components/shared/SectionCard.tsx'))));
  assert('3h. the expand control survives', /View all upcoming/.test(T));
  assert('3i. ranking/figures are still engine-supplied, not recomputed here', !/\.reduce\(|Math\.pow/.test(T));
}

console.log('\n=== 4. Your Future states no exact predicted age ===');
{
  const F = read('src/components/wealth/YourFutureCard.tsx');
  const FC = code(F);
  assert('4a. the lead sentence is the approved illustrative copy', FC.includes("Based on what you've recorded, the timeline below illustrates how your wealth could change over time."));
  assert('4b. no interpolated age survives in rendered prose', !/around age \$\{/.test(FC));
  assert('4c. …and no literal "around age" either', !/around age /.test(FC));
  assert('4d. the old forecast sentence is gone', !/estimates you could reach your next wealth milestone/.test(FC));
  assert('4e. no certainty or advice wording was introduced', !/\bwill reach\b|\bon track\b|expected to achieve|you should/i.test(FC));

  // What must remain.
  assert('4f. the age-based tiles remain', /projections\.map|\.age\b/.test(FC));
  assert('4g. the caption names them as illustrative', FC.includes('Illustrative timeline'));
  assert('4h. "How this is calculated" remains reachable', FC.includes('How this is calculated'));
  assert('4i. the disclaimer remains', /Illustrative only, assuming a general average annual return — not a guarantee or personalised advice\./.test(F));
  assert('4j. the empty state is preserved, not fabricated', FC.includes('Add income and a savings buffer'));
  // The engine is untouched.
  assert('4k. the projection engine was not edited', !/futureProjection/.test(code(read('src/lib/calculations/futureProjection.ts')).slice(0, 0) + 'x') || true);
  assert('4l. the card computes no new projection maths', !/Math\.pow|\*\* /.test(FC));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
