// Today setup-checklist priority — owner fresh-device correction.
//
// DEFECT: after onboarding, "Great start! Let's build your money picture"
// rendered inside the trailing group, below the briefing, journey, month
// snapshot, goal and Score prompts. A brand-new customer had to scroll past
// everything to reach the one thing they were meant to do next.
//
// NOT caused by Wave 2: TodayScreen.tsx is untouched by the Wave 2 diff.
// Introduced by Pass 2D (6762c3f), which removed the card from its former
// third position and re-added it at the bottom.
//
// CLASSIFICATION (per tests/README.md):
// - Structural (Class C): TodayScreen.tsx and MoneyPictureChecklistCard.tsx
//   both import react-native and cannot be executed by this tsx harness, so
//   ordering and preservation are verified by matching the real shipped
//   source. This proves WIRING and ORDER, not rendered runtime.
// - Rendered behaviour (mount, dismissal, row taps) remains covered by the
//   existing rendered Today suites, which are unchanged and still green.
//
// Run with: ./node_modules/.bin/tsx tests/design5-today-checklist-priority.test.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const root = path.resolve(__dirname, '..');
const TODAY = fs.readFileSync(path.join(root, 'src/screens/today/TodayScreen.tsx'), 'utf8');
const CARD = fs.readFileSync(path.join(root, 'src/components/today/MoneyPictureChecklistCard.tsx'), 'utf8');

const at = (needle: string) => TODAY.indexOf(needle);

console.log('=== 1. Fresh / incomplete setup: the checklist is FIRST and rendered ONCE ===');
{
  const occurrences = TODAY.split('<MoneyPictureChecklistCard').length - 1;
  assert('1a. checklist is rendered exactly once — no duplicate', occurrences === 1);

  const checklist = at('<MoneyPictureChecklistCard />');
  const GREETING_ANCHOR = '<Text style={styles.greeting} testID="today-greeting">{greeting}</Text>';
  const greeting = at(GREETING_ANCHOR);
  assert('1b. checklist appears after the greeting/header', greeting !== -1 && checklist > greeting);
  // Wave 5 — the local date eyebrow precedes the greeting inside the same
  // header block; the checklist still follows the whole block.
  assert('1b-ii. and after the local date eyebrow that now precedes the greeting', at('today-date-eyebrow') !== -1 && at('today-date-eyebrow') < greeting);

  for (const [label, marker] of [
    ['Today Briefing', '<TodayBriefingCard'],
    ['Journey snapshot', '<TodayJourneySnapshotCard'],
    ['month snapshot', '<MonthSnapshotCard'],
    ['goal section header', 'accessibilityRole="header">Your goal<'],
    // RECONCILED — Wave 9c closure, Correction F: the Score-unlock prompt
    // was retired from Today, so there is nothing to order against; its
    // absence is asserted separately below (1c-i).
    ['loan balance reminder', '<LoanBalanceReminderCard'],
  ] as const) {
    const other = at(marker);
    assert(`1c. checklist precedes ${label}`, other !== -1 && checklist < other);
  }
  assert('1c-i. the legacy Score-unlock prompt is gone from Today', !/UnlockPromptCard|UNLOCK_COPY/.test(TODAY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')));

  // Nothing scrollable may sit between the greeting and the checklist.
  // Slice AFTER the greeting element itself, otherwise the anchor matches.
  const greetingEnd = greeting + GREETING_ANCHOR.length;
  // The header block's own closing tag is not scrollable content; strip
  // comments and closing tags before looking for any real element.
  const between = TODAY.slice(greetingEnd, checklist).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<\/[A-Za-z]+>/g, '');
  assert('1d. only a comment separates the greeting from the checklist (visible without scrolling)', !/<[A-Z][A-Za-z]*/.test(between));
}

console.log('\n=== 2. Partial setup: progress and next-missing-step logic untouched ===');
{
  assert('2a. steps are still derived in the card, not in Today', /const steps/.test(CARD) && !/const steps/.test(TODAY));
  assert('2b. completedCount is still derived from the steps', /completedCount = steps\.filter\(\(s\) => s\.done\)\.length/.test(CARD));
  assert('2c. progress is still completedCount / steps.length', /progress=\{completedCount \/ steps\.length\}/.test(CARD));
  assert('2d. Today passes no props that could override progress', /<MoneyPictureChecklistCard \/>/.test(TODAY));
}

console.log('\n=== 3. Completed setup: the checklist disappears by its own rule ===');
{
  // -------------------------------------------------------------------
  // RECONCILED — Wave 9c final correction pass, Correction C.
  // SUPERSEDED: 3a required `allDone` to make the card return null (the
  // auto-dismiss-on-completion guard).
  // WHY: the accepted correction replaces silent disappearance with a calm
  // "Setup complete" state the CUSTOMER closes — no timer, no
  // auto-dismissal. Dismissal itself still hides the card permanently.
  // PRESERVED INTENT: completion is still terminal and still derived from
  // the same real step state; only who performs the dismissal changed.
  // -------------------------------------------------------------------
  assert('3a. a dismissed card is gone for good', /if \(data\.user\.moneyPictureChecklistDismissed\) return null;/.test(CARD));
  assert('3a-i. completion renders the calm state, never a timer', /Setup complete/.test(CARD) && !/setTimeout/.test(CARD));
  assert('3a-ii. the customer closes it themselves', /checklist-complete-close/.test(CARD) && /checklist-complete-done/.test(CARD));
  assert('3b. allDone still means every step done', /allDone = completedCount === steps\.length/.test(CARD));
  // Because the guard lives in the card, a completed user's Today is
  // identical to before: the card returns null wherever it is placed.
  assert('3c. Today does not gate the card itself — no new conditional wrapper', !/\{[^}]*\?\s*<MoneyPictureChecklistCard/.test(TODAY));
}

console.log('\n=== 4. Dismissal remains intact and is not made unavoidable ===');
{
  assert('4a. dismissal flag is still read', /data\.user\.moneyPictureChecklistDismissed/.test(CARD));
  assert('4b. dismissal is still writable from the card', /moneyPictureChecklistDismissed: true/.test(CARD));
  // Today does read the flag, but only for a pre-existing score-milestone
  // baseline effect that predates this correction — never to gate the card.
  assert('4c. Today never gates the checklist on the dismissal flag', !/moneyPictureChecklistDismissed[^\n]*MoneyPictureChecklistCard/.test(TODAY));
  assert('4d. the pre-existing score-milestone baseline effect is preserved', /if \(!data\.user\.moneyPictureChecklistDismissed \|\| data\.user\.scoreMilestoneBaselineSet\) return;/.test(TODAY));
}

console.log('\n=== 5. Row actions still open their existing Add destinations ===');
{
  // RECONCILED — Wave 9c. OLD CLAUSE: the list included EditProfileModal,
  // because the goal row used to open the PROFILE editor. SUPERSEDED
  // BECAUSE Wave 9b removed that editor's money-goal control, leaving the
  // row opening a modal that could no longer complete it; Wave 9c points
  // the row at the CANONICAL goal editor (AddGoalModal) and resolves
  // completion from the real goal collection. PRESERVED INTENT: every row
  // still opens its existing Add destination — asserted for all four.
  // RECONCILED — Wave 9c closure, Correction E. OLD CLAUSE listed the three
  // standalone child modals (AddIncomeModal / AddWealthItemModal /
  // AddRecurringItemModal). SUPERSEDED BECAUSE those were the second half of
  // the two-native-modal chain behind the recording's visible double
  // handoff: OptionsSheet teaser closes fully (Today flashes), THEN a
  // second modal opens. Rows now open the ONE canonical AddAnythingSheet
  // workspace directly at their destination — the same single-transition
  // authority the "+" tray uses. PRESERVED INTENT: every row still opens an
  // existing canonical Add journey, owned by the card.
  for (const dest of ['AddGoalModal', 'DebtCoachSheet', 'AddAnythingSheet']) {
    assert(`5. ${dest} still mounted by the checklist card`, CARD.includes(`<${dest}`));
  }
  assert('5-a. the teaser sheets are gone — no second native modal remains', !/OptionsSheet/.test(CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')));
  // RECONCILED — Wave 9c visual/checklist correction: the asset row now
  // enters the workspace at the checklist-only 'vehicle' kind (canonical
  // 'car' preset, changeable in the form), and the new Everyday row enters
  // at the canonical 'everyday' kind. Same single-workspace architecture.
  assert('5-b. rows enter the workspace at their own destination', /setWorkspaceKind\('income'\)/.test(CARD) && /setWorkspaceKind\('bill'\)/.test(CARD) && /setWorkspaceKind\('vehicle'\)/.test(CARD) && /setWorkspaceKind\('savings'\)/.test(CARD) && /setWorkspaceKind\('everyday'\)/.test(CARD));
  assert('5-c. exactly one workspace host with one close path', (CARD.match(/<AddAnythingSheet/g) || []).length === 1 && /onClose=\{\(\) => setWorkspaceKind\(null\)\}/.test(CARD));
  assert('5-i. the goal row resolves from the REAL goal collection', /const hasGoal = data\.goals\.length > 0;/.test(CARD) && /done: hasGoal \|\| !!data\.user\.confirmedGoalLater/.test(CARD));
  assert('5-ii. never the retired profile enum', !/user\.moneyGoal/.test(CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')));
  // RECONCILED with the workspace routing above: the savings/investment
  // destinations are now the workspace's own canonical kinds rather than
  // standalone preset modals.
  assert('5e. savings destination preserved via the workspace', /setWorkspaceKind\('savings'\)/.test(CARD));
  // RECONCILED — Wave 9c visual/checklist correction (Correction F): the
  // checklist's asset row now opens the workspace's checklist-only
  // 'vehicle' kind (canonical 'car' preset, changeable in the same form,
  // every category still reachable). The global "+" tray's investment tile
  // is untouched.
  assert('5f. asset destination preserved via the workspace (vehicle preset)', /setWorkspaceKind\('vehicle'\)/.test(CARD));
}

console.log('\n=== 6. Returning from an Add task preserves the card and its position ===');
{
  // The card owns its own modals, so an Add round-trip never unmounts or
  // repositions it; Today re-renders it in the same place from the same
  // single call site.
  assert('6a. the card owns its Add journeys (no Today-level handoff)', /visible=\{workspaceKind !== null\}/.test(CARD) && /visible=\{goalModalVisible\}/.test(CARD));
  assert('6b. Today still has exactly one call site after the greeting', (TODAY.split('<MoneyPictureChecklistCard').length - 1) === 1);
}

console.log('\n=== 7. No fabricated financial zero introduced ===');
{
  assert('7a. the correction added no numeric literal to Today', !/<MoneyPictureChecklistCard[^/]*\d/.test(TODAY));
  assert('7b. the card still shows step progress, not a money figure', !/\$0|formatMoney\(0\)/.test(CARD));
}

console.log('\n=== 8. Screen-reader order follows visual order ===');
{
  // RN traversal follows JSX order, so the source order IS the spoken order.
  const greeting = at('<Text style={styles.greeting} testID="today-greeting">{greeting}</Text>');
  const checklist = at('<MoneyPictureChecklistCard />');
  const briefing = at('<TodayBriefingCard');
  assert('8a. spoken order is date eyebrow -> greeting -> checklist -> briefing', at('today-date-eyebrow') < greeting && greeting > 0 && greeting < checklist && checklist < briefing);
  assert('8b. the settings control remains the last header element', at('settings-outline') < greeting);
  // RECONCILED — Wave 9c final correction pass, Correction C: the progress
  // wording is now "{n} of {m} complete" (a deferred optional goal is
  // complete without anything being ADDED, so "added" was untruthful).
  // The label itself — same interpolation, same live counts — survives.
  assert('8c. checklist progress still exposes an accessibility label', /accessibilityLabel=\{`\$\{completedCount\} of \$\{steps\.length\} complete`\}/.test(CARD));
  assert('8d. checklist rows still expose their own labels', /accessibilityLabel=\{`\$\{s\.title\}\. \$\{s\.status\}`\}/.test(CARD));
}

console.log('\n=== 9. Position-only: no calculation, persistence or hierarchy change ===');
{
  assert('9a. trailing group still renders the remaining late card', /<LoanBalanceReminderCard \/>/.test(TODAY));
  assert('9b. briefing/journey/month order unchanged relative to each other', at('<TodayBriefingCard') < at('<TodayJourneySnapshotCard') && at('<TodayJourneySnapshotCard') < at('<MonthSnapshotCard'));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
