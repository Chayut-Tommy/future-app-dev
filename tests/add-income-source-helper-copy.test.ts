// UX correction — Add Income Source helper copy + wrapping resilience.
//
// Two small, narrow claims: (1) the exact helper copy shown on the "Add
// income source" category step, and (2) that it is genuinely unbounded —
// no numberOfLines, no ellipsizeMode, no fixed height — so it wraps to
// however many lines accessibility font scaling requires and is NEVER
// truncated. AMENDMENT — an earlier version of this correction added
// numberOfLines={2} believing it merely capped wrapping; RN's
// numberOfLines={n} actually truncates content beyond n lines (default
// ellipsizeMode 'tail'), so that prop was corrected to be removed entirely
// rather than left in place. Also protects the sibling finding from the
// same correction — the "Record income received" chooser tile (a
// DIFFERENT component, AddAnythingSheet.tsx's own top-level GROUPS list —
// not one of AddIncomeModal's own source tiles) was found to already wrap
// cleanly with no code change required, and that absence-of-constraint is
// what this file also protects against regressing.
//
// CLASSIFICATION:
// - Structural (static/source-structure) only: every assertion below. No
//   component/runtime test exists in this repo (AddIncomeModal.tsx and
//   AddAnythingSheet.tsx are both .tsx, unimportable under `tsx`/esbuild —
//   the same, already-documented Flow-syntax limitation every other .tsx
//   file in this codebase has).
// - NOT proven here: that the helper text visually wraps to exactly one or
//   two lines on any real device/font-scale combination, that it looks
//   correct, or that "Record income received" visually renders across two
//   lines rather than one — those are physical-device/visual claims. This
//   file only proves the CODE contains no line-count-forcing constraint and
//   the exact required copy — the runtime wrap outcome still requires
//   device or simulator observation.
//
// Run with: ./node_modules/.bin/tsx tests/add-income-source-helper-copy.test.ts

import { readFileSync } from 'fs';

let failures = 0;
let total = 0;
function assert(label: string, pass: boolean) {
  total++;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

const ADD_INCOME_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/income/AddIncomeModal.tsx', 'utf-8');
const ADD_ANYTHING_SRC = readFileSync('/Users/tommy/Claude/Lulu/app/src/components/navigation/AddAnythingSheet.tsx', 'utf-8');

console.log('=== 1. Exact helper copy on the Add income source category step (Class C) ===');
{
  assert(
    "1a. the new copy 'Tell {brand.name} where your income comes from.' is present, exactly",
    /Tell \{brand\.name\} where your income comes from\./.test(ADD_INCOME_SRC)
  );
  assert(
    "1b. the old copy ('...what comes in so it can build your money plan.') no longer exists anywhere in the file",
    !/what comes in so it can build your money plan/.test(ADD_INCOME_SRC)
  );
}

console.log('\n=== 2. Helper text is genuinely unbounded — no line-count cap, no truncation, no fixed height (Class C) ===');
{
  assert(
    '2a. the helper Text has no numberOfLines prop at all — RN\'s numberOfLines={n} genuinely truncates content beyond n lines (default ellipsizeMode \'tail\'), so this Text is left fully unbounded rather than "capped"',
    /<Text style=\{styles\.preview\}>Tell \{brand\.name\} where your income comes from\.<\/Text>/.test(ADD_INCOME_SRC) &&
      !/<Text style=\{styles\.preview\}[^>]*numberOfLines/.test(ADD_INCOME_SRC)
  );
  assert(
    '2b. no ellipsizeMode prop is set anywhere in the file (checked as an actual JSX prop usage — the "=" that follows real usage — not the bare word, which the correction\'s own explanatory comment above legitimately mentions) — nothing truncates this text with "…"',
    !/ellipsizeMode=/.test(ADD_INCOME_SRC)
  );
  assert(
    "2c. styles.preview (the shared style this Text uses) sets no fixed width or fixed height — it already uses the sheet's full available content width and never clips the text vertically, regardless of how many lines font scaling produces",
    /preview: \{ \.\.\.typography\.caption, fontSize: 12, color: colors\.textSecondary, marginTop: -spacing\.xs, marginBottom: spacing\.sm \},/.test(ADD_INCOME_SRC)
  );
  assert(
    '2d. no allowFontScaling={false} exists anywhere in the file — font scaling is never disabled, so this Text (and every other Text in the file) can grow with the device\'s accessibility text-size setting, wrapping to however many lines that requires',
    !/allowFontScaling=\{false\}/.test(ADD_INCOME_SRC)
  );
}

console.log('\n=== 3. "Record income received" chooser tile already wraps cleanly — no single-line-forcing constraint exists (Class C) ===');
{
  // This tile lives in AddAnythingSheet.tsx's own top-level GROUPS list
  // (the Add Anything chooser), NOT inside AddIncomeModal.tsx's source-type
  // grid (Salary/Side hustle/Dividends/Rental income/Gift/Other) — a
  // distinct component from the one section 1/2 above cover. Investigation
  // found no code change was needed here: the label already wraps freely.
  assert(
    "3a. the 'Record income received' tile label is declared exactly as expected, in AddAnythingSheet.tsx's GROUPS list",
    // Wave 3 added the Design 5.1 'one-off' qualifier alongside the label
    // (doc A p.5). The LABEL ITSELF — what this assertion exists to protect —
    // is unchanged; only a sibling field was added to the same entry.
    /\{ key: 'income_received', label: 'Record income received', qualifier: 'one-off', emoji: '💰' \}/.test(ADD_ANYTHING_SRC)
  );
  assert(
    // Wave 3 replaced the tile grid with full-width catalogue rows (doc A
    // p.5). The protected intent is unchanged: the longest label, 'Record
    // income received', must never be squeezed onto one truncated line. The
    // row label now flexes to fill the row and carries no fixed width or
    // height, which is what guarantees it.
    "3b. styles.rowLabel sets no fixed width and no fixed height, and flexes — so every catalogue label (including 'Record income received', the longest) is free to wrap",
    (() => {
      const styleMatch = ADD_ANYTHING_SRC.match(/rowLabel: \{[^}]*\}/);
      if (!styleMatch) return false;
      const style = styleMatch[0];
      return /flex: 1/.test(style) && !/\bwidth:/.test(style) && !/\bheight:/.test(style);
    })()
  );
  assert(
    // The row label may wrap to TWO lines — wrapping, not truncating to one.
    // A single-line cap is what this assertion exists to prevent.
    "3c. the catalogue label Text allows wrapping to a second line and is never capped at one line",
    /<Text style=\{styles\.rowLabel\} numberOfLines=\{2\}>/.test(ADD_ANYTHING_SRC) && !/numberOfLines=\{1\}/.test(ADD_ANYTHING_SRC)
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
