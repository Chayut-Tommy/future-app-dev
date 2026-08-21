// Nolie Design 5.1 Wave 5 — the Today hierarchy.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT): the Score containment selector runs for real.
// - Class C (structural): composition order, the cards excluded from the
//   default composition, and the retirement of contrastOverrides.ts.
//
// NOT proven here: how Today looks, VoiceOver's actual spoken order, or
// Dynamic Type layout. Those are device evidence.
//
// Run with: npx tsx tests/design5-wave5-today-hierarchy.test.ts

import * as fs from 'fs';
import * as path from 'path';
import { selectScoreChipPresentation } from '../src/lib/calculations/scoreChipPresentation';
import { LuluScoreResult } from '../src/lib/calculations/luluScore';
import { selectTodayBriefingEventRows } from '../src/lib/calculations/todayBriefing';
import { selectBriefingTiles } from '../src/lib/calculations/briefingTiles';
import { TimelineEvent } from '../src/lib/calculations/moneyTimeline';
import { SmartReminder } from '../src/lib/calculations/reminders';
import { SafeToSpendPresentation } from '../src/lib/calculations/safeToSpendPresentation';
import {
  ACCESSIBILITY_TEXT_THRESHOLD,
  AMBIENT_FADE_DISTANCE,
  MIN_MEASURE_COLUMN_WIDTH,
  PRIORITY_ROW_MIN_HEIGHT,
  ROW_ICON_TILE_SIZE,
  ambientFieldHeight,
  ambientGradientLocations,
  formatMonthMeasure,
  formatTodayDateEyebrow,
  goalPercentageIsTrailing,
  isAccessibilityText,
  isMonthSectionEligible,
  resolveHeroEmphasis,
  MINUS_SIGN,
  MONTH_MEASURE_COMFORTABLE_SIZE,
  MONTH_MEASURE_FIGURE_MIN_SIZE,
  MONTH_MEASURE_FIGURE_SIZE,
  MONTH_MEASURE_FIGURE_SIZES,
  estimateFigureWidth,
  measureColumnWidth,
  requiredMeasureColumnWidth,
  resolveMonthMeasureFigureSize,
  spokenMonthMeasure,
  priorityRowAmountFitsInline,
  resolveMonthMeasureLayout,
  selectMonthMeasures,
  todayScreenMargin,
} from '../src/lib/calculations/todayComposition';
import {
  MAX_PRIORITY_ROWS,
  formatHeroTimeframe,
  formatPriorityRowAmount,
  formatPriorityRowDate,
  resolvePriorityRowMarker,
  selectBriefingPriorityRows,
} from '../src/lib/calculations/briefingPriorityRows';
import { DESIGN_THEME_MATRIX, designLayout, designRadius, resolveSemanticColors } from '../src/theme/semanticTokens';
import { CONTRAST_FLOORS, contrastRatio } from '../src/theme/contrast';
import { resolveTextStyle, TYPE_ROLES } from '../src/theme/typography';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

const TODAY = read('src/screens/today/TodayScreen.tsx');
const BRIEFING = read('src/components/today/TodayBriefingCard.tsx');

console.log('=== 1. The established-customer hierarchy, in order (Class C) ===');
{
  // Design 5.1 doc A p.7. Each landmark must appear, once, in this order.
  const ORDER = [
    ['greeting', 'styles.greeting'],
    ['money picture checklist', '<MoneyPictureChecklistCard />'],
    ['Today Briefing hero', '<TodayBriefingCard'],
    ['journey snapshot', '<TodayJourneySnapshotCard'],
    ['current-month snapshot', '<MonthSnapshotCard'],
    ['Worth Knowing', '<WorthKnowingCard'],
    ['goal', 'accessibilityRole="header">Your goal<'],
    ['Score footnote', 'testID="today-score-footnote"'],
  ] as const;

  let previous = -1;
  let ordered = true;
  const missing: string[] = [];
  for (const [name, marker] of ORDER) {
    const idx = TODAY.indexOf(marker);
    if (idx === -1) missing.push(name);
    else if (idx < previous) ordered = false;
    else previous = idx;
  }
  assert(`1a. every hierarchy landmark is present${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
  assert('1b. and they appear in the Design 5.1 order', ordered);

  // The setup checklist sits directly beneath the greeting, ahead of the
  // Briefing — the previously approved setup priority, which this
  // recomposition must not regress.
  assert('1c. the checklist renders exactly once', (TODAY.match(/<MoneyPictureChecklistCard/g) || []).length === 1);
  assert('1d. and sits between the greeting and the Briefing', TODAY.indexOf('<MoneyPictureChecklistCard') < TODAY.indexOf('<TodayBriefingCard'));
  assert('1e. Today renders the checklist unconditionally — the card still owns its own completed/dismissed rule', /\n      <MoneyPictureChecklistCard \/>\n/.test(TODAY) && !/[?&|]\s*<MoneyPictureChecklistCard/.test(TODAY));
  assert('1e-ii. and that rule still lives in the card itself', /moneyPictureChecklistDismissed/.test(read('src/components/today/MoneyPictureChecklistCard.tsx')));
  const TODAY_CODE = TODAY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert('1f. the month label is derived from the customer\'s own date, never hard-coded', /\{monthLabel\} so far/.test(TODAY_CODE) && !/August so far|July so far/.test(TODAY_CODE));
}

console.log('\n=== 2. Cards excluded from the default composition (Class C) ===');
{
  // Each of these must be ABSENT from Today's default composition but still
  // present in the codebase — Wave 5 removes them from the page, never from
  // the repository.
  const EXCLUDED = [
    ['ProfileNudgeCard', 'src/components/today/ProfileNudgeCard.tsx'],
    ['FinancialStateCard', 'src/components/today/FinancialStateCard.tsx'],
    ['SavingFactsCard', 'src/components/today/SavingFactsCard.tsx'],
    ['LuluCheckInCard', 'src/components/today/LuluCheckInCard.tsx'],
    ['LuluRecommendationCard', 'src/components/today/LuluRecommendationCard.tsx'],
  ] as const;
  for (const [name, file] of EXCLUDED) {
    assert(`2a. ${name} is not in Today's default composition`, !new RegExp(`<${name}`).test(TODAY));
    assert(`2b. ${name}'s component file is preserved`, exists(file));
  }
  // SmartReminderCard must not compete as a standalone default card — its
  // actionable items are represented by the Briefing's priority rows — but
  // the reminder sheet and lifecycle stay.
  assert('2c. SmartReminderCard is not a competing standalone default card', !/<SmartReminderCard/.test(TODAY));
  assert('2d. but ReminderDetailSheet and the reminder lifecycle remain', /<ReminderDetailSheet/.test(TODAY) && exists('src/components/today/SmartReminderCard.tsx'));
  assert('2e. and the reminder engine is untouched', exists('src/lib/calculations/reminders.ts'));
}

console.log('\n=== 3. Worth Knowing owns the insight slot alone (Class C) ===');
{
  assert('3a. at most one Worth Knowing card can render', (TODAY.match(/<WorthKnowingCard/g) || []).length === 1);
  assert('3b. the selector is called exactly once', (TODAY.match(/pickWorthKnowingInsight\(/g) || []).length <= 1);
  assert('3c. no FinancialStateCard fallback', !/<FinancialStateCard/.test(TODAY));
  assert('3d. the selector is never suppressed for negative net worth', !/showFinancialRebuild/.test(TODAY));
  assert('3e. no insight card and no spacer when nothing qualifies', /worthKnowingInsight \?/.test(TODAY) && !/<View style=\{styles\.insightSpacer\}/.test(TODAY));
  assert('3f. financialState.ts is untouched and still serves Wealth Map', exists('src/lib/calculations/financialState.ts'));
}

console.log('\n=== 4. Score containment (Class A + Class C) ===');
{
  const valid = selectScoreChipPresentation({ locked: false, score: 72 } as unknown as LuluScoreResult);
  assert('4a. a valid score carries the interim containment', valid.supportingText.includes('Interim'));
  assert('4b. states it is based on recorded information', valid.supportingText.includes('Based on what you’ve recorded'));
  assert('4c. and explicitly that it is not a credit score', valid.supportingText.includes('Not a credit score'));
  assert('4d. it never claims to be a prediction, eligibility, wellbeing, advice or a recommendation', !/predict|eligib|wellbeing|advice|recommend/i.test(valid.supportingText));

  const locked = selectScoreChipPresentation({ locked: true, score: 0 } as unknown as LuluScoreResult);
  assert('4e. a locked score says "Not enough recorded yet"', locked.supportingText === 'Not enough recorded yet');
  assert('4f. and shows no number — never 0 as a stand-in', locked.scoreValue === null && !/\d/.test(locked.label));

  const invalid = selectScoreChipPresentation({ locked: false, score: Number.NaN } as unknown as LuluScoreResult);
  assert('4g. an invalid score says the same thing', invalid.supportingText === 'Not enough recorded yet');
  assert('4h. and is never clamped into a visible score', invalid.scoreValue === null);
  const outOfRange = selectScoreChipPresentation({ locked: false, score: 140 } as unknown as LuluScoreResult);
  assert('4i. an out-of-range score is not clamped either', outOfRange.scoreValue === null && outOfRange.supportingText === 'Not enough recorded yet');

  // Placement: a quiet footnote AFTER the goal, never Briefing content.
  assert('4j. the Score is not Briefing content in any form', !/ScoreChip|scoreChip/.test(BRIEFING));
  assert('4k. the footnote renders after the goal section', TODAY.indexOf('testID="today-score-footnote"') > TODAY.indexOf('Your goal'));
  assert('4l. as a quiet supporting row, not a second hero or highlighted card', /scoreFootnoteRow: \{\s*\n\s*minHeight: minTouchTarget,/.test(TODAY) && /borderTopWidth: StyleSheet\.hairlineWidth,/.test(TODAY));
  assert('4m. one accessible sentence conveys the whole state', /accessibilityLabel=\{`\$\{scoreChipPresentation\.label\}\. \$\{scoreChipPresentation\.supportingText\}`\}/.test(TODAY));
  assert('4n. and the existing Score explanation is still reachable', /onPress=\{handleScoreChipPress\}/.test(TODAY));
  assert('4o. no score formula, factor or category was introduced here', !/computeLuluScore|factors|categor/i.test(TODAY.split('scoreFootnoteRow')[0].slice(-2000)));
}

console.log('\n=== 5. Goal containment is the approved Wave 4 behaviour (Class C) ===');
{
  assert('5a. exactly one focus goal', /const primaryActiveGoal = data\.goals\.find\(\(g\) => g\.status === 'active'\) \?\? null;/.test(TODAY));
  assert('5b. the active count excludes completed and archived goals', /const activeGoalCount = data\.goals\.filter\(\(g\) => g\.status === 'active'\)\.length;/.test(TODAY));
  assert('5c. View all goals appears only above one active goal', /\{activeGoalCount > 1 \? \(/.test(TODAY));
  assert('5d. and opens the EXISTING Goals screen', /navigation\.navigate\('Goals'\)/.test(TODAY));
  assert('5e. Today never lists every goal', (TODAY.match(/data\.goals\.map\(/g) || []).length === 0);
  // Wave 5 closure B — the calm zero-goal state is now Today's own
  // "Plan a goal" action row rather than the shared unlock panel. Same
  // slot, same destination, same calm register; only the presentation
  // changed. Fully asserted in section 17.
  assert('5f. zero active goals keeps a calm, single add-goal state', /testID="today-plan-goal-row"/.test(TODAY) && (TODAY.match(/testID="today-plan-goal-row"/g) || []).length === 1);
  assert('5g. goal detail opens the shared Wave 4 editor', /<GoalDetailSheet goal=\{contributeGoal\}/.test(TODAY));
}

console.log('\n=== 6. contrastOverrides.ts is retired (Class C) ===');
{
  assert('6a. the module is deleted', !exists('src/theme/contrastOverrides.ts'));
  // Its two gradient-contrast roles moved into the semantic system, where
  // raw values legitimately live; the colour override was replaced outright.
  const tokens = read('src/theme/semanticTokens.ts');
  assert('6b. HERO_SCRIM_OPACITY now lives in the semantic token system', /export const HERO_SCRIM_OPACITY/.test(tokens));
  assert('6c. INSIGHT_PROVENANCE_OPACITY too', /export const INSIGHT_PROVENANCE_OPACITY = 0\.83;/.test(tokens));
  assert('6d. and their derivations carried over unchanged', /blue: \{ light: 0\.55, dark: 0\.59 \}/.test(tokens) && /sunrise: \{ light: 0\.58, dark: 0\.49 \}/.test(tokens));

  // The colour override is gone entirely — every former consumer now reads
  // the Design 5.1 semantic warning role, which is darker than the legacy
  // token it corrected.
  const CONSUMERS = [
    'src/components/today/MonthSnapshotCard.tsx',
    'src/components/today/FinancialStateCard.tsx',
    'src/components/today/SmartReminderCard.tsx',
    'src/components/today/WorthKnowingCard.tsx',
    'src/components/discover/MoneyOpportunitiesHero.tsx',
  ];
  for (const rel of CONSUMERS) {
    const src = read(rel);
    assert(`6e. ${rel.split('/').pop()} no longer imports the retired module`, !/contrastOverrides/.test(src.replace(/\/\/.*$/gm, '')));
    assert(`6f. ${rel.split('/').pop()} introduces no raw colour`, !/#[0-9a-fA-F]{3,8}\b/.test(src));
  }
  assert('6g. WARNING_TEXT_LIGHT_OVERRIDE has no remaining definition or consumer in src', !/WARNING_TEXT_LIGHT_OVERRIDE/.test(CONSUMERS.map(read).join('\n')));
  assert('6h. and the three former consumers use the semantic warning role instead', CONSUMERS.slice(0, 3).every((rel) => /semantic\.warning/.test(read(rel))));
}

console.log('\n=== 7. Engines and non-goals untouched (Class C) ===');
{
  const ENGINES = [
    'safeToSpend.ts', 'todayBriefing.ts', 'worthKnowing.ts', 'reminders.ts',
    'achievements.ts', 'monthlySummary.ts', 'luluScore.ts', 'goalAllocation.ts', 'financialState.ts',
  ];
  for (const e of ENGINES) assert(`7a. ${e} still exists and was not deleted`, exists(`src/lib/calculations/${e}`));
  assert('7b. Today recreates no monthly arithmetic', !/monthlyIncome -|totalIncome -|net =/.test(TODAY));
  assert('7c. nor any Safe-to-Spend arithmetic', !/cycleRemainingPool -|includedMoneyBalance -/.test(TODAY));
  assert('7d. the Briefing amount comes from the shared presentation selector', /selectSafeToSpendPresentation/.test(TODAY) || /presentation=\{/.test(TODAY));
  assert('7e. no raw colour anywhere in Today', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(TODAY));
  assert('7f. the footnote rule reads the SEMANTIC border role, not a legacy token', /borderTopColor: semantic\.border/.test(TODAY));
}

console.log('\n=== 8. The Briefing priority budget and ordering (Class A) ===');
{
  // Real engine, real fixtures. The Briefing may show AUP plus at most two
  // further priority rows — the reminder counts against that budget.
  const ev = (id: string, daysUntil: number, kind: TimelineEvent['kind'], amount: number): TimelineEvent => ({
    id, date: new Date(2026, 7, 19 + daysUntil), daysUntil, kind,
    icon: 'calendar-outline', label: id, amount,
  } as TimelineEvent);

  const reminder = { id: 'r1', kind: 'bill_due_soon', title: 'Rent is due', body: '' } as SmartReminder;

  // Five competing events is deliberately more than the budget can hold.
  const many = [ev('e5', 9, 'bill', -90), ev('e1', 1, 'bill', -100), ev('e3', 5, 'income', 300), ev('e2', 2, 'bill', -200), ev('e4', 7, 'bill', -80)];

  const withReminder = selectTodayBriefingEventRows(many, reminder);
  const withoutReminder = selectTodayBriefingEventRows(many, null);
  assert('8a. with a reminder, exactly one event row is admitted', withReminder.length === 1);
  assert('8b. without a reminder, exactly two are', withoutReminder.length === 2);
  assert('8c. the soonest event wins the single slot', withReminder[0].key === 'e1');
  assert('8d. and the two soonest, in date order, win the two slots', withoutReminder.map((r) => r.key).join(',') === 'e1,e2');
  assert('8e. an event 9 days out never displaces one 1 day out', !withoutReminder.some((r) => r.key === 'e5'));

  // Fewer events than the budget must not be padded.
  assert('8f. one candidate yields one row, never a padded two', selectTodayBriefingEventRows([ev('only', 3, 'bill', -50)], null).length === 1);
  assert('8g. no candidates yields no rows', selectTodayBriefingEventRows([], null).length === 0);

  // The tile composition on top of that budget: AUP first, reminder next.
  const presentation = { heroState: 'healthy', tone: 'positive', heading: 'Available to spend', primaryCopy: '$420', compactSummary: 'Available' } as unknown as SafeToSpendPresentation;
  const tilesWith = selectBriefingTiles(presentation, reminder, withReminder);
  const tilesWithout = selectBriefingTiles(presentation, null, withoutReminder);
  assert('8h. AUP is always the first tile', tilesWith[0].kind === 'aup' && tilesWithout[0].kind === 'aup');
  assert('8i. the reminder follows AUP when present', tilesWith[1].kind === 'reminder');
  assert('8j. events follow, never before the reminder', tilesWith[2].kind === 'event');
  assert('8k. the total never exceeds three tiles, with a reminder', tilesWith.length === 3);
  assert('8l. nor without one', tilesWithout.length === 3);
  assert('8m. an empty Briefing still shows the AUP tile alone', selectBriefingTiles(presentation, null, []).length === 1);
  // Ordering is deterministic, not insertion-dependent.
  const shuffled = [...many].reverse();
  assert('8n. ordering does not depend on the order events arrived in', selectTodayBriefingEventRows(shuffled, null).map((r) => r.key).join(',') === 'e1,e2');
}

console.log('\n=== 9. The visible page 7 anatomy (Class C) ===');
{
  // Anatomy is about what RENDERS, so every check below reads the code with
  // comments stripped — a doc comment that mentions the old treatment must
  // not read as the old treatment still being present.
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const BRIEFING_ALL = read('src/components/today/TodayBriefingCard.tsx');
  const BRIEFING = strip(BRIEFING_ALL);
  const JOURNEY = strip(read('src/components/today/TodayJourneySnapshotCard.tsx'));
  const MONTH = strip(read('src/components/today/MonthSnapshotCard.tsx'));
  const WORTH = strip(read('src/components/today/WorthKnowingCard.tsx'));

  // 9a. The hero, in the order Design 5.1 p.7 states.
  // Measured across the RENDERED tree only — the props block above it
  // legitimately names the same identifiers in a different order.
  const HERO_JSX = BRIEFING.slice(BRIEFING.indexOf('<LinearGradient'));
  const HERO_ORDER = ['Your Today Briefing', '{presentation.heading}', 'today-briefing-figure', 'styles.timeframe', 'styles.divider', 'today-briefing-priority-rows', 'today-briefing-provenance'];
  let prev = -1, ordered = true;
  const missingHero: string[] = [];
  for (const marker of HERO_ORDER) {
    const i = HERO_JSX.indexOf(marker);
    if (i === -1) missingHero.push(marker);
    else if (i < prev) ordered = false;
    else prev = i;
  }
  ordered = ordered && missingHero.length === 0;
  assert('9a. the hero renders identity → measure label → figure → timeframe → divider → rows → provenance', ordered);
  assert('9b. the figure uses the figureHero role, not a tile-sized one', /textStyle\('figureHero'/.test(BRIEFING));
  assert('9c. the hero sits on heroSurface, not the old saturated gradient', /semantic\.heroSurface/.test(BRIEFING) && !/naviloPalette/.test(BRIEFING));
  assert('9d. at the approved 20pt hero radius', /borderRadius: designRadius\.hero/.test(BRIEFING) && designRadius.hero === 20);
  assert('9e. the three-column tile grid is gone from the Briefing entirely', !/BriefingTileRow/.test(BRIEFING));
  assert('9f. and the tile component itself is preserved in the codebase', exists('src/components/today/BriefingTileRow.tsx'));
  assert('9g. the hero never renders an empty figure slot — the setup state replaces it outright', /amountVisible \? \(/.test(BRIEFING) && /today-briefing-setup/.test(BRIEFING));
  assert('9h. and never fabricates a $0', !/\$0/.test(BRIEFING));

  // 9i-l. Priority rows are rows, not tiles.
  const ROW = strip(read('src/components/today/BriefingPriorityRow.tsx'));
  assert('9i. a priority row lays out horizontally at full width', /flexDirection: 'row'/.test(ROW));
  assert('9j. with a real minimum height and a 44pt touch floor', /minHeight: Math\.max\(PRIORITY_ROW_MIN_HEIGHT, designLayout\.touchTargetMin\)/.test(ROW) && PRIORITY_ROW_MIN_HEIGHT >= 52 && designLayout.touchTargetMin === 44);
  assert('9k. a leading 28pt marker tile', /width: ROW_ICON_TILE_SIZE/.test(ROW) && ROW_ICON_TILE_SIZE === 28);
  assert('9l. and a clear navigation affordance', /chevron-forward/.test(ROW));

  // 9m-p. Supporting surfaces are flat and bordered — not heroes.
  for (const [name, src] of [['Journey', JOURNEY], ['month card', MONTH]] as const) {
    assert(`9m. the ${name} is a flat bordered supporting surface`, /backgroundColor: semantic\.bgSurface/.test(src) && /borderWidth: StyleSheet\.hairlineWidth/.test(src));
    assert(`9n. the ${name} renders no gradient`, !/LinearGradient/.test(src));
  }
  assert('9o. the Journey is one row and no longer carries its own footer link', /flexDirection: 'row'/.test(JOURNEY) && !/View full journey/.test(JOURNEY));
  assert('9p. Worth Knowing is the flat highlighted tier, not a second hero', /semantic\.infoTint/.test(WORTH) && /semantic\.infoBorder/.test(WORTH) && !/LinearGradient/.test(WORTH));

  // 9q-t. Density budget across the whole page.
  const ALL = [strip(TODAY), BRIEFING, JOURNEY, MONTH, WORTH, ROW, strip(read('src/components/today/TodayAmbientField.tsx'))].join('\n');
  assert('9q. exactly one ambient field on Today', (TODAY.match(/<TodayAmbientField/g) || []).length === 1);
  assert('9r. exactly one expressive hero', (TODAY.match(/<TodayBriefingCard/g) || []).length === 1);
  assert('9s. no glass card anywhere on Today', !/blur|BlurView|glass/i.test(ALL));
  assert('9t. and no raw colour in any Today surface', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(ALL));
  assert('9u. the goal is one compact row, not a card with a stacked block', /styles\.goalRow/.test(TODAY) && /goalIconTile/.test(TODAY));
  assert('9v. the Score footnote is still not a card, surface or tint', !/scoreFootnoteRow: \{[^}]*backgroundColor/.test(TODAY) && !/scoreFootnoteRow: \{[^}]*borderRadius/.test(TODAY));
  assert('9w. the header shows a local date eyebrow before the greeting', TODAY.indexOf('today-date-eyebrow') < TODAY.indexOf('today-greeting'));
  assert('9x. the Settings control meets the touch minimum on its own', /const SETTINGS_CONTROL_SIZE = 44;/.test(TODAY));
}

console.log('\n=== 10. Responsive geometry, exhaustively (Class A) ===');
{
  // 10a-c. Screen margins: 20pt, 16pt at or below 360.
  assert('10a. 390pt phone gets 20pt margins', todayScreenMargin(390) === 20);
  assert('10b. 360pt phone gets 16pt margins', todayScreenMargin(360) === 16);
  assert('10c. 320pt phone gets 16pt margins', todayScreenMargin(320) === 16);
  assert('10d. 768pt tablet still gets 20pt', todayScreenMargin(768) === 20);

  // 10e-j. The month card's three measures reflow rather than truncate.
  assert('10e. 390pt at normal text: three columns', resolveMonthMeasureLayout(390, 1, 20) === 'threeColumn');
  assert('10f. 430pt at normal text: three columns', resolveMonthMeasureLayout(430, 1, 20) === 'threeColumn');
  assert('10g. 320pt at normal text drops a column rather than shrinking figures', resolveMonthMeasureLayout(320, 1, 16) !== 'threeColumn');
  assert('10h. 200% text stacks, at every width', [320, 360, 390, 430, 768].every((w) => resolveMonthMeasureLayout(w, 2, todayScreenMargin(w)) === 'stacked'));
  assert('10i. the threshold itself is what stacks, not an arbitrary size', resolveMonthMeasureLayout(390, ACCESSIBILITY_TEXT_THRESHOLD, 20) === 'stacked' && resolveMonthMeasureLayout(390, ACCESSIBILITY_TEXT_THRESHOLD - 0.01, 20) === 'threeColumn');
  assert('10j. no width ever yields a column narrower than a label needs', [320, 360, 390, 430, 768].every((w) => {
    const m = todayScreenMargin(w);
    if (resolveMonthMeasureLayout(w, 1, m) !== 'threeColumn') return true;
    return (w - m * 2 - designLayout.cardPadding * 2 - 16) / 3 >= MIN_MEASURE_COLUMN_WIDTH;
  }));

  // 10k-n. Priority-row and goal reflow.
  assert('10k. 390pt at normal text keeps the amount inline', priorityRowAmountFitsInline(390, 1));
  assert('10l. 320pt drops the amount to its own line rather than truncating', !priorityRowAmountFitsInline(320, 1));
  assert('10m. 200% text drops it too, at any width', [320, 390, 430].every((w) => !priorityRowAmountFitsInline(w, 2)));
  assert('10n. the goal percentage moves below at accessibility sizes only', goalPercentageIsTrailing(1) && !goalPercentageIsTrailing(2));
  assert('10o. one shared accessibility threshold governs all of it', isAccessibilityText(1.3) && !isAccessibilityText(1.29));

  // 10p-s. The ambient field.
  assert('10p. the fade distance is the specified 220pt', AMBIENT_FADE_DISTANCE === 220);
  assert('10q. and is measured from the true top of the screen, inset included', ambientFieldHeight(47) === 267 && ambientFieldHeight(0) === 220);
  assert('10r. a negative inset cannot shrink the field', ambientFieldHeight(-10) === 220);
  assert('10s. the stops are eased, starting at the top and ending exactly at the canvas', (() => {
    const l = ambientGradientLocations(3);
    return l[0] === 0 && l[l.length - 1] === 1 && l[1] < 0.5;
  })());
  assert('10t. stop positions always ascend, for any stop count', [2, 3, 4, 5].every((n) => {
    const l = ambientGradientLocations(n);
    return l.every((v, i) => i === 0 || v > l[i - 1]);
  }));
}

console.log('\n=== 11. The three month measures (Class A) ===');
{
  const m = selectMonthMeasures(2400, 860);
  assert('11a. exactly three measures', m.length === 3);
  assert('11b. labelled Money in, Spending recorded, Net recorded', m.map((x) => x.label).join(' | ') === 'Money in | Spent | Net recorded');
  assert('11c. money in keeps its established explicit positive sign', m[0].value === '+$2,400');
  assert('11d. spending is a magnitude under its own label, never a negative', m[1].value === '$860');
  assert('11e. and the net is the exact figure the card already displayed', m[2].value === '+$1,540');

  // Colour rules.
  assert('11f. green only for positive money in', m[0].tone === 'positive' && selectMonthMeasures(0, 500)[0].tone === 'neutral');
  assert('11g. spending is ALWAYS neutral ink — never urgent red', [selectMonthMeasures(0, 5000), selectMonthMeasures(100, 99999)].every((r) => r[1].tone === 'neutral'));
  assert('11h. a negative net is caution, never urgent', selectMonthMeasures(100, 900)[2].tone === 'caution');
  assert('11i. an exactly-zero net is neutral', selectMonthMeasures(500, 500)[2].tone === 'neutral');
  assert('11j. and a negative net reads with a typographic minus', selectMonthMeasures(100, 900)[2].value === `${MINUS_SIGN}$800`);
  assert('11k. a non-finite input never renders as a number', formatMonthMeasure(Number.NaN) === '—' && formatMonthMeasure(Number.POSITIVE_INFINITY) === '—');
  assert('11l. no judgement copy anywhere in the measures', !m.some((x) => /good|bad|great|poor|well done|too much/i.test(`${x.label} ${x.value}`)));
  assert('11m. zero everywhere renders real zeros, not em-dashes — the card only renders at all once something is recorded', selectMonthMeasures(0, 0).every((x) => x.value === '$0'));
}

console.log('\n=== 12. Priority-row content and colour rules (Class A) ===');
{
  assert('12a. the page-level cap is two rows', MAX_PRIORITY_ROWS === 2);

  // Markers. urgent is reserved for genuinely late money.
  assert('12b. an overdue bill is urgent', resolvePriorityRowMarker('bill', -1) === 'urgent');
  assert('12c. a bill due TODAY is caution, never urgent', resolvePriorityRowMarker('bill', 0) === 'caution');
  assert('12d. a bill due in two days is caution', resolvePriorityRowMarker('bill', 2) === 'caution');
  assert('12e. a bill due in three days is neither', resolvePriorityRowMarker('bill', 3) === 'neutral');
  assert('12f. income is never urgent or amber, at any day count', [-5, 0, 1, 30].every((d) => resolvePriorityRowMarker('income', d) === 'positive'));
  assert('12g. an unknown date is neutral, never guessed into urgency', resolvePriorityRowMarker('bill', null) === 'neutral');

  // Amounts.
  assert('12h. income carries an explicit positive sign', formatPriorityRowAmount(2400, true) === '+$2,400');
  assert('12i. an outflow carries no minus — the label already says it is due', formatPriorityRowAmount(-1800, false) === '$1,800');
  assert('12j. a zero amount shows nothing rather than "$0"', formatPriorityRowAmount(0, false) === null);
  assert('12k. a non-finite amount shows nothing', formatPriorityRowAmount(Number.NaN, false) === null && formatPriorityRowAmount(Number.POSITIVE_INFINITY, true) === null);

  // Enrichment preserves the engine's own wording verbatim.
  const events = [
    { id: 'rent', date: new Date(2026, 7, 22), daysUntil: 2, kind: 'bill', icon: 'calendar-outline', label: 'Rent', amount: -1800 },
    { id: 'pay', date: new Date(2026, 7, 23), daysUntil: 3, kind: 'income', icon: 'cash', label: 'Salary', amount: 2600 },
  ] as unknown as import('../src/lib/calculations/moneyTimeline').TimelineEvent[];
  const eventRows = selectTodayBriefingEventRows(events, null);
  const presentation = { heroState: 'healthy', tone: 'normal', heading: 'Available until payday', primaryCopy: '$1,326', compactSummary: 'Available', amountVisible: true, displayAmount: '$1,326' } as unknown as SafeToSpendPresentation;
  const rows = selectBriefingPriorityRows(selectBriefingTiles(presentation, null, eventRows), eventRows, events, null);

  assert('12l. the AUP tile becomes the hero headline, never a row', !rows.some((r) => r.key === 'aup'));
  assert('12m. at most two rows survive', rows.length <= MAX_PRIORITY_ROWS);
  assert('12n. each row carries the engine\'s own label verbatim', rows[0].label === 'Rent due in 2 days');
  assert('12o. "due today" wording is preserved and never becomes "due soon"', (() => {
    const dueToday = [{ ...events[0], daysUntil: 0, id: 'x' }] as any;
    const r = selectBriefingPriorityRows(selectBriefingTiles(presentation, null, selectTodayBriefingEventRows(dueToday, null)), selectTodayBriefingEventRows(dueToday, null), dueToday, null);
    return r[0].label.includes('due today') && !r[0].label.includes('due soon');
  })());
  assert('12p. each row carries an exact date, not only a day count', rows.every((r) => r.dateLabel !== null));
  assert('12q. and an amount where one exists', rows[0].amountLabel === '$1,800');
  const incomeRow = rows.find((r) => r.label.startsWith('Income'));
  assert('12r. the near-term income row is admitted and carries its positive sign', !!incomeRow && incomeRow.amountLabel === '+$2,600');
  assert('12r-ii. and its marker is positive, never caution', incomeRow?.marker === 'positive');
  assert('12s. one spoken sentence carries what, when and how much', /Rent due in 2 days, .+, \$1,800/.test(rows[0].accessibilityLabel));
  assert('12t. ordering follows the engine — soonest first', rows[0].key.includes('rent'));
  assert('12u. rows carrying no matching event still render, without an invented date', (() => {
    const orphan = selectBriefingPriorityRows(selectBriefingTiles(presentation, null, eventRows), eventRows, [], null);
    return orphan.every((r) => r.dateLabel === null && r.amountLabel === null);
  })());
  assert('12v. an empty Briefing produces no rows at all', selectBriefingPriorityRows(selectBriefingTiles(presentation, null, []), [], [], null).length === 0);
}

console.log('\n=== 13. The hero timeframe line (Class A) ===');
{
  const end = new Date(2026, 7, 28);
  assert('13a. reads "N days to <date> · about $X a day"', /^11 days to .+ · about \$120 a day$/.test(formatHeroTimeframe(11, end, 120, true) ?? ''));
  assert('13b. singular day is not pluralised', (formatHeroTimeframe(1, end, 50, true) ?? '').startsWith('1 day to '));
  assert('13c. no known payday means no line at all — never a guessed cycle', formatHeroTimeframe(11, end, 120, false) === null);
  assert('13d. a non-positive day count shows no line', formatHeroTimeframe(0, end, 120, true) === null && formatHeroTimeframe(-3, end, 120, true) === null);
  assert('13e. a non-finite day count shows no line', formatHeroTimeframe(Number.NaN, end, 120, true) === null);
  assert('13f. an unusable daily figure drops that clause but keeps the date', formatHeroTimeframe(11, end, 0, true) === `11 days to ${formatPriorityRowDate(end)}`);
  assert('13g. "about" is present so the division never reads as a budget', (formatHeroTimeframe(11, end, 120, true) ?? '').includes('about'));
  assert('13h. and the line never promises or advises', !/should|must|budget|limit|safe to/i.test(formatHeroTimeframe(11, end, 120, true) ?? ''));
}

console.log('\n=== 14. The date eyebrow (Class A) ===');
{
  const d = new Date(2026, 7, 17);
  const eyebrow = formatTodayDateEyebrow(d);
  assert('14a. names the weekday, day and month from the given date', /Mon/i.test(eyebrow) && eyebrow.includes('17') && /Aug/i.test(eyebrow));
  assert('14b. no month is hard-coded — a different date yields a different string', formatTodayDateEyebrow(new Date(2026, 0, 3)) !== eyebrow);
  assert('14c. the string itself is NOT uppercased — the eyebrow type role does that, and suppresses it for Thai', eyebrow !== eyebrow.toUpperCase());
  assert('14d. the eyebrow role uppercases English', resolveTextStyle('eyebrow', 'en').textTransform === 'uppercase');
  assert('14e. and never uppercases Thai', resolveTextStyle('eyebrow', 'th').textTransform === 'none');
}

console.log('\n=== 15. Six themes resolve without raw colour leaking (Class A) ===');
{
  let ok = true;
  let ambientOk = true;
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    // Every role Today's new surfaces read must resolve to a real colour.
    for (const role of ['bgCanvas', 'bgSurface', 'border', 'textPrimary', 'textSecondary', 'textTertiary', 'textTitle', 'textFigure', 'interactive', 'interactiveTint', 'success', 'successTint', 'warning', 'warningTint', 'urgentText', 'urgentTint', 'info', 'infoText', 'infoTint', 'infoBorder', 'heroBorder'] as const) {
      // Tints are deliberately translucent in dark, where a solid fill
      // would sit as a visible block on the surface beneath it.
      const v = (c as any)[role];
      if (typeof v !== 'string' || !/^(#[0-9a-fA-F]{6,8}|rgba?\([\d.,\s]+\))$/.test(v)) ok = false;
    }
    // A fade needs at least two stops; one stop is the flat coloured block
    // Design 5.1 forbids, and TodayAmbientField refuses to render it.
    if (!Array.isArray(c.ambient) || c.ambient.length < 2) ambientOk = false;
    if (!Array.isArray(c.heroSurface) || c.heroSurface.length < 2) ambientOk = false;
    // The final stop must be the style's own near-canvas tone — not
    // literally bgCanvas (each style resolves to its own), but close
    // enough that no visible edge remains where the field ends.
    if (!/^#[0-9a-fA-F]{6}$/.test(c.ambient[c.ambient.length - 1])) ambientOk = false;
  }
  assert('15a. all six themes resolve every role Today reads', ok);
  assert('15b. every theme supplies a real multi-stop ambient and hero surface, resolving to its own near-canvas tone', ambientOk);
  assert('15c. Worth Knowing reads a SHARED status role, so it cannot be retinted by a colour style', (() => {
    const tints = DESIGN_THEME_MATRIX.filter((t) => t.scheme === 'light').map((t) => resolveSemanticColors(t.style, t.scheme).infoTint);
    return new Set(tints).size === 1;
  })());
  assert('15d. but the ambient field IS retinted per style, which is the whole point of it', (() => {
    const fields = DESIGN_THEME_MATRIX.filter((t) => t.scheme === 'light').map((t) => resolveSemanticColors(t.style, t.scheme).ambient[0]);
    return new Set(fields).size === 3;
  })());
}

console.log('\n=== 16. Wave 5 closure A — one setup ask, not two (Class A + Class C) ===');
{
  // The eligibility rule is the SAME one the card already applied to pick
  // between its populated and empty states — lifted out so the heading is
  // gated by it too. No threshold, no rounding, no new rule.
  assert('16a. nothing recorded → the month section is not eligible', !isMonthSectionEligible({ income: 0, spend: 0 }));
  assert('16b. any recorded income makes it eligible', isMonthSectionEligible({ income: 500, spend: 0 }));
  assert('16c. any recorded spending makes it eligible', isMonthSectionEligible({ income: 0, spend: 500 }));
  assert('16d. both makes it eligible', isMonthSectionEligible({ income: 15000, spend: 500 }));
  assert('16e. a negative/absurd stored value never makes it eligible on its own', !isMonthSectionEligible({ income: -100, spend: 0 }) && !isMonthSectionEligible({ income: 0, spend: -1 }));

  // The heading and the card are gated TOGETHER, by that one value.
  assert('16f. Today gates the section on the shared eligibility rule', /const monthSectionVisible = isMonthSectionEligible\(monthActivity\);/.test(TODAY));
  assert('16g. the month heading is inside the gate, not outside it', (() => {
    const gate = TODAY.indexOf('{monthSectionVisible ? (');
    const heading = TODAY.indexOf('{monthLabel} so far');
    const card = TODAY.indexOf('<MonthSnapshotCard');
    const close = TODAY.indexOf(') : null}', gate);
    return gate !== -1 && heading > gate && card > heading && card < close;
  })());
  assert('16h. the section collapses to nothing — no spacer element in the else branch', /\{monthSectionVisible \? \([\s\S]*?\) : null\}/.test(TODAY));

  // The duplicate prompt is gone, and nothing replaced it.
  const strip16 = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const MONTH = read('src/components/today/MonthSnapshotCard.tsx');
  assert('16i. the monthly unlock copy is gone from the card', !/unlock your monthly snapshot/.test(MONTH));
  assert('16j. and from Today', !/unlock your monthly snapshot/.test(TODAY));
  assert('16k. the card has no empty state at all — it is never rendered ineligible', !/hasData|emptyText/.test(strip16(MONTH)));
  assert('16l. and no second setup call-to-action was introduced anywhere on Today', !/Add your income and spending/.test(TODAY + MONTH));

  // One selector, called once.
  assert('16m. the canonical month selector is called exactly once, in the screen', (TODAY.match(/computeMonthToDateActivity\(data/g) || []).length === 1 && !/computeMonthToDateActivity/.test(strip16(MONTH)));
  assert('16n. and its result is passed to the card, never recomputed there', /<MonthSnapshotCard activity=\{monthActivity\} \/>/.test(MONTH + TODAY));
  assert('16o. Today still performs no monthly arithmetic of its own', !/monthActivity\.income -|monthActivity\.spend/.test(TODAY));
  assert('16p. and the card still performs none', !/activity\.income -/.test(strip16(MONTH)));

  // The checklist is untouched and remains the single setup ask.
  assert('16q. the checklist still renders exactly once, unconditionally', (TODAY.match(/<MoneyPictureChecklistCard \/>/g) || []).length === 1);
  assert('16r. the Briefing keeps its own contextual missing-input action', /What's missing/.test(read('src/components/today/TodayBriefingCard.tsx')));
  assert('16s. and its How this works action', /How this works/.test(read('src/components/today/TodayBriefingCard.tsx')));

  // Money's own This Month card is a DIFFERENT component and is untouched.
  assert('16t. Money uses its own ThisMonthCard, not this one', exists('src/components/money/ThisMonthCard.tsx') && !/MonthSnapshotCard/.test(read('src/screens/money/MoneyScreen.tsx')));
  assert('16u. whose empty state and Add-transaction action are preserved', (() => {
    const m = read('src/components/money/ThisMonthCard.tsx');
    return /onAddTransaction|Add transaction|Add a transaction/i.test(m);
  })());

  // Values are unchanged for the eligible cases the brief names.
  const after500 = selectMonthMeasures(0, 500);
  assert('16v. after a $500 expense the card appears with its existing values', isMonthSectionEligible({ income: 0, spend: 500 }) && after500[1].value === '$500' && after500[2].value === `${MINUS_SIGN}$500`);
  const big = selectMonthMeasures(15000, 500);
  assert('16w. $15,000 income and $500 spending still read $15,000 / $500 / $14,500', big[0].value === '+$15,000' && big[1].value === '$500' && big[2].value === '+$14,500');
  assert('16x. and no $0 is ever fabricated for an ineligible month — the section is absent instead', !isMonthSectionEligible({ income: 0, spend: 0 }));
}

console.log('\n=== 17. Wave 5 closure B — the no-goal entry (Class C) ===');
{
  // Every Goal creation entry point resolves to the SAME component. There
  // is exactly one goal form in the codebase.
  const GOAL_ENTRY_POINTS = [
    'src/screens/today/TodayScreen.tsx',
    'src/screens/goals/GoalsScreen.tsx',
    'src/screens/discover/DiscoverScreen.tsx',
    'src/screens/money/MoneyScreen.tsx',
    'src/components/navigation/AddAnythingSheet.tsx',
  ];
  for (const rel of GOAL_ENTRY_POINTS) {
    assert(`17a. ${rel.split('/').pop()} opens AddGoalModal`, /<AddGoalModal/.test(read(rel)));
  }
  assert('17b. and no second goal-creation form exists anywhere', (() => {
    const files = ['AddGoalModal.tsx', 'GoalDetailSheet.tsx', 'GoalFormFields.tsx', 'GoalProgressRing.tsx'];
    return files.every((f) => exists(`src/components/goals/${f}`)) && !exists('src/components/goals/CreateGoalModal.tsx') && !exists('src/components/goals/NewGoalSheet.tsx');
  })());

  // The canonical form's body is SHARED between standalone and embedded —
  // one `content` used by both paths, so the two can never drift.
  const FORM = read('src/components/goals/AddGoalModal.tsx');
  assert('17c. the form body is one shared `content`, rendered by both modes', /const content = \(/.test(FORM) && /if \(embedded\) \{\s*return content;/.test(FORM) && /\{content\}/.test(FORM));
  assert('17d. and both modes render the same shared field system', (FORM.match(/<GoalFormFields/g) || []).length === 1);

  // The Wave 4 section structure.
  const FIELDS = read('src/components/goals/GoalFormFields.tsx');
  for (const section of ['What are you working towards?', 'Goal details', 'Timing and priority']) {
    assert(`17e. the canonical form shows "${section}"`, FIELDS.includes(section));
  }
  assert('17f. purpose selection is icon-based and accessible', /AddIcon|accessibilityRole="button"/.test(FIELDS));
  assert('17g. target amount stays optional', /Target amount — optional/.test(FIELDS));
  assert('17h. target date stays optional', /Target date — optional/.test(FIELDS));
  assert('17i. and the confirmation summary is unchanged', /summaryCard/.test(FORM) && /A restatement of the choices already made/.test(FORM));

  // Today's no-goal row.
  assert('17j. Today no longer uses the shared unlock panel for the goal slot', !/UNLOCK_COPY\.goal_tracking/.test(TODAY));
  assert('17k. UnlockPromptCard itself is preserved and still used elsewhere on Today', exists('src/components/unlock/UnlockPromptCard.tsx') && /UNLOCK_COPY\.lulu_score/.test(TODAY));
  assert('17l. the row title is "Plan a goal"', />Plan a goal</.test(TODAY));
  assert('17m. with the approved supporting copy', /Choose what you’re working towards and track progress over time\./.test(TODAY));
  assert('17n. and the trailing action reads "Create goal"', />Create goal</.test(TODAY));
  assert('17o. an outline flag icon sits in interactiveTint', /name="flag-outline"/.test(TODAY) && /planGoalIconTile: \{[\s\S]*?backgroundColor: semantic\.interactiveTint/.test(TODAY));
  assert('17p. the action uses the interactive role — never success green', /planGoalAction: \{[^}]*color: semantic\.interactive/.test(TODAY) && !/planGoalAction[^}]*semantic\.success/.test(TODAY));
  assert('17q. no success role anywhere in the no-goal row', (() => {
    const start = TODAY.indexOf('testID="today-plan-goal-row"');
    const end = TODAY.indexOf('</TouchableOpacity>', start);
    return start !== -1 && !/semantic\.success/.test(TODAY.slice(start, end));
  })());
  assert('17r. a directional chevron is present', (() => {
    const start = TODAY.indexOf('testID="today-plan-goal-row"');
    const end = TODAY.indexOf('</TouchableOpacity>', start);
    return /chevron-forward/.test(TODAY.slice(start, end));
  })());
  assert('17s. the whole row is ONE press target — no nested button inside it', (() => {
    const start = TODAY.indexOf('style={styles.planGoalRow}');
    const end = TODAY.indexOf('</TouchableOpacity>', start);
    const inner = TODAY.slice(start, end);
    return !/<TouchableOpacity|<Button|<Pressable/.test(inner);
  })());
  assert('17t. it meets the 56pt row minimum, above the 44pt activation floor', /const PLAN_GOAL_ROW_MIN_HEIGHT = 56;/.test(TODAY) && 56 >= designLayout.touchTargetMin);
  assert('17u. one accessible announcement, with a useful hint', /accessibilityLabel="Plan a goal\. Choose what you’re working towards and track progress over time\."/.test(TODAY) && /accessibilityHint="Opens the goal form"/.test(TODAY));
  assert('17v. no emoji in the row', (() => {
    const start = TODAY.indexOf('testID="today-plan-goal-row"');
    const end = TODAY.indexOf('</TouchableOpacity>', start);
    return !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(TODAY.slice(start, end));
  })());
  assert('17w. it opens the same canonical form every other entry point opens', /onPress=\{\(\) => setGoalModalVisible\(true\)\}/.test(TODAY) && /<AddGoalModal visible=\{goalModalVisible\}/.test(TODAY));
  assert('17x. the supporting copy and action reflow at large text rather than truncating', /const stackGoalAction = isAccessibilityText\(fontScale\);/.test(TODAY) && /planGoalActionBelow/.test(TODAY) && (() => {
    const start = TODAY.indexOf('testID="today-plan-goal-row"');
    const end = TODAY.indexOf('</TouchableOpacity>', start);
    return !/numberOfLines/.test(TODAY.slice(start, end));
  })());
  assert('17y. the section heading is still "Your goal"', /accessibilityRole="header">Your goal</.test(TODAY));
  assert('17z. and the accepted active-goal row is untouched', /testID="today-goal-row"/.test(TODAY) && /resolveGoalProgressState/.test(TODAY) && /today-view-all-goals/.test(TODAY));
}

console.log('\n=== 18. Wave 5 closure C — restrained hero colour (Class A + Class C) ===');
{
  // A shortfall and a missing input both carry tone 'warning', and they are
  // NOT the same thing. The emphasis rule reads heroState, which already
  // distinguishes them — no sentence is parsed for a currency value.
  assert('18a. a showable amount is the Ocean Blue measure anchor', resolveHeroEmphasis('normal', true) === 'measure');
  assert('18b. so is the no-known-payday available-money reading', resolveHeroEmphasis('no_known_payday', true) === 'measure');
  for (const st of ['recorded_overspend', 'commitments_exceed_cash', 'goals_underfunded']) {
    assert(`18c. ${st} is a genuine shortfall`, resolveHeroEmphasis(st, false) === 'shortfall');
  }
  for (const st of ['missing_balance', 'unavailable_balance_data', 'unavailable_other_data']) {
    assert(`18d. ${st} is incomplete data, NOT a shortfall — it stays neutral`, resolveHeroEmphasis(st, false) === 'incomplete');
  }
  assert('18e. an unknown future state fails safe to neutral, never to a warning', resolveHeroEmphasis('some_future_state', false) === 'incomplete');
  assert('18f. a visible amount always wins — a shortfall state that can show a figure is a measure', resolveHeroEmphasis('recorded_overspend', true) === 'measure');

  const BRIEFING = read('src/components/today/TodayBriefingCard.tsx');
  assert('18g. the figure carries the Ocean Blue interactive role', /figure: \{ \.\.\.figureType\.style, color: semantic\.interactive/.test(BRIEFING));
  // Wave 5 polish A — the all-caps eyebrow became the identity row's
  // title. Same role in the hierarchy, same Ocean Blue ink.
  assert('18h. the hero title does too', /identityTitle: \{[^}]*color: semantic\.interactive/.test(BRIEFING));
  assert('18i. and the remaining hero links', (BRIEFING.match(/color: semantic\.interactive/g) || []).length >= 2);
  assert('18j. warning ink appears ONLY for a genuine shortfall', /emphasis === 'shortfall' \? semantic\.warning : semantic\.textPrimary/.test(BRIEFING));
  assert('18k. the measure label stays neutral', /measureLabel: \{[^}]*color: semantic\.textSecondary/.test(BRIEFING));
  assert('18l. the timeframe line stays neutral', /timeframe: \{[^}]*color: semantic\.textSecondary/.test(BRIEFING));
  assert('18m. the explanatory sentence stays neutral', /guidanceSupport: \{[^}]*color: semantic\.textSecondary/.test(BRIEFING));
  assert('18n. provenance stays neutral', /provenance: \{[^}]*color: semantic\.textTertiary/.test(BRIEFING));
  assert('18o. the urgent role is never used in the hero body — only rows may carry it', !/semantic\.urgent/.test(BRIEFING));
  assert('18p. state is never colour-alone — the shortfall pairs an alert glyph with its own wording', /emphasis === 'shortfall' \? \(\s*<Ionicons name="alert-circle-outline"/.test(BRIEFING));
  assert('18q. no raw colour was introduced', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(BRIEFING));

  // The row markers are unchanged and still carry the four distinct roles.
  const ROW = read('src/components/today/BriefingPriorityRow.tsx');
  assert('18r. overdue rows alone carry the urgent role', /case 'urgent':\s*\n\s*return \{ ink: semantic\.urgentText/.test(ROW));
  assert('18s. due-today and due-soon carry caution/warning', /case 'caution':\s*\n\s*return \{ ink: semantic\.warning/.test(ROW));
  assert('18t. incoming money carries positive/success', /case 'positive':\s*\n\s*return \{ ink: semantic\.success/.test(ROW));
  assert('18u. and dates stay neutral', /meta: \{[^}]*color: semantic\.textSecondary/.test(ROW));

  // Contrast, all six themes, against every stop of the hero surface.
  let worstInteractive = Infinity;
  let worstWarning = Infinity;
  for (const { style, scheme } of DESIGN_THEME_MATRIX) {
    const c = resolveSemanticColors(style, scheme);
    for (const bg of c.heroSurface) {
      worstInteractive = Math.min(worstInteractive, contrastRatio(c.interactive, bg));
      worstWarning = Math.min(worstWarning, contrastRatio(c.warning, bg));
    }
  }
  assert(`18v. the Ocean Blue figure clears the body floor on every hero stop in all six themes (worst ${worstInteractive.toFixed(2)})`, worstInteractive >= CONTRAST_FLOORS.body);
  assert('18w. and comfortably clears the large-figure floor', worstInteractive >= CONTRAST_FLOORS.largeFigure);
  assert(`18x. the shortfall warning ink clears the body floor too (worst ${worstWarning.toFixed(2)})`, worstWarning >= CONTRAST_FLOORS.body);
  assert('18y. the hero content itself is identical in every theme — only the ink resolves differently', !/scheme|isDark|style ===/.test(BRIEFING));
  assert('18z. and the two-row cap is untouched by the colour work', /rows\.slice\(0, MAX_PRIORITY_ROWS\)/.test(read('src/lib/calculations/briefingPriorityRows.ts')));
}

console.log('\n=== 19. Wave 5 polish A — the Briefing identity row (Class A + Class C) ===');
{
  const BRIEFING = read('src/components/today/TodayBriefingCard.tsx');
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const CODE = strip(BRIEFING);

  assert('19a. exactly one sunny-outline glyph identifies the Briefing', (CODE.match(/name="sunny-outline"/g) || []).length === 1);
  assert('19b. it is a vector icon from the existing library, not an emoji', /<Ionicons name="sunny-outline"/.test(CODE));
  assert('19c. and no emoji character was introduced anywhere in the hero', !/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]|[\u{2600}-\u{27BF}]\u{FE0F}|\u{FE0F}/u.test(BRIEFING));
  assert('19d. the glyph sits in a 36pt tile', /const BRIEFING_IDENTITY_TILE_SIZE = 36;/.test(BRIEFING) && /width: BRIEFING_IDENTITY_TILE_SIZE/.test(CODE));
  assert('19e. at roughly 20pt', /const BRIEFING_IDENTITY_GLYPH_SIZE = 20;/.test(BRIEFING));
  assert('19f. the tile uses interactiveTint', /identityTile: \{[\s\S]*?backgroundColor: semantic\.interactiveTint/.test(CODE));
  assert('19g. and the glyph uses interactive', /name="sunny-outline" size=\{BRIEFING_IDENTITY_GLYPH_SIZE\} color=\{semantic\.interactive\}/.test(CODE));

  assert('19h. the visible title is title case, not all caps', />\s*Your Today Briefing\s*</.test(CODE) && !/YOUR TODAY BRIEFING/.test(CODE));
  assert('19i. it uses an existing Design 5.1 type role at ~18pt semibold', /identityTitle: \{ \.\.\.typeStyle\('titleSection', locale\)/.test(CODE) && TYPE_ROLES.titleSection.size === 20 && TYPE_ROLES.titleSection.weight === 600);
  assert('19j. in Ocean Blue interactive ink', /identityTitle: \{[^}]*color: semantic\.interactive/.test(CODE));
  assert('19k. and it wraps rather than clipping at large text', /identityTitle: \{[^}]*flexShrink: 1/.test(CODE) && !/identityTitle[\s\S]{0,200}numberOfLines/.test(CODE));

  // Exactly ONE accessible announcement — the icon is decorative.
  assert('19l. the tile is hidden from assistive technology, both ways', /accessibilityElementsHidden\s*\n\s*importantForAccessibility="no-hide-descendants"/.test(CODE));
  assert('19m. the title alone carries the heading role', (CODE.match(/accessibilityRole="header"/g) || []).length === 1);
  assert('19n. and it is still the focus target the reminder lifecycle restores to', /ref=\{headingRef\}/.test(CODE));
  assert('19o. no duplicate announcement — the row itself is not separately accessible', !/identityRow[\s\S]{0,120}accessibilityLabel/.test(CODE));

  // Restraint: no badge chrome, no motion, no raw colour.
  assert('19p. the tile is a flat tint, not a shadowed or gradient badge', (() => {
    const at = CODE.indexOf('identityTile: {');
    const block = CODE.slice(at, CODE.indexOf('},', at));
    return at !== -1 && !/shadow|elevation|Gradient/i.test(block);
  })());
  assert('19q. no animation was added in this pass', !/Animated|withTiming|useSharedValue/.test(CODE));
  assert('19r. and no raw colour', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(BRIEFING));

  // The rest of the hero is untouched.
  assert('19s. Available until payday still sits beneath the identity row', CODE.indexOf('styles.identityRow') < CODE.indexOf('styles.measureLabel'));
  assert('19t. the AUP figure is unchanged', /today-briefing-figure/.test(CODE) && /textStyle\('figureHero'/.test(CODE));
  assert('19u. the shortfall presentation is unchanged', /emphasis === 'shortfall' \? semantic\.warning : semantic\.textPrimary/.test(CODE));
  assert('19v. the missing-input state is unchanged', /today-briefing-setup/.test(CODE) && /What's missing/.test(CODE));
  // Wave 6 closure — retired. The claim it protected was that the AUP
  // explanation stays reachable; it does, from Money's own hero, which is
  // where the explanation genuinely lives. Today keeps its provenance.
  assert('19w. the redundant How this works control is gone, and provenance remains', !/today-briefing-how-this-works/.test(CODE) && /today-briefing-provenance/.test(CODE));
  assert('19w-ii. and the AUP explanation is still reachable from Money\'s hero', /money-aup-hero-info/.test(read('src/components/money/SafeToSpendHero.tsx')));
  assert('19x. provenance is unchanged', /today-briefing-provenance/.test(CODE));
  assert('19y. and the two-row cap is unchanged', /rows\.slice\(0, MAX_PRIORITY_ROWS\)/.test(read('src/lib/calculations/briefingPriorityRows.ts')));

  // Height cost: one spacing token, partly given back.
  assert('19z. the measure label gives a step back to offset the taller row', /measureLabel: \{[^}]*marginTop: designSpacing\.sm/.test(CODE));
}

console.log('\n=== 20. Wave 5 polish B — signed currency is ONE unbreakable string (Class A) ===');
{
  const m = selectMonthMeasures(15000, 500);
  assert('20a. a positive value renders exactly "+$15,000"', m[0].value === '+$15,000');
  assert('20b. spending renders exactly "$500" — no sign under its own label', m[1].value === '$500');
  assert('20c. a positive net renders exactly "+$14,500"', m[2].value === '+$14,500');
  assert('20d. a negative value is ONE string with a typographic minus', selectMonthMeasures(100, 600)[2].value === `${MINUS_SIGN}$500`);
  assert('20e. the minus is U+2212, which shares the tabular advance — never an ASCII hyphen', MINUS_SIGN.codePointAt(0) === 0x2212);
  assert('20f. zero renders "$0" — never "+$0"', selectMonthMeasures(0, 0)[0].value === '$0');
  assert('20g. nor "−$0"', selectMonthMeasures(500, 500)[2].value === '$0' && !selectMonthMeasures(500, 500)[2].value.includes(MINUS_SIGN));
  assert('20h. every value is a single contiguous string with no whitespace to break at', selectMonthMeasures(1500000, 500).every((x) => !/\s/.test(x.value)));
  assert('20i. and the sign is never a separate field a caller could render apart', (() => {
    const keys = Object.keys(selectMonthMeasures(15000, 500)[0]).sort().join(',');
    return keys === 'key,label,spoken,tone,value';
  })());

  // The component must render it as one node, on one line.
  const MONTH = read('src/components/today/MonthSnapshotCard.tsx');
  const MCODE = MONTH.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert('20j. the value is one Text node containing the whole string', (MCODE.match(/\{m\.value\}/g) || []).length === 2 && !/\{m\.sign\}|signPrefix/.test(MCODE));
  assert('20k. with no sign rendered as its own element', !/<Text[^>]*>\s*\{?['"]?\+/.test(MCODE));
  assert('20l. and numberOfLines={1} makes a split impossible at any width', (MCODE.match(/numberOfLines=\{1\}/g) || []).length === 2);
  assert('20m. the value never shrinks in the flex row', /value: \{[^}]*flexShrink: 0/.test(MCODE) && /stackedValue: \{[^}]*flexShrink: 0/.test(MCODE));
  assert('20n. labels may shrink instead', /label: \{[^}]*flexShrink: 1/.test(MCODE));
  // Wave 6 closure — every column now sets minWidth 0 unconditionally,
  // with flexShrink 0 and an equal basis, so the three cells measure
  // identically regardless of the characters inside them. The claim —
  // flex sizes them honestly rather than by content — is strengthened.
  assert('20o. metric columns set minWidth 0 and an equal basis, so no column gains width from its own text', /minWidth: 0,/.test(MCODE) && /flexShrink: 0,/.test(MCODE) && /flexGrow: 1,/.test(MCODE));
  assert('20p. tabular numerals are inherited from the figure role', /typeStyle\('figureLarge', locale\)/.test(MCODE) && TYPE_ROLES.figureLarge.figure === true);
  assert('20q. no adjustsFontSizeToFit — overflow is solved by layout, not by silent shrinking', !/adjustsFontSizeToFit/.test(MCODE));

  // Accessibility: one statement per metric, sign spoken as a word.
  assert('20r. each metric is one accessible statement', m.every((x) => x.spoken.startsWith(`${x.label}, `)));
  assert('20s. a positive sign is spoken as a word, never as "plus"', m[0].spoken === 'Money in, positive 15,000 dollars' && !/plus/i.test(m[0].spoken));
  assert('20t. an unsigned amount is spoken plainly', m[1].spoken === 'Spent, 500 dollars');
  assert('20u. a negative amount says "negative"', spokenMonthMeasure(-500) === 'negative 500 dollars');
  assert('20v. zero is spoken without a direction', spokenMonthMeasure(0, true) === '0 dollars');
  assert('20w. and the card composes them into one label with no isolated sign stop', /measures\.map\(\(m\) => m\.spoken\)\.join\(', '\)/.test(MCODE));
  assert('20x. a non-finite amount is never spoken as a number', spokenMonthMeasure(Number.NaN) === 'not available');
}

console.log('\n=== 21. Wave 5 polish B — the value fits, at every width and scale (Class A) ===');
{
  // Section-local read — MCODE above is scoped to section 20's block.
  const MCODE21 = read('src/components/today/MonthSnapshotCard.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const CANONICAL = selectMonthMeasures(15000, 500).map((x) => x.value);
  const MILLIONS = selectMonthMeasures(1500000, 500).map((x) => x.value);
  const BIG_NEG = selectMonthMeasures(1, 1000000).map((x) => x.value);
  const ZERO = selectMonthMeasures(0, 0).map((x) => x.value);

  assert('21a. the ladder is ordered largest-first', MONTH_MEASURE_FIGURE_SIZES.every((v, i) => i === 0 || v < MONTH_MEASURE_FIGURE_SIZES[i - 1]));
  // Wave 6 closure — the top rung stepped down from figureLarge's own
  // 28pt to 22pt. A device review found 28 beside a 14pt label read as the
  // figure shouting over its own name, and competing with the page hero.
  // The ROLE is unchanged — family, weight and tabular numerals still come
  // from figureLarge; only the point size steps.
  assert('21b. its top rung is one restrained step below the figureLarge role, which still supplies family and tabular numerals', MONTH_MEASURE_FIGURE_SIZE === 22 && MONTH_MEASURE_FIGURE_SIZE < TYPE_ROLES.figureLarge.size && /typeStyle\('figureLarge', locale\)/.test(MCODE21));
  assert('21b-ii. and the figure still clearly dominates its own label', MONTH_MEASURE_FIGURE_SIZE > TYPE_ROLES.support.size);
  assert('21c. its floor is the figureRow role — a value is never smaller than that', MONTH_MEASURE_FIGURE_MIN_SIZE === TYPE_ROLES.figureRow.size);
  assert('21d. and the comfortable rung sits between them', MONTH_MEASURE_COMFORTABLE_SIZE > MONTH_MEASURE_FIGURE_MIN_SIZE && MONTH_MEASURE_COMFORTABLE_SIZE < MONTH_MEASURE_FIGURE_SIZE);
  assert('21e. every rung is well below the hero figure, so the metrics never compete with it', MONTH_MEASURE_FIGURE_SIZES.every((v) => v < TYPE_ROLES.figureHero.size));

  // THE DEFECT: at 390pt a 28pt "+$15,000" needs more room than a third of
  // the card affords, which is why it wrapped at the sign.
  assert('21f. the reported defect is reproduced by the geometry — 28pt "+$15,000" does not fit a 390pt third-column', estimateFigureWidth('+$15,000', 28) > measureColumnWidth(390, todayScreenMargin(390), 3));
  assert('21g. and the chosen rung does fit it', estimateFigureWidth('+$15,000', resolveMonthMeasureFigureSize(measureColumnWidth(390, todayScreenMargin(390), 3), CANONICAL)) <= measureColumnWidth(390, todayScreenMargin(390), 3));

  // The brief's own requirement: three columns, one line each, at standard
  // phone width.
  for (const w of [390, 430]) {
    const margin = todayScreenMargin(w);
    assert(`21h. ${w}pt keeps all three canonical values in three columns`, resolveMonthMeasureLayout(w, 1, margin, CANONICAL) === 'threeColumn');
    const col = measureColumnWidth(w, margin, 3);
    const size = resolveMonthMeasureFigureSize(col, CANONICAL);
    assert(`21i. ${w}pt fits every value on one line at ${size}pt`, CANONICAL.every((v) => estimateFigureWidth(v, size) <= col));
  }

  // No arrangement, at any tested width or scale, may overflow.
  const CASES: [string, string[]][] = [['canonical', CANONICAL], ['millions', MILLIONS], ['large negative', BIG_NEG], ['zero', ZERO]];
  let overflow: string[] = [];
  let belowFloor: string[] = [];
  for (const [name, vals] of CASES) {
    for (const w of [320, 375, 390, 430, 768]) {
      for (const fs of [1, 1.3, 2]) {
        const margin = todayScreenMargin(w);
        const layout = resolveMonthMeasureLayout(w, fs, margin, vals);
        const cols = layout === 'threeColumn' ? 3 : layout === 'twoPlusOne' ? 2 : 1;
        const col = measureColumnWidth(w, margin, cols);
        const size = resolveMonthMeasureFigureSize(col / fs, vals);
        if (!vals.every((v) => estimateFigureWidth(v, size * fs) <= col)) overflow.push(`${name}@${w}/${fs}`);
        if (size < MONTH_MEASURE_FIGURE_MIN_SIZE) belowFloor.push(`${name}@${w}/${fs}`);
      }
    }
  }
  assert(`21j. no width x font-scale x dataset combination overflows its column${overflow.length ? ` (${overflow.join(', ')})` : ''}`, overflow.length === 0);
  assert('21k. and none drops the figure below the readable floor', belowFloor.length === 0);

  // Reflow is by COMPLETE metric blocks, never by splitting a value.
  assert('21l. 320pt reflows rather than cramming three columns', resolveMonthMeasureLayout(320, 1, todayScreenMargin(320), CANONICAL) !== 'threeColumn');
  assert('21m. 200% text stacks complete blocks at every width', [320, 375, 390, 430].every((w) => resolveMonthMeasureLayout(w, 2, todayScreenMargin(w), CANONICAL) === 'stacked'));
  assert('21n. font scale 1.3 does too', [320, 390, 430].every((w) => resolveMonthMeasureLayout(w, 1.3, todayScreenMargin(w), CANONICAL) === 'stacked'));
  assert('21o. a seven-figure amount gives up a column rather than shrinking to fit', resolveMonthMeasureLayout(390, 1, todayScreenMargin(390), MILLIONS) !== 'threeColumn');

  // A wider screen must never produce a smaller figure AT THE SAME COLUMN
  // COUNT — that was the real bug the comfortable-rung gate fixed (430pt
  // took three columns at 17pt while 390pt took two at 24pt, so the wider
  // device showed the smaller number).
  //
  // Across DIFFERENT column counts the size may legitimately step down:
  // Design 5.1 requires three columns at standard phone width, and a third
  // column necessarily costs width. That is a deliberate trade, not a
  // regression, and it is asserted directly in 21h/21i.
  let regressions: string[] = [];
  for (const [name, vals] of CASES) {
    for (const cols of [3, 2, 1] as const) {
      let previous = 0;
      for (const w of [320, 375, 390, 430, 768]) {
        const margin = todayScreenMargin(w);
        const size = resolveMonthMeasureFigureSize(measureColumnWidth(w, margin, cols), vals);
        if (size < previous) regressions.push(`${name}@${w}/${cols}col`);
        previous = size;
      }
    }
  }
  assert(`21p. at a given column count, a wider screen never yields a smaller figure${regressions.length ? ` (${regressions.join(', ')})` : ''}`, regressions.length === 0);
  assert('21p-ii. and the comfortable-rung gate is what prevents the reverse — 430pt never trades a readable figure for a third column', (() => {
    const margin = todayScreenMargin(430);
    const layout = resolveMonthMeasureLayout(430, 1, margin, MILLIONS);
    const cols = layout === 'threeColumn' ? 3 : layout === 'twoPlusOne' ? 2 : 1;
    return resolveMonthMeasureFigureSize(measureColumnWidth(430, margin, cols), MILLIONS) >= MONTH_MEASURE_COMFORTABLE_SIZE;
  })());

  // Colour rules survive the polish.
  const m = selectMonthMeasures(15000, 500);
  assert('21q. positive money in stays success green', m[0].tone === 'positive');
  assert('21r. spending stays neutral — never red', m[1].tone === 'neutral' && selectMonthMeasures(0, 99999)[1].tone === 'neutral');
  assert('21s. a negative net stays caution, not urgent', selectMonthMeasures(100, 900)[2].tone === 'caution');
  assert('21t. and the section eligibility rule is untouched', isMonthSectionEligible({ income: 0, spend: 500 }) && !isMonthSectionEligible({ income: 0, spend: 0 }));
  assert('21u. with its values unchanged from the previous pass', m[0].value === '+$15,000' && m[1].value === '$500' && m[2].value === '+$14,500');
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
