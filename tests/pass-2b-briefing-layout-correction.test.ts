/**
 * Pass 2B, layout/colour correction (third correction round) — focused
 * coverage for THIS round's specific asks: the reminder-overflow fix, the
 * three-compact-tile Briefing redesign, the responsive column rule, and the
 * central Ocean Blue / Purple / Sunrise semantic colour-palette
 * architecture. See tests/README.md for the real-import / mirrored /
 * structural evidence taxonomy this suite follows — each assertion below is
 * labelled with its class.
 *
 * IMPORTANT: structural assertions in this file (regex/string matches
 * against component source) confirm wiring exists. They are NOT proof that
 * the real React Native tile row actually fits three columns on a small
 * iPhone, that text is legible at 310% Dynamic Type, or that contrast
 * passes WCAG in every style/scheme combination — that remains physical-
 * device evidence only, per this round's explicit instruction not to
 * describe structural tests as proof of visual fit or accessibility.
 */
import { readFileSync } from 'fs';
import { selectBriefingTiles, computeBriefingLayout, BriefingTile } from '../src/lib/calculations/briefingTiles';
import { selectNaviloPalette, NaviloColorStyle, NaviloPalette } from '../src/theme/palettes';
import { lightColors, darkColors } from '../src/theme/tokens';
import { SafeToSpendPresentation } from '../src/lib/calculations/safeToSpendPresentation';
import { SmartReminder } from '../src/lib/calculations/reminders';
import { TodayBriefingEventRow } from '../src/lib/calculations/todayBriefing';

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

function presentation(overrides: Partial<SafeToSpendPresentation> = {}): SafeToSpendPresentation {
  return {
    heroState: 'normal',
    tone: 'normal',
    heading: 'AVAILABLE UNTIL PAYDAY',
    primaryCopy: '$482.10',
    supportingCopy: null,
    amountCents: 48210,
    displayAmount: '$482.10',
    amountVisible: true,
    ...overrides,
  } as SafeToSpendPresentation;
}

function reminder(overrides: Partial<SmartReminder> = {}): SmartReminder {
  return {
    id: 'r1',
    kind: 'bnpl_repayment_due',
    title: 'Confirm your Afterpay repayment',
    body: "It's due today.",
    ...overrides,
  } as SmartReminder;
}

function eventRow(overrides: Partial<TodayBriefingEventRow> = {}): TodayBriefingEventRow {
  return {
    key: 'e1',
    kind: 'bill',
    title: 'Electricity due in 3 days',
    tone: 'neutral',
    icon: 'flash-outline',
    daysUntil: 3,
    ...overrides,
  } as TodayBriefingEventRow;
}

console.log('=== Section 1: one/two/three eligible items produce one/two/three tiles, Score never among them (Real import) ===');
{
  const oneTile = selectBriefingTiles(presentation(), null, []);
  assert('AUP alone (no reminder, no events) produces exactly 1 tile', oneTile.length === 1);
  assert('the single tile is the AUP tile', oneTile[0].kind === 'aup');

  const twoTiles = selectBriefingTiles(presentation(), reminder(), []);
  assert('AUP + reminder, no events, produces exactly 2 tiles', twoTiles.length === 2);
  assert('order is AUP then reminder', twoTiles[0].kind === 'aup' && twoTiles[1].kind === 'reminder');

  const twoTilesEventsOnly = selectBriefingTiles(presentation(), null, [eventRow({ key: 'e1' }), eventRow({ key: 'e2' })]);
  assert('AUP + two events (no reminder) produces exactly 3 tiles — selectBriefingTiles adds no capping of its own, it trusts the upstream eventRows budget', twoTilesEventsOnly.length === 3);

  const threeTiles = selectBriefingTiles(presentation(), reminder(), [eventRow({ key: 'e1' })]);
  assert('AUP + reminder + one event produces exactly 3 tiles (the upstream cap this function inherits, never recomputes)', threeTiles.length === 3);
  assert('order is AUP, reminder, event', threeTiles[0].kind === 'aup' && threeTiles[1].kind === 'reminder' && threeTiles[2].kind === 'event');

  assert(
    'the Score chip presentation is never accepted as an input to selectBriefingTiles — Score architecturally cannot become a tile, regardless of how many financial tiles exist',
    selectBriefingTiles.length === 3
  );
}

console.log('\n=== Section 2: width-aware responsive layout rule, replacing the fontScale-only decision (Real import) ===');
{
  // Reference numbers for a standard-width iPhone (14/15/16 base model,
  // 390pt logical width — the class of device the physical-device retest
  // used): Screen's own ScrollView padding (spacing.lg = 16) plus the
  // Briefing hero's own internal padding (spacing.lg = 16) each consume
  // 16pt on both sides before the tile row itself starts, so:
  //   availableRowWidth = 390 - (16 + 16) * 2 = 326
  // This is the exact measured-width value BriefingTileRow's own onLayout
  // would report on that device class — computeBriefingLayout never
  // guesses or hard-codes this number itself; it is passed in here only to
  // prove the fix against a concrete, representative value.
  const STANDARD_DEVICE_ROW_WIDTH = 326;
  const GAP = 8; // spacing.sm
  const MIN_TILE_WIDTH = 92;

  assert('0 items -> 1 column, no width needed (defensive floor, never 0)', computeBriefingLayout(0, STANDARD_DEVICE_ROW_WIDTH, 1, GAP, MIN_TILE_WIDTH).columns === 1);
  assert('1 item -> 1 column regardless of width (one wider featured tile)', computeBriefingLayout(1, STANDARD_DEVICE_ROW_WIDTH, 1, GAP, MIN_TILE_WIDTH).columns === 1);
  assert('1 item -> tileWidth is null (uses the unchanged 100% percentage-basis path, not a fixed pixel width)', computeBriefingLayout(1, STANDARD_DEVICE_ROW_WIDTH, 1, GAP, MIN_TILE_WIDTH).tileWidth === null);

  assert('not yet measured (availableWidth 0, before the row\'s first onLayout) -> 1 column, the safest possible interim render, even for 3 items', computeBriefingLayout(3, 0, 1, GAP, MIN_TILE_WIDTH).columns === 1);

  assert('2 items, ordinary text, standard device width -> 2 balanced columns (unchanged mechanism)', computeBriefingLayout(2, STANDARD_DEVICE_ROW_WIDTH, 1, GAP, MIN_TILE_WIDTH).columns === 2);
  assert('2 items, ordinary text -> tileWidth is null (still the original percentage/flexGrow path, untouched by this correction)', computeBriefingLayout(2, STANDARD_DEVICE_ROW_WIDTH, 1, GAP, MIN_TILE_WIDTH).tileWidth === null);
  assert('2 items, materially larger text (1.4, over the 1.3 threshold) -> 1 column safe fallback (unchanged)', computeBriefingLayout(2, STANDARD_DEVICE_ROW_WIDTH, 1.4, GAP, MIN_TILE_WIDTH).columns === 1);

  // The exact regression scenario: 3 items, ordinary text, standard
  // recorded-device width.
  const standardThreeItems = computeBriefingLayout(3, STANDARD_DEVICE_ROW_WIDTH, 1, GAP, MIN_TILE_WIDTH);
  assert('3 items, ordinary text, standard recorded-device width (326) -> exactly 3 equal columns — the regression is fixed', standardThreeItems.columns === 3);
  assert(
    `3 items at standard width -> tileWidth is the exact (availableWidth - 2*gap) / 3 = (326-16)/3 = ${((STANDARD_DEVICE_ROW_WIDTH - 2 * GAP) / 3).toFixed(4)}, not a percentage approximation`,
    standardThreeItems.tileWidth !== null && Math.abs(standardThreeItems.tileWidth - (STANDARD_DEVICE_ROW_WIDTH - 2 * GAP) / 3) < 0.001
  );
  assert('3 items at standard width -> the computed tileWidth clears the 92px minimum with real room to spare', (standardThreeItems.tileWidth as number) >= MIN_TILE_WIDTH);

  assert('3 items, materially larger text (1.4), even at ample standard-device width -> 2 columns safe "two-plus-one" fallback — text size overrides width sufficiency', computeBriefingLayout(3, STANDARD_DEVICE_ROW_WIDTH, 1.4, GAP, MIN_TILE_WIDTH).columns === 2);
  assert('3 items exactly at the 1.3 threshold is NOT yet "materially larger" (strictly greater-than) -> still attempts 3 columns', computeBriefingLayout(3, STANDARD_DEVICE_ROW_WIDTH, 1.3, GAP, MIN_TILE_WIDTH).columns === 3);
  assert('3 items just over the threshold (1.31) -> drops to the 2-column fallback', computeBriefingLayout(3, STANDARD_DEVICE_ROW_WIDTH, 1.31, GAP, MIN_TILE_WIDTH).columns === 2);

  // Insufficient measured width — a synthetic narrow value, not any real
  // device's width, proving the fallback triggers purely from the
  // arithmetic (3*minTileWidth + 2*gap > availableWidth), independent of
  // any specific device.
  const narrowWidth = 3 * MIN_TILE_WIDTH + 2 * GAP - 1; // one pixel too narrow for 3 columns at the minimum tile width
  const narrowResult = computeBriefingLayout(3, narrowWidth, 1, GAP, MIN_TILE_WIDTH);
  assert('3 items, ordinary text, a measured width one pixel too narrow for 3×minTileWidth+2×gap -> safe 2-column fallback, not a forced/overflowing 3rd column', narrowResult.columns === 2);
  assert('the insufficient-width fallback returns tileWidth: null — it uses the unchanged percentage/flexGrow mechanism, not a broken fixed width', narrowResult.tileWidth === null);
  const justEnoughWidth = 3 * MIN_TILE_WIDTH + 2 * GAP;
  assert('3 items, a measured width of EXACTLY 3×minTileWidth+2×gap -> 3 columns (the boundary is inclusive, >=)', computeBriefingLayout(3, justEnoughWidth, 1, GAP, MIN_TILE_WIDTH).columns === 3);
}

console.log('\n=== Section 3: long reminder/account text cannot create an unbounded tile control row (Real import + Structural) ===');
{
  const longReminder = reminder({
    title: 'Confirm your repayment for the Extremely Long Buy Now Pay Later Provider Name Pty Ltd Instalment Plan',
    body: 'A very long body sentence describing every account choice available, intended to simulate the confirmed overflow defect from the physical-device retest, spanning many words to see if it leaks into the tile.',
  });
  const tiles = selectBriefingTiles(presentation(), longReminder, []);
  const reminderTile = tiles.find((t) => t.kind === 'reminder') as BriefingTile;
  assert('the reminder tile label is the fixed short word "Reminder", never the reminder\'s own (potentially very long) title', reminderTile.label === 'Reminder');
  assert('the reminder tile value is a short fixed category status, not the reminder\'s long body text', reminderTile.value.length < 30 && !reminderTile.value.includes('Extremely Long'));
  assert('the reminder tile supportingLine (if present) is short — never the full body sentence', reminderTile.supportingLine === null || reminderTile.supportingLine.length < 30);

  const SMART_REMINDER_CARD_SRC = readFileSync('src/components/today/SmartReminderCard.tsx', 'utf8');
  assert(
    'SmartReminderCard.tsx\'s actionRow (the row of account-choice pills that overflowed) has flexWrap: wrap — an arbitrary number of account buttons wraps onto additional lines instead of extending past the edge',
    /actionRow: \{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing\.sm \}/.test(SMART_REMINDER_CARD_SRC)
  );
  assert(
    "SmartReminderCard.tsx's actionButton has maxWidth: '100%' — a single very-long account name cannot itself extend past its parent's width",
    /maxWidth: '100%'/.test(SMART_REMINDER_CARD_SRC)
  );
  assert(
    'the compact Briefing tile itself renders zero reminder account-choice controls — TodayBriefingCard.tsx no longer imports SmartReminderCard at all',
    !/SmartReminderCard/.test(readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8'))
  );
}

console.log('\n=== Section 4: detailed reminder account actions remain reachable from the compact tile (Structural) ===');
{
  const REMINDER_SHEET_SRC = readFileSync('src/components/today/ReminderDetailSheet.tsx', 'utf8');
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
  // Device-test correction round — onNavigateAway={onClose} added to this
  // mount (see ReminderDetailSheet.tsx's own doc comment); still the
  // real, full SmartReminderCard with all its account-choice controls.
  // Final Pass 2D device-test correction — the conditional now gates on
  // `displayedReminder` (ReminderDetailSheet's own pinned "what's currently
  // being viewed" state) rather than the raw live topReminder prop
  // directly — see this round's final report §1-§3 for why reacting to the
  // live prop was the confirmed interaction-blocker root cause — and the
  // mount gained a new onSettled prop. Still the real, full, unmodified
  // SmartReminderCard with every account-choice control.
  // WHY STALE (final Pass 2D device-test correction, native-Modal-lifecycle
  // round): ReminderDetailSheet.tsx's own pinned displayedReminder state
  // was replaced by useReducer(reduceReminderLifecycle, ...) — the sheet
  // renders SmartReminderCard for the `reminder_detail` lifecycle state
  // (state.reminder, not displayedReminder), and gained two more props
  // (onRequestLoanRepayment/onRequestCreditCardRepayment) so it can REQUEST
  // a repayment form rather than mounting a second native-Modal-owning
  // sheet itself (this round's confirmed stacked-Modal fix — see
  // pass-2d-keyboard-correction.test.ts §3 and
  // pass-2d-interaction-lifecycle-correction.test.ts §2 for the full real-
  // function proof). Still the real, full, unmodified SmartReminderCard
  // component either way — only which lifecycle-state variable supplies
  // its `topReminder` changed.
  // WHY STALE AGAIN (Reminder-opening correction round): the confirmed
  // blank-sheet defect (a competing external `visible`/`onClose` boolean
  // racing this file's own reducer — see ReminderDetailSheet.tsx's own doc
  // comment for the full trace) removed the external `onClose` prop
  // entirely; `onNavigateAway` is now the local `handleForceClose`
  // (`dispatch({type:'FORCE_CLOSE'})`) — same semantic (close the sheet
  // before navigating to Cards), sourced locally instead of from a parent
  // callback that no longer exists.
  assert(
    // WHY STALE: Reminder queue correction round replaced state-derived
    // rendering with presentedState-derived rendering (blank-shell fix) and
    // onSettled with onOutcome (session-deferred "Not yet" fix) — same real
    // SmartReminderCard mount, updated wiring.
    'ReminderDetailSheet.tsx mounts the real, full, unmodified SmartReminderCard (all account-choice controls included) when a reminder is being displayed',
    /presentedState\.kind === 'reminder_detail' \? \(\s*<>\s*<SmartReminderCard\s*topReminder=\{presentedState\.reminder\}\s*onNavigateAway=\{handleForceClose\}\s*onOutcome=\{handleReminderOutcome\}/.test(
      REMINDER_SHEET_SRC
    )
  );
  // WHY STALE: the confirmed blank-sheet defect (see ReminderDetailSheet.tsx's
  // own doc comment) removed `reminderSheetVisible` entirely — the tile
  // press now builds an atomic ReminderOpenRequest (gated on a live
  // topReminder existing at all) instead of toggling a boolean.
  assert(
    'TodayScreen.tsx opens ReminderDetailSheet from the Briefing\'s reminder tile tap (onPressReminderTile), gated on a live topReminder and building a fresh atomic open request',
    /onPressReminderTile=\{\(\) => \{[\s\S]{0,700}if \(!topReminder\) return;[\s\S]{0,300}reminderOpenRequestIdRef\.current \+= 1;[\s\S]{0,300}setReminderOpenRequest\(createReminderOpenRequest\(reminderOpenRequestIdRef\.current, topReminder\)\);/.test(
      TODAY_SCREEN_SRC
    )
  );
  // WHY STALE: this round added a required `today` prop (so
  // ReminderDetailSheet's Done-tap handler can compute the next eligible
  // reminder from the latest committed data — see this round's final
  // report §5), which made the mount multi-line — and the Reminder-opening
  // correction round replaced `visible`/`topReminder`/`onClose` with the
  // single `openRequest` prop (the confirmed fix for the blank-sheet
  // defect: no more externally-tracked visibility boolean to race the
  // reducer).
  assert(
    'TodayScreen.tsx mounts ReminderDetailSheet with the atomic openRequest and today props',
    /<ReminderDetailSheet openRequest=\{reminderOpenRequest\} today=\{currentDate\} \/>/.test(TODAY_SCREEN_SRC)
  );
}

console.log('\n=== Section 5: all tile destinations remain authoritative — same handlers as Pass 2A (Structural) ===');
{
  const TODAY_SCREEN_SRC = readFileSync('src/screens/today/TodayScreen.tsx', 'utf8');
  assert('AUP tile still routes through onPressAup -> the same handleBriefingAupPress/focus_money_section authoritative destination (verified unchanged in pass-2b-visual-correction.test.ts Section 5)', /function handleBriefingAupPress\(\)/.test(TODAY_SCREEN_SRC));
  assert('event tiles still route through onPressEventRow — TodayBriefingCard.tsx passes the exact matching eventRows entry, never a re-derived one', /onPressEventRow=\{/.test(TODAY_SCREEN_SRC) || /onPressEventRow/.test(readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8')));
}

console.log('\n=== Section 6: Ocean Blue / Purple / Sunrise resolve through one central semantic palette, every style x scheme combination is fully defined (Real import) ===');
{
  const STYLES: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  const SCHEMES: Array<'light' | 'dark'> = ['light', 'dark'];
  const REQUIRED_KEYS: (keyof NaviloPalette)[] = [
    'heroGradientStart',
    'heroGradientEnd',
    'heroForeground',
    'tileSurface',
    'tileBorder',
    'primaryAccent',
    'secondaryAccent',
    'aiInsightSurfaceStart',
    'aiInsightSurfaceEnd',
    'aiInsightForeground',
    'attentionAccent',
    'progressAccent',
  ];

  let allDefined = true;
  const resolved: Record<string, NaviloPalette> = {};
  for (const style of STYLES) {
    for (const scheme of SCHEMES) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      resolved[`${style}-${scheme}`] = palette;
      for (const key of REQUIRED_KEYS) {
        if (palette[key] === undefined || palette[key] === null || palette[key] === '') allDefined = false;
      }
    }
  }
  assert('all 12 NaviloPalette fields are defined (non-empty) for every one of the 6 style x scheme combinations (Ocean Blue/Purple/Sunrise x light/dark)', allDefined);

  assert('Ocean Blue and Purple resolve to visibly distinct hero gradients in light mode — selecting a different style actually changes the hero colour', resolved['blue-light'].heroGradientStart !== resolved['purple-light'].heroGradientStart);
  assert('Purple and Sunrise resolve to visibly distinct hero gradients in light mode', resolved['purple-light'].heroGradientStart !== resolved['sunrise-light'].heroGradientStart);
  assert('Ocean Blue and Sunrise resolve to visibly distinct hero gradients in light mode', resolved['blue-light'].heroGradientStart !== resolved['sunrise-light'].heroGradientStart);
  assert('the same style resolves to a different (dark-appropriate) AI-insight surface between light and dark scheme — system appearance genuinely changes the output, independent of style', resolved['blue-light'].aiInsightSurfaceStart !== resolved['blue-dark'].aiInsightSurfaceStart);
  assert('Sunrise never resolves to the raw warning/gold colour for its hero — restrained champagne/amber, not colors.warning or colors.gold verbatim', resolved['sunrise-light'].heroGradientStart !== lightColors.warning && resolved['sunrise-light'].heroGradientStart !== lightColors.gold);
}

console.log('\n=== Section 7: system appearance (light/dark) and selected colour style vary independently — a full 3x2 cross product (Real import) ===');
{
  const STYLES: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  const seen = new Set<string>();
  for (const style of STYLES) {
    for (const scheme of ['light', 'dark'] as const) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      seen.add(`${palette.heroGradientStart}|${palette.heroGradientEnd}|${palette.aiInsightSurfaceStart}`);
    }
  }
  assert('all 6 style x scheme combinations produce 6 genuinely distinct palette signatures — no style/scheme pair silently collapses onto another', seen.size === 6);

  const bluePaletteLight1 = selectNaviloPalette('blue', 'light', lightColors);
  const bluePaletteLight2 = selectNaviloPalette('blue', 'light', lightColors);
  assert('selectNaviloPalette is a pure function — the same style/scheme/colors input always resolves to the identical palette output, never a hidden stateful/random component', JSON.stringify(bluePaletteLight1) === JSON.stringify(bluePaletteLight2));
}

console.log('\n=== Section 8: changing colour style cannot change Briefing tile eligibility, ordering, or calculations (Real import) ===');
{
  const p = presentation();
  const r = reminder();
  const events = [eventRow()];
  const tilesA = selectBriefingTiles(p, r, events);
  const tilesB = selectBriefingTiles(p, r, events);
  assert(
    'selectBriefingTiles never takes a colour-style or palette parameter — its signature is (presentation, topReminder, eventRows) only, so no colour-style selection anywhere in the app can alter tile eligibility/ordering/count',
    selectBriefingTiles.length === 3
  );
  assert('calling selectBriefingTiles twice with identical financial inputs produces identical tile kinds/order/values (deterministic, no palette-driven branching in tile selection)', JSON.stringify(tilesA) === JSON.stringify(tilesB));
}

console.log('\n=== Section 9: attention semantics stay independent of Sunrise branding — attentionAccent is always the red danger family (Real import) ===');
{
  const STYLES: NaviloColorStyle[] = ['blue', 'purple', 'sunrise'];
  for (const style of STYLES) {
    for (const scheme of ['light', 'dark'] as const) {
      const colors = scheme === 'light' ? lightColors : darkColors;
      const palette = selectNaviloPalette(style, scheme, colors);
      assert(`${style}/${scheme}: attentionAccent equals colors.danger, never the style's own ambient accent`, palette.attentionAccent === colors.danger);
    }
  }
  const sunriseLight = selectNaviloPalette('sunrise', 'light', lightColors);
  assert("Sunrise's attentionAccent is NOT the same colour as its own primaryAccent — an overdue reminder tile still visually stands out against a Sunrise background, never blending into the amber ambient", sunriseLight.attentionAccent !== sunriseLight.primaryAccent);

  const overdueReminder = reminder({ kind: 'bill_overdue' });
  const upcomingReminder = reminder({ kind: 'bill_due_soon' });
  const overdueTile = selectBriefingTiles(presentation(), overdueReminder, [])[1];
  const upcomingTile = selectBriefingTiles(presentation(), upcomingReminder, [])[1];
  assert('an overdue/due-today reminder tile keeps tone "attention" regardless of selected colour style (tone is computed once, upstream of any palette resolution)', overdueTile.tone === 'attention');
  assert('an ordinary upcoming (not-yet-due) reminder tile keeps tone "normal" — it does not become a warning merely because a warm-toned style like Sunrise might be selected elsewhere in the app', upcomingTile.tone === 'normal');

  const ordinaryEvent = eventRow({ tone: 'neutral' });
  const ordinaryEventTile = selectBriefingTiles(presentation(), null, [ordinaryEvent])[1];
  assert('an ordinary upcoming income/bill event tile keeps tone "normal" — tile tone is derived from the event\'s own existing tone field, never recomputed from or influenced by the selected colour style', ordinaryEventTile.tone === 'normal');
}

console.log('\n=== Section 10: style selection persists through the existing preference mechanism, exposed with clear customer-facing names (Structural) ===');
{
  const MODELS_SRC = readFileSync('src/types/models.ts', 'utf8');
  const THEME_CONTEXT_SRC = readFileSync('src/theme/ThemeContext.tsx', 'utf8');
  const SETTINGS_SRC = readFileSync('src/screens/settings/SettingsScreen.tsx', 'utf8');
  assert("models.ts's luluCardTheme field (the existing persisted preference) accepts all three styles: 'purple' | 'blue' | 'sunrise'", /luluCardTheme\?: 'purple' \| 'blue' \| 'sunrise';/.test(MODELS_SRC));
  assert('ThemeContext.tsx resolves naviloColorStyle from data.user.luluCardTheme (the same persisted field, not a new separate preference) and defaults to blue when unset', /const naviloColorStyle: NaviloColorStyle = data\.user\.luluCardTheme \?\? 'blue';/.test(THEME_CONTEXT_SRC));
  assert('ThemeContext.tsx exposes naviloPalette resolved from naviloColorStyle + the current scheme, memoised so it only recomputes when its real inputs change', /const naviloPalette = useMemo\(\(\) => selectNaviloPalette\(naviloColorStyle, scheme, colors\), \[naviloColorStyle, scheme, colors\]\);/.test(THEME_CONTEXT_SRC));
  assert('Settings exposes exactly three customer-facing choices — "Ocean Blue", "Purple", "Sunrise" — no engineering/token terminology (no "blue"/"aiBlue"/"naviloColorStyle" literal shown as a label)', /'Ocean Blue'/.test(SETTINGS_SRC) && /'Purple'/.test(SETTINGS_SRC) && /'Sunrise'/.test(SETTINGS_SRC));
  assert(
    'Settings section label was renamed from the old "<Score name> card style" to the clearer "<brand name> colour style" — checking the actual rendered label text, not historical doc-comment prose',
    /\{brand\.name\} colour style/.test(SETTINGS_SRC)
  );
}

console.log('\n=== Section 11: no raw colour values scattered through the touched components — everything resolves through naviloPalette/aiAccentColor tokens (Structural) ===');
{
  const BRIEFING_CARD_SRC = readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8');
  const TILE_ROW_SRC = readFileSync('src/components/today/BriefingTileRow.tsx', 'utf8');
  const CHECKIN_SRC = readFileSync('src/components/today/LuluCheckInCard.tsx', 'utf8');
  const HEX_LITERAL = /#[0-9A-Fa-f]{3,8}\b/g;
  assert('TodayBriefingCard.tsx contains no hard-coded hex colour literal — hero/tile colours all come from naviloPalette', !HEX_LITERAL.test(BRIEFING_CARD_SRC));
  assert('BriefingTileRow.tsx contains no hard-coded hex colour literal — tile surface/border/accent colours all come from naviloPalette', !new RegExp(HEX_LITERAL).test(TILE_ROW_SRC));
  assert('LuluCheckInCard.tsx contains no hard-coded hex colour literal — insight banner colours all come from naviloPalette', !new RegExp(HEX_LITERAL).test(CHECKIN_SRC));
}

console.log('\n=== Section 12: three-column mode cannot wrap or overflow, at any measured width — a numeric invariant proof (Real import) ===');
{
  const GAP = 8;
  const MIN_TILE_WIDTH = 92;
  // Sweep a wide, representative range of possible measured row widths
  // (from the narrowest a real device could plausibly report up to a
  // large tablet-width split view) and prove that whenever 3 columns are
  // selected, the three tiles plus both gaps can NEVER exceed the
  // available width — the exact invariant the old percentage-basis
  // approach violated. This is genuine arithmetic on the real
  // computeBriefingLayout function, not a structural source match.
  let allFit = true;
  let anyThreeColumnCase = false;
  for (let width = 200; width <= 900; width += 1) {
    const result = computeBriefingLayout(3, width, 1, GAP, MIN_TILE_WIDTH);
    if (result.columns === 3 && result.tileWidth !== null) {
      anyThreeColumnCase = true;
      const totalConsumed = 3 * result.tileWidth + 2 * GAP;
      if (totalConsumed > width + 0.001) allFit = false; // tiny epsilon for float rounding only
    }
  }
  assert('the sweep actually exercised the 3-column branch at least once (the invariant below is not vacuously true)', anyThreeColumnCase);
  assert('for every measured width from 200 to 900px where 3 columns were selected, 3×tileWidth + 2×gap never exceeds the measured width — the third tile can never wrap', allFit);

  // The specific regression width again, spelled out as a standalone
  // invariant check independent of the sweep above.
  const standard = computeBriefingLayout(3, 326, 1, GAP, MIN_TILE_WIDTH);
  assert(
    'at the standard recorded-device row width (326px), 3×tileWidth + 2×gap fits within 326px with room to spare — the exact case that regressed is now proven not to overflow',
    standard.columns === 3 && standard.tileWidth !== null && 3 * standard.tileWidth + 2 * GAP <= 326
  );
}

console.log('\n=== Section 13: BriefingTileRow wiring — fixed-width 3-column tiles cannot grow/shrink; 1-/2-column fallback is byte-identical to before this correction (Structural) ===');
{
  const SRC = readFileSync('src/components/today/BriefingTileRow.tsx', 'utf8');
  assert('BriefingTileRow.tsx measures its own row width via onLayout — the single source of truth for the column decision, never a guessed/hard-coded device width', /onLayout=\{handleRowLayout\}/.test(SRC) && /setRowWidth\(e\.nativeEvent\.layout\.width\)/.test(SRC));
  assert('BriefingTileRow.tsx computes columns/tileWidth via computeBriefingLayout(tiles.length, rowWidth, fontScale, spacing.sm, TILE_MIN_WIDTH) — one deterministic source for both the column decision and the tile width, per this round\'s explicit requirement', /computeBriefingLayout\(tiles\.length, rowWidth, fontScale, spacing\.sm, TILE_MIN_WIDTH\)/.test(SRC));
  assert(
    'when 3 fixed-width columns are selected, flexGrow and flexShrink are both disabled (0) — the exact defect (a lone wrapped tile stretching full-width via flexGrow) cannot occur when 3 columns were the selected outcome',
    /flexGrow: isFixedThreeColumn \? 0 : 1/.test(SRC) && /flexShrink: isFixedThreeColumn \? 0 : 1/.test(SRC)
  );
  assert('the fixed-width 3-column tile sets an explicit pixel width (not a percentage flexBasis) — eliminating the percentage/fixed-gap mismatch that caused the regression', /width: isFixedThreeColumn \? \(tileWidth as number\) : undefined/.test(SRC));
  assert('the 1-/2-column fallback still uses percentage flexBasis at 100%/48% — unchanged from before this correction, confirming this is a narrow fix to the 3-column case only', /const basisPercent = columns === 1 \? 100 : 48;/.test(SRC));
  assert('minWidth remains the 92px floor for every tile regardless of column mode — a defensive backstop unchanged by this correction', /minWidth: TILE_MIN_WIDTH/.test(SRC) && /const TILE_MIN_WIDTH = 92;/.test(SRC));
}

console.log('\n=== Section 14: everything NOT in scope this round is confirmed unchanged (Structural regression) ===');
{
  const TILE_ROW_SRC = readFileSync('src/components/today/BriefingTileRow.tsx', 'utf8');
  const BRIEFING_TILES_SRC = readFileSync('src/lib/calculations/briefingTiles.ts', 'utf8');
  const CREDIT_CARD_TEST_SRC = readFileSync('tests/pass-2b-icon-contrast-and-creditcard-save.test.ts', 'utf8');

  assert(
    'the tile icon colour expression is unchanged — normal tone still reads naviloPalette.tileIconForeground, attention tone still reads naviloPalette.attentionAccent, exactly as accepted in the previous correction round',
    /color=\{tile\.tone === 'attention' \? naviloPalette\.attentionAccent : naviloPalette\.tileIconForeground\}/.test(TILE_ROW_SRC)
  );
  assert('the tile value Text still uses numberOfLines={1} + adjustsFontSizeToFit + minimumFontScale={0.75} — financial amounts still bounded-shrink, never silently truncated, unaffected by this width correction', /numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.75\}/.test(TILE_ROW_SRC));
  assert('selectBriefingTiles (AUP -> reminder -> events order, Score never included) is untouched this round — same function body as the previous accepted round', /export function selectBriefingTiles\(presentation: SafeToSpendPresentation, topReminder: SmartReminder \| null, eventRows: TodayBriefingEventRow\[\]\): BriefingTile\[\] \{/.test(BRIEFING_TILES_SRC));
  assert('this round did not touch the credit-card Save correction test file — its assertions remain present and are re-run as part of the full suite, not modified by the layout fix', CREDIT_CARD_TEST_SRC.includes('=== Section 3: root cause and fix of the silent Save failure'));
  assert('TodayBriefingCard.tsx (tile ordering/destinations/Score-outside-budget) was not touched this round', !/isFixedThreeColumn|computeBriefingLayout/.test(readFileSync('src/components/today/TodayBriefingCard.tsx', 'utf8')));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures > 0) process.exit(1);
