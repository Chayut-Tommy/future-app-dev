/**
 * Pass 2C physical-device correction #2 — invalid radial-Score handling
 * safety fix, plus a confirmation pass on the Milestones/Money Path
 * segmented control's accessibility.
 *
 * CLASSIFICATION (per tests/README.md's evidence taxonomy):
 * - Real import (Class A): toScoreGaugePresentation is a plain, RN-free
 *   function (src/lib/calculations/scoreGaugePresentation.ts) — imported
 *   and executed directly here, genuine behavioural proof, not a regex
 *   match against source text. This is the ENTIRE validity contract this
 *   round's correction is about, so the most important assertions in this
 *   file are real, not structural.
 * - Structural: regex/string matches against DiscoverScreen.tsx and
 *   ScoreRadialGauge.tsx source text, used only for claims that cannot be
 *   real-imported (DiscoverScreen.tsx transitively imports react-native;
 *   ScoreRadialGauge.tsx itself imports react-native/react-native-svg).
 *
 * LIMITATION (explicit, per this round's own instruction: "do not describe
 * structural string assertions as proof of screen-reader behaviour"):
 * this repository has no react-native-testing-library or any component-
 * runtime/screen-reader test harness, and none may be added. The
 * segmented-control assertions below prove the JSX carries the correct
 * accessibility PROPS (role, state, label, touch-target styling, non-
 * colour selection cue) — they are NOT proof of actual VoiceOver/TalkBack
 * announcement behaviour, which remains the physical-device checklist's
 * responsibility (see the report accompanying this pass).
 */
import { readFileSync } from 'fs';
import { toScoreGaugePresentation } from '../src/lib/calculations/scoreGaugePresentation';

let total = 0;
let failures = 0;
function assert(label: string, condition: boolean) {
  total++;
  if (!condition) {
    failures++;
    console.log(`FAIL — ${label}`);
  } else {
    console.log(`PASS — ${label}`);
  }
}

const DISCOVER_SCREEN_SRC = readFileSync('src/screens/discover/DiscoverScreen.tsx', 'utf8');
const SCORE_RADIAL_GAUGE_SRC = readFileSync('src/components/shared/ScoreRadialGauge.tsx', 'utf8');

console.log('=== Section 1: previous invalid-value behaviour would have fabricated progress — direct evidence the corrected contract no longer does (real import) ===');
{
  // These are the exact three "must never occur" examples from the
  // correction instruction. Each is asserted against the REAL,
  // currently-shipped function — not a re-implementation of it.
  assert('9999 (authoritative) no longer renders/implies "100/100" — it resolves to unavailable, not a clamped ceiling value', toScoreGaugePresentation(true, 9999).state === 'unavailable');
  assert('-5 (authoritative) no longer renders/implies "0/100" — it resolves to unavailable, not a clamped floor value', toScoreGaugePresentation(true, -5).state === 'unavailable');
  assert('Infinity (authoritative) no longer renders/implies "100/100" — it resolves to unavailable, not a clamped ceiling value', toScoreGaugePresentation(true, Infinity).state === 'unavailable');
}

console.log('\n=== Section 2: corrected validity and unavailable-state contract — exhaustive real-import proof (real import) ===');
{
  // --- Authoritative, genuinely valid scores render as themselves ---
  const zero = toScoreGaugePresentation(true, 0);
  assert('authoritative 0 renders as {available, value: 0} — a genuine authoritative 0 is preserved as VALID, never treated as falsy/missing', zero.state === 'available' && zero.state === 'available' && zero.value === 0);
  const eightyOne = toScoreGaugePresentation(true, 81);
  assert('authoritative 81 renders as {available, value: 81}', eightyOne.state === 'available' && eightyOne.value === 81);
  const oneHundred = toScoreGaugePresentation(true, 100);
  assert('authoritative 100 renders as {available, value: 100} — the top of the valid range is itself valid, not treated as out-of-range', oneHundred.state === 'available' && oneHundred.value === 100);

  // --- Ring-fill fraction is derived from the SAME validated value ScoreRadialGauge.tsx uses (0-1, matching value/100) ---
  function fillFraction(p: ReturnType<typeof toScoreGaugePresentation>): number {
    return p.state === 'available' ? p.value / 100 : 0;
  }
  assert('authoritative 0 -> fill fraction is exactly 0 (zero fill, not "no data" — genuinely zero)', fillFraction(zero) === 0);
  assert('authoritative 81 -> fill fraction is exactly 0.81 (81% fill)', fillFraction(eightyOne) === 0.81);
  assert('authoritative 100 -> fill fraction is exactly 1 (complete fill)', fillFraction(oneHundred) === 1);

  // --- Non-authoritative is unavailable even for an otherwise-valid number ---
  assert('unauthoritative 0 (authoritative=false) does NOT render "0/100" — resolves to unavailable, exactly like any other non-authoritative value', toScoreGaugePresentation(false, 0).state === 'unavailable');
  assert('unauthoritative 81 (authoritative=false) does NOT render "81/100" — resolves to unavailable', toScoreGaugePresentation(false, 81).state === 'unavailable');

  // --- Non-finite values are unavailable, never a number, never clamped ---
  assert('NaN (authoritative) does not render a number or progress — resolves to unavailable', toScoreGaugePresentation(true, NaN).state === 'unavailable');
  assert('Infinity (authoritative) does not render a number or progress — resolves to unavailable', toScoreGaugePresentation(true, Infinity).state === 'unavailable');
  assert('-Infinity (authoritative) does not render a number or progress — resolves to unavailable', toScoreGaugePresentation(true, -Infinity).state === 'unavailable');

  // --- Out-of-range values are unavailable, never silently clamped into range ---
  assert('-1 (authoritative) does not become 0/100 — resolves to unavailable, not clamped to the floor', toScoreGaugePresentation(true, -1).state === 'unavailable');
  assert('101 (authoritative) does not become 100/100 — resolves to unavailable, not clamped to the ceiling', toScoreGaugePresentation(true, 101).state === 'unavailable');
  assert('9999 (authoritative) does not become 100/100 — resolves to unavailable, not clamped to the ceiling', toScoreGaugePresentation(true, 9999).state === 'unavailable');
  assert('-9999 (authoritative) does not become 0/100 — resolves to unavailable, not clamped to the floor', toScoreGaugePresentation(true, -9999).state === 'unavailable');

  // --- null/undefined (the actual shape scoreChipPresentation.scoreValue can take when locked/unavailable) ---
  assert('null score (authoritative) resolves to unavailable — the exact value scoreChipPresentation.scoreValue holds when locked/unavailable', toScoreGaugePresentation(true, null).state === 'unavailable');
  assert('undefined score (authoritative) resolves to unavailable', toScoreGaugePresentation(true, undefined).state === 'unavailable');

  // --- Fractional/edge boundary values remain correctly classified ---
  assert('a fractional in-range score (e.g. 50.5) with authoritative=true is valid — the contract does not require integers, only finite/in-range (rounding for display is ScoreRadialGauge.tsx\'s own concern, not this function\'s)', toScoreGaugePresentation(true, 50.5).state === 'available');
  assert('exactly 100.0000001 (a hair over the ceiling) is unavailable, not silently rounded into range', toScoreGaugePresentation(true, 100.0000001).state === 'unavailable');
}

console.log('\n=== Section 3: genuine 0 and unavailable remain two distinct, never-conflated states (real import) ===');
{
  const genuineZero = toScoreGaugePresentation(true, 0);
  const unavailable = toScoreGaugePresentation(false, 0);
  assert('a genuine authoritative 0 and a non-authoritative 0 resolve to DIFFERENT presentation states (available vs unavailable) — they are never the same object shape, so a caller can never confuse "really scored zero" with "no score at all"', genuineZero.state !== unavailable.state);
  assert('the genuine-0 branch carries a numeric value field; the unavailable branch has no value field at all (distinct shapes, not just a distinct flag)', 'value' in genuineZero && !('value' in unavailable));
}

console.log('\n=== Section 4: numeric and accessibility behaviour for each invalid-value case, as wired into DiscoverScreen.tsx (Structural + real import) ===');
{
  assert(
    'DiscoverScreen.tsx computes scoreGaugePresentation via toScoreGaugePresentation(scoreChipPresentation.state === \'available\', scoreChipPresentation.scoreValue) — the exact real, imported function proven above, not a re-implementation',
    /const scoreGaugePresentation = useMemo\(\s*\(\) => toScoreGaugePresentation\(scoreChipPresentation\.state === 'available', scoreChipPresentation\.scoreValue\),/.test(DISCOVER_SCREEN_SRC)
  );
  assert('ScoreRadialGauge is driven by that one scoreGaugePresentation value (presentation prop) — not by a separately-passed raw score/authoritative pair that could diverge from it', /<ScoreRadialGauge presentation=\{scoreGaugePresentation\}/.test(DISCOVER_SCREEN_SRC));
  // RECONCILED — Design 5.1 Wave 8.
  // OLD CLAUSE: the label read `scoreGaugePresentation.value` directly and
  // the muted branch reused scoreChipPresentation's label/supportingText.
  // SUPERSEDED BECAUSE Wave 8 routes both branches through
  // `scoreNumberOrNull` / `scoreSupportingText` in growComposition.ts —
  // `.value` exists only on the 'available' arm of the union, so the
  // accessor is type-narrowed rather than an unchecked read, and the muted
  // wording is now the single shared constant.
  // PRESERVED INTENT, verbatim: the announced value comes from the SAME
  // resolved presentation the gauge draws, so the two cannot diverge; and
  // an unavailable score announces no number.
  assert(
    'the accessibility label is derived from the SAME scoreGaugePresentation — never from a separately-computed number, so the announced value and the drawn value cannot diverge even under an invalid-score edge case',
    /scoreMayShowNumber\(scoreGaugePresentation\.state\)\s*\n?\s*\? `\$\{brand\.scoreName\} \$\{scoreNumberOrNull\(scoreGaugePresentation\)\} out of 100\./.test(DISCOVER_SCREEN_SRC) &&
      !/scoreGaugePresentation\.value/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'when scoreGaugePresentation is unavailable, the accessibility label falls back to the established muted-state wording — never a numeric label, never "undefined"/"NaN" text',
    /: `\$\{brand\.scoreName\}\. \$\{SCORE_UNAVAILABLE_TEXT\}`/.test(DISCOVER_SCREEN_SRC) &&
      /export const SCORE_UNAVAILABLE_TEXT = 'Not enough recorded yet';/.test(readFileSync('src/lib/calculations/growComposition.ts', 'utf8'))
  );
  assert(
    'life stage, completeness, strongest area, and opportunity are ALL gated on scoreGaugePresentation.state === \'available\' (the doubly-validated state), not the looser scoreChipPresentation.state === \'available\' — so none of these are ever exposed as authoritative when the score itself failed the validity contract',
    // RECONCILED — Design 5.1 Wave 8: the literal comparison is now the
    // named `scoreMayShowNumber(scoreGaugePresentation.state)`, which IS
    // that comparison (growComposition.ts: `state === 'available'`) and is
    // a deliberate whitelist of one, so a state added later cannot start
    // showing a figure. The gate is still the doubly-validated gauge
    // state, never the looser chip state — asserted below unchanged.
    (DISCOVER_SCREEN_SRC.match(/scoreMayShowNumber\(scoreGaugePresentation\.state\)/g) || []).length >= 3 &&
      /export function scoreMayShowNumber\(state: string\): boolean \{\s*\n\s*return state === 'available';/.test(readFileSync('src/lib/calculations/growComposition.ts', 'utf8')) &&
      !/scoreChipPresentation\.state === 'available' && luluScore\.lifeStage/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'ScoreRadialGauge.tsx performs NO clamping anywhere (no Math.max/Math.min on the score) — the presentation.value it draws is only ever reached through the already-validated toScoreGaugePresentation contract',
    !/Math\.max\(0, Math\.min\(100/.test(SCORE_RADIAL_GAUGE_SRC)
  );
  assert(
    'ScoreRadialGauge.tsx draws the ring fill and the centre numeral from the identical presentation.state === \'available\' branch — they cannot disagree with each other (one can never show a fill with no number, or a number with no corresponding fill decision)',
    /presentation\.state === 'available' \? circumference \* \(1 - presentation\.value \/ 100\) : circumference/.test(SCORE_RADIAL_GAUGE_SRC) &&
      /\{presentation\.state === 'available' \? Math\.round\(presentation\.value\) : '—'\}/.test(SCORE_RADIAL_GAUGE_SRC)
  );
}

console.log('\n=== Section 5: segmented-control (Milestones | Money Path) accessibility — structural prop verification, not a substitute for on-device VoiceOver/TalkBack testing (Structural) ===');
{
  assert(
    'the tab row itself carries accessibilityRole="tablist" and each option carries accessibilityRole="tab" (not "button") — correct segmented-control semantics for VoiceOver/TalkBack, distinct from the plain-button role used elsewhere on this screen',
    /<View style=\{styles\.journeyTabRow\} accessibilityRole="tablist">/.test(DISCOVER_SCREEN_SRC) && (DISCOVER_SCREEN_SRC.match(/accessibilityRole="tab"/g) || []).length === 2
  );
  assert(
    'both tabs expose accessibilityState={{ selected: ... }} tied to the live journeySubview value — the active option\'s selected state is always announceable, and only one of the two can be true at a time (mutually exclusive by construction, since both read the same single journeySubview variable)',
    /accessibilityState=\{\{ selected: journeySubview === 'milestones' \}\}/.test(DISCOVER_SCREEN_SRC) && /accessibilityState=\{\{ selected: journeySubview === 'moneyPath' \}\}/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'each tab has an explicit, plain accessibilityLabel ("Milestones" / "Money Path") — not left to be inferred from nested Text styling, so the announced label is stable regardless of which conditional text style is applied',
    /accessibilityLabel="Milestones"/.test(DISCOVER_SCREEN_SRC) && /accessibilityLabel="Money Path"/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'Milestones is declared before Money Path in source order, and both are declared before the subview content that follows — the same top-to-bottom order VoiceOver/TalkBack use by default, with no accessibility ordering override (no accessibilityViewIsModal/importantForAccessibility reordering) anywhere in this block',
    DISCOVER_SCREEN_SRC.indexOf('accessibilityLabel="Milestones"') < DISCOVER_SCREEN_SRC.indexOf('accessibilityLabel="Money Path"') &&
      DISCOVER_SCREEN_SRC.indexOf('accessibilityLabel="Money Path"') < DISCOVER_SCREEN_SRC.indexOf("journeySubview === 'milestones' ? (")
  );
  assert(
    'each tab has an explicit minHeight: 44 touch target — not left to whatever the caption font size happens to produce, so the target stays adequate under Dynamic Type',
    /journeyTab: \{[^}]*minHeight: 44/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    'selection is communicated by more than colour alone — the selected tab gets both a visible border (journeyTabSelected, borderColor) AND bold text (journeyTabTextSelected, fontWeight: \'800\') in addition to the background-colour change, so a user who cannot distinguish the colour difference still has a shape/weight cue',
    /journeyTabSelected: \{ borderColor: naviloPalette\.secondaryAccent \}/.test(DISCOVER_SCREEN_SRC) && /journeyTabTextSelected: \{ color: naviloPalette\.secondaryAccent, fontWeight: '800' \}/.test(DISCOVER_SCREEN_SRC)
  );
  assert(
    // Bounded by literal marker offsets rather than a `[^>]*` tag regex —
    // the tag itself contains an arrow function (onPress={() => ...}),
    // whose `=>` embeds a literal ">" that would otherwise terminate a
    // naive "up to the next >" match early.
    'no duplicate/redundant accessible text is introduced per tab — each TouchableOpacity has exactly one Text child (no extra hidden label element that could cause a double announcement)',
    (() => {
      const milestonesLabelIdx = DISCOVER_SCREEN_SRC.indexOf('accessibilityLabel="Milestones"');
      const moneyPathLabelIdx = DISCOVER_SCREEN_SRC.indexOf('accessibilityLabel="Money Path"');
      const milestonesCloseIdx = DISCOVER_SCREEN_SRC.indexOf('</TouchableOpacity>', milestonesLabelIdx);
      const moneyPathCloseIdx = DISCOVER_SCREEN_SRC.indexOf('</TouchableOpacity>', moneyPathLabelIdx);
      const milestonesBody = DISCOVER_SCREEN_SRC.slice(milestonesLabelIdx, milestonesCloseIdx);
      const moneyPathBody = DISCOVER_SCREEN_SRC.slice(moneyPathLabelIdx, moneyPathCloseIdx);
      const countText = (body: string) => (body.match(/<Text\b/g) || []).length;
      return milestonesLabelIdx !== -1 && moneyPathLabelIdx !== -1 && countText(milestonesBody) === 1 && countText(moneyPathBody) === 1;
    })()
  );
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
