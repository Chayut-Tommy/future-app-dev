/**
 * Pass 2B, third correction round — focused coverage for this round's two
 * fixes only: (1) Briefing tile icon contrast via the central semantic
 * palette, (2) the existing-credit-card Save silent-failure regression.
 * See tests/README.md for the real-import / mirrored / structural taxonomy.
 *
 * IMPORTANT: the contrast-ratio numbers in Section 6 are a genuine
 * calculation on the actual shipped palette values (WCAG relative-
 * luminance formula, alpha-composited where the token is translucent).
 * They are real evidence the new icon colour is mathematically higher-
 * contrast than the old one — they are NOT a substitute for physical-
 * device visual confirmation (device gamma, anti-aliasing, and actual
 * rendering are still unverified here, consistent with this round's own
 * instruction not to describe structural/numeric tests as proof of visual
 * fit).
 */
import { readFileSync } from 'fs';
import { selectNaviloPalette, NaviloColorStyle } from '../src/theme/palettes';
import { lightColors, darkColors } from '../src/theme/tokens';
import { resolveExpectedMonthlyRepayment, isValidExpectedRepayment } from '../src/lib/calculations/creditHealth';
import { CreditCard } from '../src/types/models';

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

function baseCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'c1',
    issuer: 'AMEX test',
    label: 'AMEX test',
    creditLimit: 7000,
    currentBalance: 1000,
    dueDay: 13,
    minimumPayment: 0,
    ...overrides,
  } as CreditCard;
}

console.log('=== Section 1: is "$0 expected repayment / $100 minimum payment" valid data? (Real import) ===');
{
  // This is the exact combination the physical-device recording captured.
  const card = baseCard({ minimumPayment: 100, expectedMonthlyRepayment: 0 });
  assert('isValidExpectedRepayment(0) is false — a $0 expectedMonthlyRepayment is never treated as a genuine user-set figure', isValidExpectedRepayment(0) === false);
  assert(
    'resolveExpectedMonthlyRepayment falls back to the positive minimumPayment (100) when expectedMonthlyRepayment is 0 — this is a deliberate, existing fallback, not a data-integrity violation',
    resolveExpectedMonthlyRepayment(card) === 100
  );
  assert(
    'the card object itself is accepted as-is — the resolver never mutates/coerces expectedMonthlyRepayment into minimumPayment or vice versa on the stored record',
    card.expectedMonthlyRepayment === 0 && card.minimumPayment === 100
  );
  const cardBlank = baseCard({ minimumPayment: 100, expectedMonthlyRepayment: undefined });
  assert('a blank (undefined) expectedMonthlyRepayment alongside a positive minimumPayment resolves the same way as an explicit 0 — both are the "not yet set" state', resolveExpectedMonthlyRepayment(cardBlank) === 100);
  const cardNeitherSet = baseCard({ minimumPayment: 0, expectedMonthlyRepayment: 0 });
  assert('when neither field is a genuine positive figure, the resolver returns 0 — never a fabricated non-zero amount', resolveExpectedMonthlyRepayment(cardNeitherSet) === 0);
  const cardBothSet = baseCard({ minimumPayment: 100, expectedMonthlyRepayment: 250 });
  assert('when the user HAS set a genuine expectedMonthlyRepayment, it is used verbatim and never overridden by minimumPayment', resolveExpectedMonthlyRepayment(cardBothSet) === 250);
}

console.log('\n=== Section 2: parseRepaymentAmount mirrored behaviour for the exact recorded inputs (Mirrored logic + Structural) ===');
{
  // Verbatim mirror of AddCreditCardModal.tsx's own parseRepaymentAmount —
  // see its own doc comment there for the rationale (strip formatting,
  // reject negative/non-finite outright).
  function parseRepaymentAmount(text: string): number {
    const cleaned = text.replace(/[^0-9.-]/g, '');
    const value = parseFloat(cleaned);
    if (!Number.isFinite(value) || value < 0) return 0;
    return value;
  }
  assert('parsing the recorded "$0" expected-repayment field yields 0', parseRepaymentAmount('$0') === 0);
  assert('parsing a blank minimum-payment field yields 0 (never NaN)', parseRepaymentAmount('') === 0);
  assert('parsing "$100" (the recorded new minimum-payment entry) yields exactly 100', parseRepaymentAmount('$100') === 100);
  assert('parsing "100" without a currency symbol also yields 100', parseRepaymentAmount('100') === 100);
  assert('parsing "$1,000.50" (pasted formatted currency) yields 1000.5', parseRepaymentAmount('$1,000.50') === 1000.5);
  assert('a negative entry is rejected to 0, never persisted as a negative repayment', parseRepaymentAmount('-50') === 0);

  const SRC = readFileSync('src/components/credit/AddCreditCardModal.tsx', 'utf8');
  assert('the real AddCreditCardModal.tsx still contains this exact parseRepaymentAmount body, unmodified by this correction', /function parseRepaymentAmount\(text: string\): number \{\s*const cleaned = text\.replace\(\/\[\^0-9\.\-\]\/g, ''\);\s*const value = parseFloat\(cleaned\);\s*if \(!Number\.isFinite\(value\) \|\| value < 0\) return 0;\s*return value;\s*\}/.test(SRC));
}

console.log('\n=== Section 3: root cause and fix of the silent Save failure (Structural) ===');
{
  const SRC = readFileSync('src/components/credit/AddCreditCardModal.tsx', 'utf8');

  assert('submittingRef is reset to false inside the visible/editCard reset effect — a fresh form session always starts unlocked', /setSaving\(false\);\s*\/\/ A genuinely new form session[\s\S]{0,120}submittingRef\.current = false;/.test(SRC));
  assert('the same reset effect also clears saveErrorMessage on a fresh session, so a stale error from a previous card never bleeds into the next one', /submittingRef\.current = false;\s*setSaveErrorMessage\(null\);\s*\}, \[visible, editCard\]\);/.test(SRC));
  assert('handleSave clears saveErrorMessage again at the very start of a new attempt, before the persistence call', /setSaving\(true\);\s*setSaveErrorMessage\(null\);/.test(SRC));

  assert('the actual persistence call (updateCreditCard/addCreditCard) is now wrapped in a try block — a thrown failure can no longer leave submittingRef permanently latched with zero feedback', /try \{\s*if \(editCard\) \{\s*updateCreditCard\(editCard\.id, payload\);/.test(SRC));
  assert('the catch block releases submittingRef back to false, so a genuine failure can be retried by the next tap instead of soft-locking Save forever', /catch \(err\) \{[\s\S]{0,600}submittingRef\.current = false;/.test(SRC));
  assert('the catch block surfaces a plain-language error via setSaveErrorMessage — Save can never fail with zero visible feedback again', /catch \(err\) \{[\s\S]{0,600}setSaveErrorMessage\('Something went wrong saving this card/.test(SRC));
  assert(
    'the catch block does NOT call onClose or onSaveSuccess — a failed save keeps the sheet open and the user\'s entered values on screen, never silently discarding the draft',
    (() => {
      const catchStart = SRC.indexOf('} catch (err) {');
      const catchEnd = SRC.indexOf('\n  }\n', catchStart);
      // Strip comment-only lines first — the catch block's own doc comment
      // deliberately mentions "onClose()" in prose ("never call onClose()
      // — the user's entered values stay on screen..."), which would
      // otherwise produce a false failure here despite the executable code
      // genuinely never calling it.
      const catchCodeOnly = SRC.slice(catchStart, catchEnd)
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      return catchStart !== -1 && catchEnd !== -1 && !/onClose\(\)/.test(catchCodeOnly) && !/onSaveSuccess\?\.\(\)/.test(catchCodeOnly);
    })()
  );
  assert('the success path is unchanged — embedded hands off via onSaveSuccess, standalone calls onClose, exactly as before this correction', /if \(embedded\) onSaveSuccess\?\.\(\);\s*else onClose\(\);/.test(SRC));
}

console.log('\n=== Section 4: existing card identity preserved — editing never creates a duplicate (Structural) ===');
{
  const SRC = readFileSync('src/components/credit/AddCreditCardModal.tsx', 'utf8');
  assert('the editCard branch calls updateCreditCard(editCard.id, payload) — the existing card\'s own id, never a freshly generated one', /if \(editCard\) \{\s*updateCreditCard\(editCard\.id, payload\);/.test(SRC));
  assert('addCreditCard is only reachable in the else branch (no editCard) — an edit session can never fall through to creating a new card', /\} else \{\s*addCreditCard\(payload\);\s*\}/.test(SRC));
  assert('canSave requires a non-empty issuer, a valid credit limit, and a due day in 1-31 — the exact same gate as before this correction, untouched', /const canSave = issuer\.trim\(\)\.length > 0 && !isNaN\(creditLimit\) && !isNaN\(due\) && due >= 1 && due <= 31;/.test(SRC));
}

console.log('\n=== Section 5: dependent liability/upcoming-payment views refresh through the existing persist() path (Structural, unchanged) ===');
{
  const APP_STATE_SRC = readFileSync('src/state/AppStateContext.tsx', 'utf8');
  assert(
    'updateCreditCard still funnels every edit through persist(upsertCreditCardLiability(...)) — the single shared write path every dependent screen (Debt Overview, Available Until Payday, What Happens Next, Navilo Score) already re-derives from, untouched by this correction',
    /const updateCreditCard = useCallback\(\s*\(id: string, patch: Partial<Omit<CreditCard, 'id'>>\) => \{\s*const updatedCard = \{ \.\.\.data\.creditCards\.find\(\(c\) => c\.id === id\), \.\.\.patch \} as CreditCard;\s*const withCard = \{ \.\.\.data, creditCards: data\.creditCards\.map\(\(c\) => \(c\.id === id \? updatedCard : c\)\) \};\s*persist\(upsertCreditCardLiability\(withCard, updatedCard\)\);/.test(
      APP_STATE_SRC
    )
  );
}

console.log('\n=== Section 6: Briefing tile icon contrast — central semantic palette, all three styles (Real import, numeric contrast) ===');
{
  function parseColorToRgb(color: string): { r: number; g: number; b: number; a: number } {
    const rgbaMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)$/);
    if (rgbaMatch) {
      return { r: parseInt(rgbaMatch[1], 10), g: parseInt(rgbaMatch[2], 10), b: parseInt(rgbaMatch[3], 10), a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1 };
    }
    const hexMatch = color.match(/^#([0-9A-Fa-f]{6})$/);
    if (hexMatch) {
      const hex = hexMatch[1];
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
    }
    throw new Error(`Unparseable colour: ${color}`);
  }

  function compositeOver(fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number }) {
    return {
      r: fg.a * fg.r + (1 - fg.a) * bg.r,
      g: fg.a * fg.g + (1 - fg.a) * bg.g,
      b: fg.a * fg.b + (1 - fg.a) * bg.b,
    };
  }

  function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
  }

  const STYLES: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  const SCHEMES: Array<'light' | 'dark'> = ['light', 'dark'];

  for (const style of STYLES) {
    for (const scheme of SCHEMES) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      const bgStart = parseColorToRgb(palette.heroGradientStart);
      const bgEnd = parseColorToRgb(palette.heroGradientEnd);
      const bgMid = { r: (bgStart.r + bgEnd.r) / 2, g: (bgStart.g + bgEnd.g) / 2, b: (bgStart.b + bgEnd.b) / 2 };

      const oldIconFg = parseColorToRgb(palette.primaryAccent);
      const oldIconEffective = compositeOver(oldIconFg, bgMid);
      const oldRatio = contrastRatio(oldIconEffective, bgMid);

      const newIconFg = parseColorToRgb(palette.tileIconForeground);
      const newIconEffective = compositeOver(newIconFg, bgMid);
      const newRatio = contrastRatio(newIconEffective, bgMid);

      assert(`${style}/${scheme}: tileIconForeground's contrast against the hero gradient (${newRatio.toFixed(2)}:1) clears the WCAG 3:1 non-text minimum`, newRatio >= 3.0);
      assert(`${style}/${scheme}: tileIconForeground (${newRatio.toFixed(2)}:1) is materially higher contrast than the old primaryAccent-as-icon-colour (${oldRatio.toFixed(2)}:1) — the confirmed regression is numerically improved, not just changed`, newRatio > oldRatio + 0.5);
    }
  }

  const sunriseLight = selectNaviloPalette('sunrise', 'light', lightColors);
  assert('Sunrise\'s tileIconForeground is not harsh pure white (#FFFFFF) — a warm/soft tint is used instead, per "prefer a soft white... rather than harsh pure white where that produces the more premium result"', sunriseLight.tileIconForeground !== '#FFFFFF');
  const blueLight = selectNaviloPalette('blue', 'light', lightColors);
  assert('primaryAccent is untouched by this correction — still the raw style accent colour, since Journey\'s secondaryAccent/progressAccent still read it and were never part of this defect', blueLight.primaryAccent === lightColors.aiBlue);
  assert('attentionAccent is untouched by this correction — still always colors.danger, independent of the icon-contrast fix', blueLight.attentionAccent === lightColors.danger);
}

console.log('\n=== Section 7: BriefingTileRow wiring — normal-tone icons use the new token, attention-tone icons are unaffected (Structural) ===');
{
  const SRC = readFileSync('src/components/today/BriefingTileRow.tsx', 'utf8');
  assert(
    "the tile icon's colour expression uses naviloPalette.tileIconForeground for the normal (non-attention) branch and naviloPalette.attentionAccent for the attention branch — no raw colour literal, no primaryAccent left as the icon source",
    /color=\{tile\.tone === 'attention' \? naviloPalette\.attentionAccent : naviloPalette\.tileIconForeground\}/.test(SRC)
  );
  assert('BriefingTileRow.tsx contains no hard-coded hex/rgba colour literal of its own — the new icon colour is resolved entirely through naviloPalette', !/#[0-9A-Fa-f]{3,8}\b/.test(SRC) && !/rgba\(\d/.test(SRC));
  assert('tile content, icon glyph selection (tile.icon), label, value, and supportingLine rendering are otherwise unchanged — only the icon colour source moved', /Ionicons name=\{tile\.icon\}/.test(SRC) && /\{tile\.label\}/.test(SRC) && /\{tile\.value\}/.test(SRC) && /\{tile\.supportingLine\}/.test(SRC));
}

console.log('\n=== Section 8: semantic attention/success meanings remain independent of the icon-contrast fix (Real import) ===');
{
  const STYLES: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  for (const style of STYLES) {
    for (const scheme of ['light', 'dark'] as const) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      assert(`${style}/${scheme}: attentionAccent still equals colors.danger after the icon-contrast correction — attention semantics were not touched`, palette.attentionAccent === colors.danger);
      assert(`${style}/${scheme}: tileIconForeground is never equal to attentionAccent — an ordinary informational icon can never be mistaken for the attention colour`, palette.tileIconForeground !== palette.attentionAccent);
    }
  }
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
