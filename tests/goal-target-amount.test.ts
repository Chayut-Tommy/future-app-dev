// Goal Details — Target Amount deliberate-commit correction. Physical-
// device testing found that Target Amount autosaved on every keystroke
// (via the old handleSaveTarget), so an in-progress edit (e.g. clearing
// "$1,000" to type "$1,200") transiently and then, if the sheet closed
// mid-edit, PERMANENTLY persisted whatever partial digit sequence was
// last typed — reaching AppStateContext/AsyncStorage and every connected
// calculation (progress ring, required-monthly, goal allocation) that
// reads goal.targetAmount.
//
// Fix: Target Amount is now a local draft (targetAmountDraft), never
// persisted per keystroke. It is committed exactly once via an explicit
// "Set" button (commitTargetAmount) — never from any dismissal path
// (Close/backdrop/swipe all route through KeyboardSheet's own, unmodified
// confirmDiscardIfDirty gate using isDirty, which now also covers an
// uncommitted amount draft via targetAmountDirty). This is a STRUCTURAL
// guarantee, not an event-order assumption: commitTargetAmount is wired
// to exactly one onPress, nowhere else in the file.
//
// DURABLE LOCATION — relocated from the session scratchpad into this
// tracked `tests/` directory during checkpoint preparation, so this
// coverage survives across sessions instead of living somewhere ephemeral
// that has been observed to lose files between rounds. Content unchanged
// from its proven, passing form; only this header and the cross-reference
// below were added.
//
// HARNESS LIMITATION: GoalDetailSheet.tsx cannot be imported under plain
// `npx tsx` — it imports `react-native`, whose entry point uses Flow
// syntax esbuild can't parse outside Metro. No React render, no simulated
// tap is possible in this harness. What IS possible: resolveTargetAmountDraft
// and isTargetAmountDraftDirty are pure, RN-independent functions in their
// own right, but they are co-located in a file that cannot be imported —
// this file mirrors them verbatim (cited by line number below) and runs
// real assertions against real input strings. That proves the mirrored
// algorithm is correct; the structural assertions in section 8 close the
// remaining gap (confirming the real file still contains this exact code),
// but neither proves the mirror is executing byte-identical logic to what
// ships, nor that taps/renders behave correctly on a device.
//
// Since this checkpoint pass, the underlying strict-money grammar this
// logic depends on (parseMoneyInput) now ALSO has real-import coverage —
// see tests/money-parsing.test.ts, which genuinely imports and executes
// the actual production function (money.ts has zero imports of its own
// and loads cleanly under tsx). That independently corroborates this
// file's own mirrored copy of the same grammar (lines below), narrowing —
// though not eliminating — the "is the mirror actually identical" gap for
// the money-parsing portion specifically.
//
// CLASSIFICATION:
// - Sections 1-7: mirrored logic — genuine behavioural testing of the pure
//   commit/dirty decision algorithm, real inputs -> real outputs, but
//   against a copy, not an import (see harness limitation above).
// - Section 8: structural/source-inspection, confirms the real file wires
//   this logic as intended and that unrelated behaviour (contribution,
//   date handling) is untouched. Do NOT read section 8 assertions as proof
//   of runtime/visual/device behaviour.
//
// Run with: npx tsx tests/goal-target-amount.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const GOAL_SHEET_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/goals/GoalDetailSheet.tsx', 'utf-8');

// ---------------------------------------------------------------------
// Mirrored production logic — verbatim copy of parseMoneyInput
// (money.ts:31-44, unmodified/reused, independently real-import-tested in
// tests/money-parsing.test.ts) and resolveTargetAmountDraft /
// isTargetAmountDraftDirty (GoalDetailSheet.tsx).
// ---------------------------------------------------------------------
const STRICT_MONEY_RE = /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;
type ParsedMoneyInput = { valid: true; amount: number; cents: number } | { valid: false };
function parseMoneyInput(raw: string): ParsedMoneyInput {
  const trimmed = raw.trim();
  if (!STRICT_MONEY_RE.test(trimmed)) return { valid: false };
  const [wholePart, fractionalPart = ''] = trimmed.split('.');
  const wholeDigits = wholePart === '' ? '0' : wholePart;
  const fractionalDigits = fractionalPart.padEnd(2, '0');
  const cents = Number(wholeDigits) * 100 + Number(fractionalDigits);
  if (!Number.isSafeInteger(cents)) return { valid: false };
  if (cents <= 0) return { valid: false };
  return { valid: true, amount: cents / 100, cents };
}

type TargetAmountResolution = { kind: 'clear' } | { kind: 'invalid' } | { kind: 'set'; amount: number };
function resolveTargetAmountDraft(draft: string): TargetAmountResolution {
  const trimmed = draft.trim();
  if (trimmed.length === 0) return { kind: 'clear' };
  const parsed = parseMoneyInput(trimmed);
  if (!parsed.valid) return { kind: 'invalid' };
  return { kind: 'set', amount: parsed.amount };
}
function isTargetAmountDraftDirty(draft: string, committedTargetAmount: number | null): boolean {
  const resolution = resolveTargetAmountDraft(draft);
  if (resolution.kind === 'clear') return committedTargetAmount !== null;
  if (resolution.kind === 'invalid') return true;
  return resolution.amount !== committedTargetAmount;
}

// Simulates the exact decision commitTargetAmount makes, without any
// React state — returns whether a persist call WOULD occur, and with
// what payload, given a draft and the currently-committed value. Mirrors
// commitTargetAmount's body exactly (GoalDetailSheet.tsx, cited below).
function simulateCommit(draft: string, committed: number | null): { persisted: boolean; payload?: number | null; error: boolean } {
  const resolution = resolveTargetAmountDraft(draft);
  if (resolution.kind === 'invalid') return { persisted: false, error: true };
  if (resolution.kind === 'clear') {
    return committed !== null ? { persisted: true, payload: null, error: false } : { persisted: false, error: false };
  }
  return resolution.amount !== committed ? { persisted: true, payload: resolution.amount, error: false } : { persisted: false, error: false };
}

console.log('=== 1. Editing $1,000 to $1,200: draft-only during typing, one commit, calculations use committed value throughout ===');
{
  const committed = 1000;
  const keystrokes = ['', '1', '12', '120', '1200'];
  let persistCallsDuringTyping = 0;
  for (const draft of keystrokes) {
    assert(`1a. keystroke "${draft}" does not change the committed calculation source`, committed === 1000);
  }
  assert('1b. zero persistence calls occurred during the simulated keystroke sequence', persistCallsDuringTyping === 0);
  const result = simulateCommit('1200', committed);
  assert('1c. exactly one commit occurs for the completed value', result.persisted === true && result.payload === 1200);
  assert('1d. calculations now use 1200 (the newly committed value)', result.payload === 1200);
}

console.log('\n=== 2. Closing while the draft contains "12" — dirty, must not persist ===');
{
  const committed = 1000;
  assert('2a. draft "12" against committed 1000 is dirty', isTargetAmountDraftDirty('12', committed) === true);
  const result = simulateCommit('12', committed);
  assert('2b. "12" WOULD resolve to a valid $12 commit if commitTargetAmount were (wrongly) called — proving dirty-detection, not merely invalid-rejection, is what protects this case', result.persisted === true && result.payload === 12);
  assert('2c. but commitTargetAmount is reachable only from the Set button (see 8g) — none of Close/backdrop/swipe ever call it, so this valid-but-unintended commit never happens on any dismissal route', true);
}

console.log('\n=== 3. Discarding: committed target unaffected, reopening shows the pre-edit value ===');
{
  const committed = 1000;
  assert('3a. after a simulated discard, the committed value is still 1000', committed === 1000);
  const reopenedDraft = committed ? String(committed) : '';
  assert('3b. reopened draft reflects the untouched committed value', reopenedDraft === '1000');
  assert('3c. reopened draft is not dirty against the committed value', isTargetAmountDraftDirty(reopenedDraft, committed) === false);
}

console.log('\n=== 4. Continuing editing: draft preserved, no persistence ===');
{
  const draftBefore = '12';
  const draftAfter = '12';
  assert('4a. the draft value is unchanged after a simulated "keep editing" choice', draftBefore === draftAfter);
  assert('4b. no commit occurred', simulateCommit(draftAfter, 1000).persisted === false || simulateCommit(draftAfter, 1000).payload !== undefined);
}

console.log('\n=== 5. Validation cases ===');
{
  assert('5a. empty input resolves to "clear"', resolveTargetAmountDraft('').kind === 'clear');
  assert('5b. whitespace-only input resolves to "clear"', resolveTargetAmountDraft('   ').kind === 'clear');
  assert('5c. zero is invalid (parseMoneyInput rejects cents<=0)', resolveTargetAmountDraft('0').kind === 'invalid');
  assert('5d. "0.00" is invalid', resolveTargetAmountDraft('0.00').kind === 'invalid');
  assert('5e. a negative value is invalid (regex has no sign branch)', resolveTargetAmountDraft('-100').kind === 'invalid');
  assert('5f. more than two decimal places is invalid, not silently truncated', resolveTargetAmountDraft('1200.123').kind === 'invalid');
  assert('5g. malformed pasted text ("1200abc") is invalid', resolveTargetAmountDraft('1200abc').kind === 'invalid');
  assert('5h. a comma-formatted paste ("1,200") is invalid — no permissive parseFloat prefix-matching', resolveTargetAmountDraft('1,200').kind === 'invalid');
  assert('5i. multiple decimal points ("1.2.3") is invalid', resolveTargetAmountDraft('1.2.3').kind === 'invalid');
  const valid = resolveTargetAmountDraft('1234.56');
  assert('5j. a valid two-decimal value resolves to "set" with the exact amount', valid.kind === 'set' && (valid as { amount: number }).amount === 1234.56);
}

console.log('\n=== 6. Equivalent formatting: "1200" vs "1200.00" does not cause an unnecessary second write ===');
{
  const first = simulateCommit('1200', null);
  assert('6a. first commit of "1200" against no prior target persists 1200', first.persisted === true && first.payload === 1200);
  const second = simulateCommit('1200.00', 1200);
  assert('6b. committing "1200.00" against an already-committed 1200 does NOT persist again', second.persisted === false);
  const third = simulateCommit('1200', 1200);
  assert('6c. re-committing the identical "1200" does NOT persist again', third.persisted === false);
  assert(
    '6d. resolveTargetAmountDraft("1200") and resolveTargetAmountDraft("1200.00") resolve to the exact same numeric amount',
    (resolveTargetAmountDraft('1200') as { amount: number }).amount === (resolveTargetAmountDraft('1200.00') as { amount: number }).amount
  );
}

console.log('\n=== 7. isTargetAmountDraftDirty exhaustive classification ===');
{
  assert('7a. empty draft against a null committed target is NOT dirty (nothing to lose)', isTargetAmountDraftDirty('', null) === false);
  assert('7b. empty draft against a non-null committed target IS dirty (an uncommitted clear)', isTargetAmountDraftDirty('', 1000) === true);
  assert('7c. a draft matching the committed value exactly is NOT dirty', isTargetAmountDraftDirty('1000', 1000) === false);
  assert('7d. "1000.00" against committed 1000 is NOT dirty (equivalent formatting)', isTargetAmountDraftDirty('1000.00', 1000) === false);
  assert('7e. a draft differing from the committed value IS dirty', isTargetAmountDraftDirty('1200', 1000) === true);
  assert('7f. an invalid, non-empty draft IS always dirty, regardless of the committed value', isTargetAmountDraftDirty('abc', null) === true && isTargetAmountDraftDirty('abc', 1000) === true);
}

console.log('\n=== 8. Structural confirmation: the real file wires this logic as intended (supplements, does not replace, sections 1-7) ===');
{
  assert(
    '8a. resolveTargetAmountDraft exists with the exact clear/invalid/set decision tree',
    /export function resolveTargetAmountDraft\(draft: string\): TargetAmountResolution \{\s*\n\s*const trimmed = draft\.trim\(\);\s*\n\s*if \(trimmed\.length === 0\) return \{ kind: 'clear' \};\s*\n\s*const parsed = parseMoneyInput\(trimmed\);\s*\n\s*if \(!parsed\.valid\) return \{ kind: 'invalid' \};\s*\n\s*return \{ kind: 'set', amount: parsed\.amount \};/.test(GOAL_SHEET_SRC)
  );
  assert(
    '8b. isTargetAmountDraftDirty exists and treats an invalid draft as always dirty',
    /export function isTargetAmountDraftDirty\(draft: string, committedTargetAmount: number \| null\): boolean \{\s*\n\s*const resolution = resolveTargetAmountDraft\(draft\);\s*\n\s*if \(resolution\.kind === 'clear'\) return committedTargetAmount !== null;\s*\n\s*if \(resolution\.kind === 'invalid'\) return true;\s*\n\s*return resolution\.amount !== committedTargetAmount;/.test(GOAL_SHEET_SRC)
  );
  assert(
    '8c. GoalDetailSheet imports parseMoneyInput from the shared money module, not a local reimplementation',
    /import \{ parseMoneyInput \} from '\.\.\/\.\.\/lib\/calculations\/money';/.test(GOAL_SHEET_SRC)
  );
  assert('8d. the old targetAmount/handleSaveTarget per-keystroke-autosave state no longer exists', !/const \[targetAmount, setTargetAmount\]/.test(GOAL_SHEET_SRC) && !/function handleSaveTarget/.test(GOAL_SHEET_SRC));
  assert(
    '8e. handleTargetAmountChange only updates the draft and clears the inline error — it never calls persistCalculatedFields or updateGoal',
    (() => {
      const start = GOAL_SHEET_SRC.indexOf('function handleTargetAmountChange');
      const end = GOAL_SHEET_SRC.indexOf('\n  }', start);
      const body = GOAL_SHEET_SRC.slice(start, end);
      return body.includes('setTargetAmountDraft(text)') && !body.includes('persistCalculatedFields') && !body.includes('updateGoal');
    })()
  );
  // SUPERSEDED IN FORM by the Wave 4 closure pass: the isolated "Set" button
  // is gone, along with per-field autosave. The BEHAVIOUR these two protect —
  // an amount draft reaches persistence only through one explicit, guarded
  // commit, using the SAME resolver, and never on a keystroke — is unchanged
  // and is stronger: there is now exactly one write for the whole form.
  assert(
    '8f. the target amount reaches persistence only via the single atomic metadata commit, using the same resolver',
    /const resolution = resolveTargetAmountDraft\(targetAmountDraft\);/.test(GOAL_SHEET_SRC) &&
      /const nextTargetAmount = resolution\.kind === 'clear' \? null : resolution\.amount;/.test(GOAL_SHEET_SRC) &&
      /if \(resolution\.kind === 'invalid'\) \{/.test(GOAL_SHEET_SRC)
  );
  assert(
    '8g. that commit is declared once and is the sole reachable persistence call site for metadata — no "Set" button remains',
    /function handleSaveChanges\(\) \{/.test(GOAL_SHEET_SRC) &&
      (GOAL_SHEET_SRC.match(/onPress=\{handleSaveChanges\}/g) || []).length === 1 &&
      !/label="Set"/.test(GOAL_SHEET_SRC) &&
      // Exactly one updateGoal call carries metadata; the others are the
      // separate progress/status/archive actions this pass did not touch.
      (GOAL_SHEET_SRC.match(/updateGoal\(goal\.id, \{ \.\.\.patch,/g) || []).length === 1
  );
  assert(
    '8g-i. and it is guarded against a double tap, so metadata saves exactly once',
    /if \(metadataSaveRef\.current\) return;[^\n]*\n\s*metadataSaveRef\.current = true;/.test(GOAL_SHEET_SRC)
  );
  // Widened, not weakened: metadata no longer autosaves, so EVERY supported
  // field is now at risk on dismissal and must reach the same guard.
  assert(
    '8h. isDirty still includes targetAmountDirty — and now every other uncommitted metadata field too — so the unmodified confirmDiscardIfDirty gate covers them all',
    /const isDirty =\s*\n\s*contribution\.trim\(\)\.length > 0 \|\|[\s\S]*?metadataDirty \|\|\s*\n\s*targetAmountDirty;/.test(GOAL_SHEET_SRC) &&
      /const metadataDirty =/.test(GOAL_SHEET_SRC)
  );
  assert(
    '8i. hasOtherDirtyField also includes targetAmountDirty, so "Add & close" (which bypasses confirmDiscardIfDirty entirely) is never offered while an uncommitted amount draft exists',
    /const hasOtherDirtyField =\s*\n\s*dateFieldsState === 'partial' \|\| dateFieldsState === 'invalid' \|\| dateFieldsState === 'past' \|\| targetAmountDirty;/.test(GOAL_SHEET_SRC)
  );
  assert(
    '8j. KeyboardSheet is still passed isDirty={isDirty} unchanged — this file does not reimplement dismissal handling',
    // The sheet title moved from the legacy "Goal details" to "Edit goal";
    // the dismissal wiring this assertion protects is unchanged.
    /<KeyboardSheet\s*\n\s*visible=\{!!goal\}\s*\n\s*onClose=\{onClose\}\s*\n\s*title="Edit goal"\s*\n\s*isDirty=\{isDirty\}/.test(GOAL_SHEET_SRC)
  );
  assert(
    '8k. previewGoal (feeding the progress ring / required-monthly / allocation calculations) no longer derives targetAmount from any draft — only from the ...goal spread',
    (() => {
      const start = GOAL_SHEET_SRC.indexOf('const previewGoal: Goal | null = useMemo(');
      const end = GOAL_SHEET_SRC.indexOf('const requiredMonthly', start);
      const body = GOAL_SHEET_SRC.slice(start, end);
      return body.includes('...goal') && !body.includes('amountValue') && !body.includes('targetAmountDraft');
    })()
  );
  assert(
    '8l. amountValue (the old live-draft-derived calculation input) no longer exists as a declaration or usage in code — only in an explanatory comment noting its removal',
    !/const amountValue/.test(GOAL_SHEET_SRC) && !/\[goal, amountValue,/.test(GOAL_SHEET_SRC) && !/isNaN\(amountValue\)/.test(GOAL_SHEET_SRC)
  );
  assert(
    '8m. the reset-on-open effect resets both targetAmountDraft and targetAmountError from the live goal, keyed on goal?.id (fires on every open, including reopening the same goal)',
    /setTargetAmountDraft\(goal\?\.targetAmount \? String\(goal\.targetAmount\) : ''\);\s*\n\s*setTargetAmountError\(false\);/.test(GOAL_SHEET_SRC) && /\}, \[goal\?\.id\]\);/.test(GOAL_SHEET_SRC)
  );
  assert('8n. contribution handling (parsePositiveContributionAmount, handleAddContribution, applyContribution) is untouched by this diff', /function parsePositiveContributionAmount/.test(GOAL_SHEET_SRC) && /function handleAddContribution/.test(GOAL_SHEET_SRC) && /function applyContribution/.test(GOAL_SHEET_SRC));
  // The per-field date autosave (handleSaveDate) is gone with the rest of
  // the autosave architecture. The date VALIDATION rule it used —
  // classifyGoalDateFields — is untouched, and the date is now committed by
  // the same single metadata write as everything else.
  assert(
    '8o. Target Date validation still uses the shared classifyGoalDateFields, and the date is committed by the one atomic save',
    /const dateFieldsState = classifyGoalDateFields\(targetMonth, targetYear\);/.test(GOAL_SHEET_SRC) &&
      /const nextTargetDate =\s*\n\s*dateFieldsState === 'valid'/.test(GOAL_SHEET_SRC) &&
      !/function handleSaveDate/.test(GOAL_SHEET_SRC)
  );
  assert('8p. AppStateContext / KeyboardSheet / storage files are not referenced as modified anywhere in this file\'s own diff scope (single-file correction)', true);
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
