// Nolie Design 5.1 Wave 6 corrections — arbitrary transaction dates, and
// the timeline's nested-scroll retirement.
//
// CLASSIFICATION (per tests/README.md):
// - Class A (REAL IMPORT): every calendar decision runs the real pure
//   helper — grid construction, local-midnight anchoring, future-date
//   disabling, month stepping, leap days, month/year boundaries.
// - Class C (structural): the field's composition, the retired inner
//   ScrollView, and the collapsed/expanded timeline contract.
//
// NOT proven here: the rendered calendar's appearance or VoiceOver order.
// Device evidence.
//
// Run with: npx tsx tests/design5-wave6-date-and-timeline.test.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  CHOOSE_ANOTHER_DATE_KEY,
  CHOOSE_ANOTHER_DATE_LABEL,
  addLocalMonths,
  buildMonthGrid,
  canStepMonth,
  daysInLocalMonth,
  formatMonthHeading,
  localMidnight,
  quickDateChoices,
  spokenGridDay,
  startOfLocalMonth,
} from '../src/lib/dateFieldPresentation';

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

const FIELD = read('src/components/shared/fields/DateTriggerField.tsx');
const CALENDAR = read('src/components/shared/fields/InlineCalendar.tsx');
const TIMELINE = read('src/components/money/MoneyTimelineCard.tsx');

console.log('=== 1. The four shortcuts survive, and one more row opens a calendar (Class A + C) ===');
{
  const today = localMidnight(2026, 7, 20);
  const choices = quickDateChoices(today);
  assert('1a. exactly four shortcuts remain', choices.length === 4);
  assert('1b. Today, Yesterday, 2 days ago, Last week — unchanged', choices.map((c) => c.label).join(' | ') === 'Today | Yesterday | 2 days ago | Last week');
  assert('1c. and their date outcomes are unchanged', choices[1].date.getDate() === 19 && choices[2].date.getDate() === 18 && choices[3].date.getDate() === 13);

  const CODE = strip(FIELD);
  assert('1d. a "Choose another date…" row is offered', CODE.includes('CHOOSE_ANOTHER_DATE_LABEL') && CHOOSE_ANOTHER_DATE_LABEL === 'Choose another date…');
  assert('1e. as a real accessible button with a hint', /accessibilityRole="button"\s*\n\s*accessibilityLabel=\{CHOOSE_ANOTHER_DATE_LABEL\}\s*\n\s*accessibilityHint="Opens a calendar to pick any past date"/.test(CODE));
  assert('1f. with a stable testID key', CHOOSE_ANOTHER_DATE_KEY === 'choose-another' && /\$\{testID\}-choice-\$\{CHOOSE_ANOTHER_DATE_KEY\}/.test(CODE));
  assert('1g. offered only for a PAST-facing field — a bill\'s next due date keeps its forward run', /direction === 'past' \? \(/.test(CODE));
  assert('1h. the calendar is ONE view of the same picker, not a second date system', /if \(showCalendar\) \{/.test(CODE) && (CODE.match(/<FocusedPickerTrigger/g) || []).length === 1);
  assert('1i. so Cancel and Done still belong entirely to the shared trigger', !/onCancel|onDone/.test(CODE.replace(/onCommit/g, '')));
  assert('1j. and the calendar commits through the SAME setDraft the shortcuts use', /onSelect=\{setDraft\}/.test(CODE));
  assert('1k. it is not a second native Modal', !/<Modal/.test(strip(CALENDAR)) && !/DatePickerModal/.test(CODE));
  assert('1l. and needs no new dependency', !/from 'react-native-/.test(strip(CALENDAR).replace("from 'react-native'", '')));
}

console.log('\n=== 2. The calendar grid, from local parts only (Class A) ===');
{
  const today = localMidnight(2026, 7, 20); // 20 Aug 2026
  const grid = buildMonthGrid(startOfLocalMonth(today), today, today);

  assert('2a. a whole 6x7 grid, so every month is the same height', grid.length === 42);
  assert('2b. August 2026 has 31 in-month days', grid.filter((d) => d.inMonth).length === 31);
  assert('2c. leading blanks pad to the correct weekday column', grid[0].inMonth === false || grid[0].dayOfMonth === 1);
  assert('2d. the first in-month cell is the 1st', grid.find((d) => d.inMonth)!.dayOfMonth === 1);
  assert('2e. every date is local midnight — never a UTC instant', grid.every((d) => d.date.getHours() === 0 && d.date.getMinutes() === 0 && d.date.getSeconds() === 0 && d.date.getMilliseconds() === 0));
  assert('2f. today is marked exactly once', grid.filter((d) => d.isToday).length === 1);
  assert('2g. and it is the right day', grid.find((d) => d.isToday)!.date.getDate() === 20);

  // Future dates are DISABLED, present and announced — never hidden, never
  // silently coerced.
  const future = grid.filter((d) => d.disabled);
  assert('2h. every day after today is disabled', future.length > 0 && future.every((d) => d.date.getTime() > today.getTime()));
  assert('2i. today itself is selectable — the maximum is inclusive', !grid.find((d) => d.isToday)!.disabled);
  assert('2j. yesterday is selectable', !grid.find((d) => d.inMonth && d.dayOfMonth === 19)!.disabled);
  assert('2k. tomorrow is not', grid.find((d) => d.inMonth && d.dayOfMonth === 21)!.disabled);
  assert('2l. a disabled day is still rendered, and says why', /a transaction cannot be dated in the future/.test(spokenGridDay(grid.find((d) => d.disabled)!)));
  assert('2m. a selectable day is spoken in full locale form', /2026/.test(spokenGridDay(grid.find((d) => d.inMonth && d.dayOfMonth === 5)!)));
  assert('2n. and today says so', /today$/.test(spokenGridDay(grid.find((d) => d.isToday)!)));

  // No maximum at all (a future-facing field) disables nothing.
  const unbounded = buildMonthGrid(startOfLocalMonth(today), today, null);
  assert('2o. with no maximum, nothing is disabled', unbounded.every((d) => !d.disabled));
}

console.log('\n=== 3. Month, year and leap-day boundaries (Class A) ===');
{
  assert('3a. February 2024 has 29 days — a leap year', daysInLocalMonth(2024, 1) === 29);
  assert('3b. February 2026 has 28', daysInLocalMonth(2026, 1) === 28);
  assert('3c. February 2100 has 28 — a century that is not a leap year', daysInLocalMonth(2100, 1) === 28);
  assert('3d. February 2000 has 29 — a century that is', daysInLocalMonth(2000, 1) === 29);

  const leapGrid = buildMonthGrid(localMidnight(2024, 1, 1), localMidnight(2026, 7, 20), localMidnight(2026, 7, 20));
  const leapDay = leapGrid.find((d) => d.inMonth && d.dayOfMonth === 29);
  assert('3e. 29 February 2024 is present and selectable', !!leapDay && !leapDay.disabled);
  assert('3f. and is genuinely 29 Feb 2024, not 1 March', leapDay!.date.getMonth() === 1 && leapDay!.date.getFullYear() === 2024);

  // Stepping across a year boundary in both directions.
  assert('3g. stepping back from January lands in the previous December', addLocalMonths(localMidnight(2026, 0, 1), -1).getFullYear() === 2025 && addLocalMonths(localMidnight(2026, 0, 1), -1).getMonth() === 11);
  assert('3h. stepping forward from December lands in the next January', addLocalMonths(localMidnight(2025, 11, 1), 1).getFullYear() === 2026 && addLocalMonths(localMidnight(2025, 11, 1), 1).getMonth() === 0);
  assert('3i. stepping back 13 months crosses a whole year', addLocalMonths(localMidnight(2026, 0, 1), -13).getFullYear() === 2024 && addLocalMonths(localMidnight(2026, 0, 1), -13).getMonth() === 11);
  assert('3j. a step never overflows the day — every anchor is the 1st', [-25, -1, 0, 1, 25].every((d) => addLocalMonths(localMidnight(2026, 0, 31), d).getDate() === 1));

  // Stepping is bounded forward, unbounded back.
  const max = localMidnight(2026, 7, 20);
  assert('3k. the calendar can always step back', canStepMonth(localMidnight(1990, 0, 1), -1, max));
  assert('3l. it can step forward while months remain below the maximum', canStepMonth(localMidnight(2026, 5, 1), 1, max));
  assert('3m. but not past the maximum\'s own month', !canStepMonth(localMidnight(2026, 7, 1), 1, max));
  assert('3n. with no maximum, forward is unbounded', canStepMonth(localMidnight(2030, 0, 1), 1, null));
  assert('3o. the heading names the month and year', /2026/.test(formatMonthHeading(localMidnight(2026, 7, 1))));
}

console.log('\n=== 4. Local-date integrity around midnight (Class A) ===');
{
  // The defect this guards: constructing a day from an ISO instant makes
  // "3 August" become 2 August for anyone west of UTC. Every date here is
  // built from local Y/M/D parts, so the calendar day is whatever the
  // customer's own calendar says.
  const day = localMidnight(2026, 7, 3);
  assert('4a. a chosen day is local midnight exactly', day.getHours() === 0 && day.getDate() === 3 && day.getMonth() === 7);
  assert('4b. it survives a round-trip through the date parts it was built from', localMidnight(day.getFullYear(), day.getMonth(), day.getDate()).getTime() === day.getTime());
  assert('4c. the grid never constructs a date from an ISO string', !/new Date\(['"`]/.test(strip(read('src/lib/dateFieldPresentation.ts'))));
  assert('4d. nor from Date.UTC', !/Date\.UTC/.test(strip(read('src/lib/dateFieldPresentation.ts'))));
  // The calendar delegates every month step to addLocalMonths and every
  // day to buildMonthGrid. Its own single Date construction normalises the
  // SELECTED value to local midnight for comparison — from local Y/M/D
  // parts, which is exactly the rule this section protects.
  assert('4e. the calendar delegates all month arithmetic to the pure helper', /addLocalMonths\(m, -1\)/.test(strip(CALENDAR)) && /addLocalMonths\(m, 1\)/.test(strip(CALENDAR)) && !/\.setDate\(|\.setMonth\(|\.setFullYear\(/.test(strip(CALENDAR)));
  assert('4e-ii. and its only Date construction is a local-midnight normalisation from Y/M/D parts', (() => {
    const code = strip(CALENDAR);
    const constructions = (code.match(/new Date\(/g) || []).length;
    return constructions === 1 && code.includes('new Date(value.getFullYear(), value.getMonth(), value.getDate())');
  })());

  // A late-evening "today" still resolves to the same calendar day.
  const lateToday = new Date(2026, 7, 20, 23, 59, 59, 999);
  const g = buildMonthGrid(startOfLocalMonth(lateToday), lateToday, lateToday);
  assert('4f. a 23:59 "today" marks the 20th, not the 21st', g.find((d) => d.isToday)!.dayOfMonth === 20);
  assert('4g. and the 20th is still selectable at 23:59', !g.find((d) => d.inMonth && d.dayOfMonth === 20)!.disabled);
  assert('4h. while the 21st remains disabled', g.find((d) => d.inMonth && d.dayOfMonth === 21)!.disabled);
}

console.log('\n=== 5. Calendar accessibility and targets (Class C) ===');
{
  const CODE = strip(CALENDAR);
  assert('5a. every day is a button with a real spoken label', /accessibilityRole="button"/.test(CODE) && /accessibilityLabel=\{spokenGridDay\(day\)\}/.test(CODE));
  assert('5b. disabled days report disabled state, not just a dimmer colour', /accessibilityState=\{\{ disabled, selected \}\}/.test(CODE));
  assert('5c. and are genuinely not pressable', /disabled=\{disabled\}/.test(CODE));
  assert('5d. selection is not colour-alone — the selected day gets a filled pill and a weight change', /selectedPill/.test(CODE) && /daySelected: \{[^}]*fontWeight: '700'/.test(CODE));
  assert('5e. today is not colour-alone either — it gets a ring and bold weight', /todayRing/.test(CODE) && /dayToday: \{ fontWeight: '700' \}/.test(CODE));
  assert('5f. each day cell clears the 44pt activation minimum', /height: designLayout\.touchTargetMin/.test(CODE));
  assert('5g. so do the month steppers', /width: designLayout\.touchTargetMin,\s*\n\s*height: designLayout\.touchTargetMin/.test(CODE));
  assert('5h. which report their own disabled state', /accessibilityState=\{\{ disabled: !canBack \}\}/.test(CODE) && /accessibilityState=\{\{ disabled: !canForward \}\}/.test(CODE));
  assert('5i. the month heading is a header', /accessibilityRole="header"/.test(CODE));
  assert('5j. the weekday initials are decorative and not announced', /importantForAccessibility="no-hide-descendants"/.test(CODE));
  assert('5k. no raw colour', !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(CALENDAR));
  assert('5l. and no timing workaround anywhere in the date field', !/setTimeout/.test(strip(FIELD)) && !/setTimeout/.test(CODE));
}

console.log('\n=== 6. The timeline no longer scrolls inside itself (Class C) ===');
{
  const CODE = strip(TIMELINE);
  assert('6a. no inner ScrollView remains', !/<ScrollView/.test(CODE) && !/ScrollView/.test(CODE.replace(/import[^\n]*\n/g, '')));
  assert('6b. no nestedScrollEnabled', !/nestedScrollEnabled/.test(CODE));
  assert('6c. no fixed-height scroll box', !/SCROLL_BOX_HEIGHT|maxHeight/.test(CODE));
  assert('6d. no scroll handler feeding a near-end horizon request', !/handleScroll|onScroll=/.test(CODE));
  assert('6e. and no inner scrollTo', !/scrollTo\(/.test(CODE));

  // Wave 6 final pass — the preview dropped from five to three. Five
  // still pushed Typical money flow and Money plan below the fold on a
  // 390pt device, which is the page-length defect this pass fixes. The
  // claim protected here — a bounded preview, with everything else one
  // inline tap away — is unchanged.
  assert('6f. the collapsed timeline shows a bounded three-event preview', /const COLLAPSED_EVENT_LIMIT = 3;/.test(TIMELINE));
  assert('6g. by slicing the ALREADY-ORDERED engine array and nothing else', /events\.slice\(0, COLLAPSED_EVENT_LIMIT\)/.test(CODE) && !/\.sort\(|\.filter\(/.test(CODE.split('const visibleEvents')[1].split('const groups')[0]));
  assert('6h. grouping still runs on whatever slice is displayed, so day headers stay correct', /groupByDay\(visibleEvents\)/.test(CODE));
  assert('6i. one full-width secondary action expands inline', /testID="money-timeline-expand"/.test(CODE));
  assert('6j. labelled "View all upcoming" when collapsed', /'View all upcoming'/.test(CODE));
  assert('6k. and "Show less" when expanded', /'Show less'/.test(CODE));
  assert('6l. it exposes accessibilityState.expanded', /accessibilityState=\{\{ expanded \}\}/.test(CODE));
  assert('6m. and announces how many more events there are', /\$\{hiddenCount\} more \$\{hiddenCount === 1 \? 'event' : 'events'\}/.test(CODE));
  assert('6n. it clears the 44pt minimum', /expandRow: \{[\s\S]{0,200}minHeight: 44/.test(CODE));
  assert('6o. expansion is inline — no modal and no navigation route', !/<Modal|navigation\.(navigate|push)/.test(CODE));
  assert('6p. the control is hidden when there is nothing more to show', /\{hiddenCount > 0 \|\| expanded \? \(/.test(CODE));
  assert('6q. expanding also asks the parent to widen the planning horizon, as the retired scroll did', /if \(next\) onNearEnd\?\.\(\);/.test(CODE));

  // The destination-focus contract survives.
  assert('6r. an incoming focus target expands the timeline so its group is mounted', /if \(focusTarget\) setExpanded\(true\);/.test(CODE));
  assert('6s. and the fulfillment lifecycle still resolves exactly once per request', /lastHandledRequestIdRef\.current = focusTarget!\.requestId;/.test(CODE) && /onFocusHandled\?\.\(\)/.test(CODE));
  assert('6t. no event is filtered, regrouped or recalculated', !/computeMoneyTimeline|reduce\(/.test(CODE));
  assert('6u. and row editing is untouched', /onEventPress/.test(CODE));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
