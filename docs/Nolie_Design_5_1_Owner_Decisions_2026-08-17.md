# Nolie Design 5.1 — Product-Owner Decisions

**Date:** 17 August 2026
**Baseline:** `main` @ `6f304e9ebbba0412b223dbf70051a1b26d9df177` — `checkpoint: stabilise floating navigation and quick-action foundation`
**Purpose:** Resolve the open blockers recorded in [`Nolie_Design_5_1_Implementation_Plan_2026-08-17.md`](Nolie_Design_5_1_Implementation_Plan_2026-08-17.md) §A.6 and §H.6, and record the Wave 1 split.

These are owner decisions. They override the plan's recommendations where they differ, and they are the authority for Wave 1A implementation.

---

## 1. Expo SDK 54 is authoritative — resolves blocker C-7

- The installed **Expo 54 / React Native 0.81.5 / React 19.1.0** stack remains unchanged.
- Do not upgrade Expo, React Native, React, `jest-expo`, or any unrelated dependency.
- Use Expo SDK 54 documentation and `npx expo install` for any addition.
- `AGENTS.md` pointed at `https://docs.expo.dev/versions/v57.0.0/`, which contradicted the installed stack. **Only that stale version reference is corrected to v54.** No other instruction in `AGENTS.md` changes.

**Known pre-existing condition, deliberately not fixed.** `npx expo-doctor` at baseline reports 17/18 checks passing, with one failure: package `expo` is `54.0.35` where the installed SDK expects `~54.0.36`. Correcting it would mean upgrading Expo, which this decision forbids. It is recorded as the accepted baseline; Wave 1A must not make it worse and must not silently resolve it.

## 2. Keep Ionicons — resolves blocker C-1

- Do not install `lucide-react-native`.
- Do not migrate icons. `@expo/vector-icons` (Ionicons) remains in use across the 83 files that consume it.
- Design 5.1's Lucide specification (24 grid, 1.75 stroke, round caps) is treated as **visual reference**; its stroke/size intent may be mapped onto Ionicons in a later wave.
- The four custom tab glyphs (`today-sunrise`, `money-currents`, `wealth-contour`, `grow-sprout`) remain **deferred** (blocker C-2 — path data absent from the entire 30-file design corpus). They do not block Wave 1A.

## 3. Derive the six-theme matrix and compute contrast locally — resolves blockers C-3 and C-4

- Do not wait on a further Claude Design response.
- `Nolie_Design_5_Tokens.json` contains `componentThemeMatrix` (semantic **role names** per component) but **not** the per-component variant × state × six-theme resolved value matrix that Design B p.6 and the handoff promise. Wave 1A **derives** that matrix by construction from `color.shared[scheme]` + `color.styleScoped[style][scheme]`.
- The package contains **no contrast table**, despite Doc A p.14 stating "Full table in Tokens.json". Wave 1A **computes** contrast ratios locally and asserts the Doc A p.14 floors:
  - body text ≥ 4.5:1 on its own surface;
  - large figures ≥ 3:1;
  - icons/chrome ≥ 3:1;
  - disabled exempt, shape-stable.
- **Recorded for traceability:** the component-role catalogue and the contrast table in this repository are *derived locally from the Design 5.1 semantic sources*, not supplied by Claude Design. If Claude Design later issues authoritative versions, they must be reconciled against the derived ones.

## 4. Thai scope is limited — resolves blocker C-6

- Build the **correct locale-aware font architecture** now: English textual roles resolve to Figtree, Thai textual roles to Noto Sans Thai, and financial/numeric figure roles to Figtree in both locales.
- Verify **only the existing translated content** (`src/i18n/locales/th.json`, 26 keys, consumed by 3 screens).
- **Do not add or translate customer copy in this wave.** `src/i18n/**` is not modified.
- **Do not claim full Thai localisation compliance.** Design 5.1's W11 acceptance criterion 10 ("Thai expansion: no clipped buttons or truncated money labels") remains formally out of reach until localisation is commissioned as its own workstream.

## 5. Wave 1 is split into 1A and 1B

**Wave 1A — additive foundation only (this wave).**
- Design 5.1 semantic token system added *alongside* the existing public token API.
- Locale-aware typography roles and resolver.
- Font bootstrap (packages, loading, splash release, failure path).
- Named motion constants.
- Focused tests for all of the above.

**Wave 1B — migration and enforcement (not this wave).**
- Feature-file colour migration (the 12 files listed in the plan §C.2).
- Global font-consumer migration.
- Legacy token deletion.
- `contrastOverrides.ts` retirement.
- The zero-raw-colour enforcement gate.

### Additional Wave 1A decisions

| Decision | Detail |
|---|---|
| **Motion tokens move into Wave 1A** | `src/theme/motion.ts` ships now, additive only — no component animation change, no Add-transition change, no raw-duration migration. The purpose is that Waves 2–10 consume **named** motion tokens from their first commit rather than retrofitting them. |
| **Global raw-colour removal deferred to Wave 1B** | The plan's "no hex or `rgba()` outside `src/theme/`" gate is **not** applied in Wave 1A. In its place Wave 1A may add a **debt-budget** test that records the current baseline count and fails only if the count *increases* — it must permit decreases so later waves can ratchet it down. No existing financial or rendered test may be edited to accommodate it. |
| **`expo-splash-screen`** | May be added **only if** it is not already a direct, SDK-54-compatible dependency. Verified at baseline: **absent** from `package.json` dependencies and **not installed** in `node_modules`. Adding it via `npx expo install` is therefore authorised. |
| **`expo-font`** | Already present at `~14.0.12` and already registered as a plugin in `app.json`. Must **not** be upgraded independently. |
| **`app.json`** | Not changed in Wave 1A. `userInterfaceStyle` stays `"light"`; the change to `"automatic"` (D5-019) belongs to Wave 2. |

---

## Files and areas forbidden in Wave 1A

`src/lib/calculations/**` · Add / tray / floating-navigation components · `floatingAddTransition.ts` · `addWorkspaceTransitionController.ts` · `AddAnythingSheet.tsx` · routed screen layouts and copy · the 12 feature files listed for colour migration in the original Wave 1 · `app.json` · `src/state/**` · storage, persistence, models · `src/i18n/**` · any existing test expectation · `contrastOverrides.ts` · icon dependencies and icon usage.

There must be no calculation, persistence, navigation, Add, compliance-copy or customer-visible screen-composition change in Wave 1A.

---

## Implementation note — verified Wave 1B baseline (added 17 Aug 2026)

This note records verified measurements only. **It does not change any owner policy above.**

### Raw-colour baseline: 76 literals / 17 files → corrected to **74 / 16**

Plan §C.2 lists **12 principal files** for colour migration. The Wave 1A scan reported **76 literals across 17 files**. Both figures are reconciled as follows:

- The 5 additional files are the **"remainder" §C.2 already anticipates** ("Remainder — audit during W1"): `ScoreExplanationSheet.tsx`, `AskLuluSheet.tsx`, `DatePickerModal.tsx`, `InfoSheet.tsx`, `OptionsSheet.tsx`, `DebtCoachSheet.tsx` — each carrying a single sheet-backdrop scrim.
- **Two of the 76 were false positives.** `MainTabNavigator.tsx` contained no colour at all: `#12755` and `#39514` are GitHub issue references in a comment, matched because the Wave 1A scanner used `#[0-9A-Fa-f]{3,8}`. A valid CSS/RN hex colour is exactly 3, 4, 6 or 8 digits, never 5.
- One further match (`KeyboardSheet.tsx`) was a colour named inside a comment, not applied styling.

**Verified baseline: 74 literals across 16 files, of which 73 were applied.** `MainTabNavigator.tsx` required no change and was not edited. The enforcement gate now uses strict hex lengths and strips comments before scanning.

### Wave 1B delivery status against §5

| §5 item | Status |
|---|---|
| 1. Feature-file colour migration | **Complete** — 0 raw colours outside `src/theme` |
| 5. Zero-raw-colour enforcement | **Complete** — debt-budget ratchet replaced by an absolute gate |
| 2. Global font-consumer migration | **Blocked** — see below |
| 3. Legacy token deletion | **Blocked** — see below |
| 4. `contrastOverrides.ts` retirement | **Blocked** — see below |

### Blocker A — global font migration requires a 173-site weight-override conversion

Giving the legacy `typography` roles a locale-aware `fontFamily` centrally in `ThemeContext` migrates all **549** `...typography.<role>` spreads with no call-site change. However **173 styles across 68 files** spread a role and then override `fontWeight`. Once the role carries a fixed-weight family (e.g. `Figtree_700Bold`), a local `fontWeight: '600'` cannot be honoured — iOS ignores the weight for a named family and Android synthesises it. Shipping the central change alone would render **90 sites at 700 that are currently 600**, a visible regression across Today, Money, Wealth, Grow and the Add forms.

The central wiring was implemented, measured, and **reverted** rather than shipped half-complete. Completing it requires converting all 173 sites to declare the matching family — a mechanical but 68-file style pass, including screens and Add form components.

**Additionally, 8 of those sites use `fontWeight: '800'`.** Design 5.1 defines no 800 weight and Wave 1A bundles only 400/500/600/700. Mapping 800 → 700 would be a new design decision, so it is referred rather than assumed.

Unused-but-tested resolver API was retained in `typography.ts` (`resolveLegacyTypography`, `fontFamilyForWeight`, `moneyFontFamily`) so the conversion has a ready foundation.

### Blocker B — legacy token deletion requires per-site visual decisions

**1,205 `colors.<field>` references across 95 files.** The blocking case is `colors.accent` (green): Design 5.1 retires green as the brand accent and makes interactive Ocean Blue, but `accent` is currently the *interactive/selected* colour (Settings active row, Language selected option, links, `glow()`). Migrating it means deciding per call site whether each use means `interactive` or `success` — turning selected states from green to blue across every screen. That is the screen restyle assigned to Waves 2, 4 and 9, not a token rename. `naviloPalette` (9 files) and `aiAccentColor` (8 files) are the Today/Grow hero systems that Waves 5 and 8 replace outright.

### Blocker C — `contrastOverrides.ts` is asserted by three existing tests

`tests/pass-2e-contrast-corrections.test.ts` real-imports `WARNING_TEXT_LIGHT_OVERRIDE` and `HERO_SCRIM_OPACITY` and asserts contrast ratios against them; `tests/rendered/pass-2e-contrast-corrections.render.test.tsx` and `tests/worth-knowing.test.ts` also reference them. It has **5 live consumers**, 4 of which are Today components outside the colour-migration file set. Deleting the module breaks three existing tests, and editing existing test expectations is prohibited.

---

# Change control — Wave 1 completion and rephasing

**Dated 17 August 2026. Owner-authorised after completing the Wave 1B device checklist.**

This entry records new decisions. It does not rewrite any decision above.

## Wave 1 accepted as complete

Wave 1 ships:

- semantic Design 5.1 foundations;
- six-theme resolution;
- computed contrast;
- locale-aware font architecture with locally bundled font assets;
- font boot with non-blocking failure handling;
- named motion constants;
- all raw colours outside `src/theme` migrated;
- final zero-raw-colour enforcement;
- all existing calculations, navigation contracts, Add behaviour and persistence preserved.

### Corrected factual baseline

| Figure | Superseded value | Correct value |
|---|---|---|
| Pre-existing legacy test files | 47 | **50** — the 47 was a report-parsing error; three files print `N/N assertions passed.`, which the summary grep missed |
| Raw-colour literals / files | 76 across 17 | **74 across 16** — two were GitHub issue numbers in a `MainTabNavigator.tsx` comment, matched by an over-broad `#[0-9A-Fa-f]{3,8}` pattern |

### Why the three remaining migrations were rephased

The original Wave 1 assumed all three were bounded. Measurement disproved that:

- font migration: **68 files, 173 conflicting weight overrides** (90 would visibly regress from 600 to 700);
- legacy tokens: **95 files, 1,205 references** needing per-site semantic reinterpretation;
- `contrastOverrides.ts`: **5 consumers and 3 existing tests** still depend on it.

## Rephased — global font migration

Migration moves into the owning waves:

| Wave | Scope |
|---|---|
| 2 | navigation, dock and global shell consumers |
| 3 | tray and Add-workspace consumers |
| 4 | shared primitives and the seven form bodies |
| 5–9 | each screen's remaining consumers |
| End of 9 | zero-platform-default-font audit |
| 11 | audit repeated as final verification |

Rules:

- No new unapproved platform-default font consumer from Wave 2 onward.
- Every file a wave touches must migrate its applicable text to the Design 5.1 locale-aware resolver.
- English textual roles → Figtree. Thai textual roles → Noto Sans Thai. Financial/numeric roles → Figtree in both locales.
- Existing `fontWeight: '800'` sites are mapped **individually** to a documented semantic type role during their owning wave. **No blanket 800→700 substitution.**

## Rephased — legacy-token migration

Incremental across Waves 2–9:

- every touched file migrates its applicable legacy colour and typography consumers;
- no new legacy-token consumer may be introduced;
- legacy definitions may remain only while verified consumers remain;
- zero-consumer proof and deletion at the end of Wave 9; verified again in Wave 11.

This does **not** authorise unrelated screen, logic or component restructuring earlier than its owning wave.

## Rephased — `contrastOverrides.ts` retirement → Wave 5

Its remaining consumers are primarily Today components and its existing tests assert current presentation. Wave 5 must: migrate all remaining consumers; rewrite **only** presentation-specific contrast assertions that are legitimately superseded; preserve all financial and behavioural expectations; prove all six-theme contrast floors; and delete the module only after zero-consumer proof.

## Tracked item — Wealth delta treatment

Wealth's positive/negative delta currently uses `ON_FEATURED_POSITIVE` on a gradient hero. Reassess against `movementPositive` / `movementNegative` during **Wave 7**. **Do not change it now.**

## Invariants

All 20 functional and data invariants from the audit §14 remain preserved unchanged. Wave 1A is additive foundation work and touches no engine, no persistence path and no navigation contract.

---

# Owner decision 6 — Android physical testing deferred to Wave 11 (18 August 2026)

**Context.** Wave 3 (origin-aware Add architecture and the six-action tray) completed all automated gates and passed owner iOS device testing. The plan requires physical Android device verification as an external gate. The owner does not currently have access to an Android device.

**Decision (owner, explicit and authorising).**

- The owner currently has **iOS testing access only**.
- **Wave 3 iOS device testing passed** and is approved.
- **Physical Android hardware Back, TalkBack and transition-stress testing was not performed** for Wave 3.
- The owner **accepts the temporary development risk** so that development may continue.
- **Android physical verification moves to Wave 11** and remains **mandatory before any Android beta, production build or public release**.
- **Automated Android gates remain mandatory during every wave**: TypeScript, legacy tests, rendered tests, Expo Doctor, and `npx expo export --platform android`.
- **No report may describe Android physical testing as passed until it actually occurs.**

**Status.** Deferred, **not** passed and **not** permanently waived. This decision resolves the Wave 3 checkpoint blocker for development purposes only.

**Residual risk carried forward.** The Android-divergent surfaces Wave 3 introduced or altered and which remain physically unverified:

1. `BackHandler` hardware Back at an Add-workspace root (journey Cancel, clean and dirty).
2. Hardware Back with the quick tray open (must close the tray only).
3. Hardware Back during `closingForAction` (must not open a workspace).
4. Catalogue-origin Back across all 14 Add tasks on Android navigation timing.
5. TalkBack announcement of the canonical catalogue rows and the `+` expanded state.
6. Transition-stress and freeze behaviour under Android's own animation and lifecycle timing.

These become explicit Wave 11 sign-off items.

---

# Change control — Wave 5 (Today) implementation record (19 August 2026)

**Status.** Implemented, all automated gates passed, **unstaged and uncommitted** pending owner iOS device testing. Wave 6 not started.

## 1. The composed Today hierarchy

Today now composes, in this order: greeting → money-picture checklist → Today Briefing hero → journey snapshot → current-month snapshot → Worth Knowing → goal → Score footnote.

The setup checklist keeps its previously accepted third-from-top priority and still owns its own `moneyPictureChecklistDismissed || allDone` visibility rule — Today renders it unconditionally and does not gate it. For an established customer the card returns null exactly as it always did, so the completed-user hierarchy begins at the Briefing.

## 2. Cards excluded from the default composition — dispositions

Each card below is **removed from Today's default composition only**. Every component file, every engine and every navigation destination is preserved unchanged. Nothing was deleted from the repository.

| Card | Disposition | Where its value now lives |
|---|---|---|
| `ProfileNudgeCard` | Removed from Today | Setup prompting is the money-picture checklist's job; two competing setup prompts on one page was the defect. |
| `FinancialStateCard` | Removed from Today | `financialState.ts` is untouched and still serves the Wealth Map. It is no longer a fallback beneath Worth Knowing. |
| `SavingFactsCard` | Removed from Today | Generic, non-personal content; it competed with a real personalised insight for the same slot. |
| `LuluCheckInCard` | Removed from Today | Retained in the codebase, unrouted from Today. |
| `LuluRecommendationCard` | Removed from Today | Retained in the codebase, unrouted from Today. |
| `SmartReminderCard` | No longer a standalone default card | The top reminder is represented by the Briefing's reminder tile; `ReminderDetailSheet`, the full reminder lifecycle and `reminders.ts` are all unchanged and still reachable. |

**No engine, no persistence path, no navigation route and no financial calculation was altered by any of these removals.**

## 3. Worth Knowing owns the insight slot alone

`pickWorthKnowingInsight` is called exactly once and at most one insight card can render. There is no `FinancialStateCard` fallback, no negative-net-worth suppression, and when nothing qualifies the slot renders nothing at all — no card and no spacer. `worthKnowing.ts` itself is unchanged.

## 4. Score containment

The Score is no longer Briefing content in any form. It renders as a quiet supporting footnote row after the goal section, carrying one accessible sentence that conveys the label and the containment together.

Copy changes (presentation only — `luluScore.ts` is unchanged):

- available → `Interim · Based on what you’ve recorded · Not a credit score`
- locked → `Not enough recorded yet` (was `Add income to unlock`)
- unavailable/invalid → `Not enough recorded yet` (was `Score unavailable`)

A locked, invalid or out-of-range score shows **no number** — never `0` as a stand-in, and never a clamped value. The existing Score explanation destination is unchanged.

## 5. `contrastOverrides.ts` retired

The module is **deleted**, with zero remaining consumers. Its two gradient-contrast roles moved into `semanticTokens.ts` with their derivations carried over unchanged (`HERO_SCRIM_OPACITY`, `INSIGHT_PROVENANCE_OPACITY`).

`WARNING_TEXT_LIGHT_OVERRIDE` was **replaced outright rather than moved**. Its four consumers (`MonthSnapshotCard`, `FinancialStateCard`, `SmartReminderCard`, `WorthKnowingCard`) now read the Design 5.1 `semantic.warning` role, which at `#8A5E14` in light is **darker** than the legacy override `#986209` it existed to correct — so the override is no longer needed to meet the floor. All six-theme contrast floors pass (`design5-contrast` 141/141, `pass-2e-contrast-corrections` 43/43).

## 6. Superseded test assertions

Presentation and source-order assertions were updated **only** where the authorised Design 5.1 hierarchy supersedes them. In every case the behavioural, financial, lifecycle, navigation and accessibility intent was preserved and re-asserted against the new hierarchy — no financial expectation was edited to accommodate a changed output.

Files reconciled: `design5-wave4-picker-inventory`, `pass-2b-correction`, `pass-2b-score-journey`, `pass-2b-visual-correction`, `pass-2d-today-grow-hierarchy`, `pass-2e-contrast-corrections` (+ rendered), `worth-knowing`.

## 7. Out of scope, unchanged

The deferred per-goal AUP opt-in is **not** Wave 5 work and was not started. Ionicons remains the approved icon mapping; Lucide was not adopted. Android physical testing remains deferred to Wave 11.

---

# Change control — Wave 5 visual-fidelity pass for Today (20 August 2026)

**Status.** Implemented, all automated gates passed, **unstaged and uncommitted** pending owner iOS device testing. Wave 5 not checkpointed. Wave 6 not started.

## 1. Why the first Wave 5 pass looked unchanged

The first pass implemented the Design 5.1 **composition** — which cards appear, in what order, under what caps — and proved it with source-order and selector assertions. Every one of those assertions was still true of the pre-5.1 *appearance*, so the pass could be fully green while the screen looked identical.

Concretely: the Briefing kept its saturated `naviloPalette` gradient and its three-column tile grid; the AUP figure rendered at tile scale beside the words "Bill due"; the Journey kept its five-piece card; the month card kept two shadowed mini-tiles plus a boxed net strip; Worth Knowing kept a second gradient; there was no ambient field and no date eyebrow. The hierarchy was right and nothing else was.

## 2. Ambient field and header

`TodayAmbientField` mounts into `Screen`'s existing ambient slot: the `ambient` semantic role's ordered stops, eased (t²) so the tint is strongest at the top and has mostly resolved by two-thirds down, over `220pt + safe-area inset` so the fade is measured from the true top of the screen. `pointerEvents="none"` on both the slot and the layer. No image, no dependency, no entrance animation, no raw colour. It renders nothing rather than a flat block if a theme ever supplies fewer than two stops.

Header anatomy is now local date eyebrow → greeting (`titleScreen`) → 44pt circular Settings control. The date comes from `formatTodayDateEyebrow(currentDate)` — the customer's own live local calendar — and is uppercased by the `eyebrow` **type role**, which suppresses the transform for Thai. The brand lockup was removed.

## 3. The hero

One `heroSurface` gradient at `designRadius.hero` (20pt), replacing the saturated purple block. Anatomy: eyebrow → measure label → `figureHero` (46pt) figure → timeframe line → divider → up to two priority rows → provenance footer left / **How this works** right.

The measure block is one tap target opening the same authoritative AUP destination as before. The timeframe line (`formatHeroTimeframe`) is read straight off the Safe-to-Spend result and returns **null** rather than guessing when no payday is known. Setup state keeps the hero's geometry, renders **no figure slot at all**, states the presentation's own exact missing-input copy, and carries the same `AVAILABLE…` accessible name so the affordance keeps one identity in every state.

## 4. Priority rows

`selectBriefingPriorityRows` takes the array `selectBriefingTiles` already produced, drops the AUP tile (now the hero headline) and enriches each remaining tile with the exact date and amount a third-width tile had no room for — joining against the same timeline events and the same reminder the Briefing was already given, via the engine's own occurrence-identity functions. **Order and cap are inherited by construction**, not re-derived.

Each row: 28pt marker tile, the engine's own label verbatim, exact date, amount, chevron, one composed spoken sentence, ≥52pt height over a 44pt touch floor. Four markers, not two: `urgent` is reserved for money genuinely already late; a bill due **today** is `caution`. Income is only ever `positive`. Amounts drop to their own line rather than truncating at compact width or accessibility text sizes.

## 5. Journey, month, Worth Knowing, goal, Score

- **Journey** — one compact row (28pt tile, title, stage, slim bar, metadata, chevron), flat and bordered. Its separate "View full journey" footer is gone; the whole row is the target, same destination. Metadata moves below the title at accessibility sizes.
- **Month** — one flat card with three labelled measures, reflowing three-column → two-plus-one → stacked. **No arithmetic in the component**: `selectMonthMeasures` produces labelled, formatted, toned view models.
- **Worth Knowing** — flat highlighted tier (`infoTint` + `infoBorder`), no gradient. `info` is a shared role, so it is invariant across Ocean/Purple/Sunrise **by Design 5.1's rule** that a style may not retint status roles.
- **Goal** — one compact row using the shared Wave 4 `resolveGoalProgressState`; percentage trails, or moves below at accessibility sizes.
- **Score** — unchanged containment; restyled to quiet `meta` ink with no fill, radius or elevation.

## 6. Third month measure — documented variance

Design 5.1 p.7 prefers "Money in / Spending recorded / **Moved to savings**". **No canonical selector for money moved to savings exists.** `monthlySummary.ts` exposes income, aggregate spending and three payment-source buckets; `PaymentSource` has no `savings` value (`computeThisMonthRecordedSummary` records savings as explicitly deferred scope). Creating it would be an engine change — a stop condition for this pass and barred by Wave 5's read-only engine list.

The third measure is therefore **Net recorded** = recorded income − recorded spending: the exact figure this card already displayed as "Net this month", lifted out of the component into a pure function. **Its value is byte-identical to before this pass.** Money in keeps its established `+` sign; spending is a magnitude under its own explicit label (the previous `-$860` read as a correction); a negative net keeps its minus. Spending is always neutral ink, never urgent red; a negative net is caution, never urgent.

## 7. A false positive this pass exposed

`grow-tab-navigation.render.test.tsx` asserted canonical Grow content via `findByText('Your Journey')`. **Today's own section header rendered that same string**, so on paths where Grow was never reached the helper matched Today's header and reported success. Two tests were passing on that. Since Pass 2E, Today's Score and Journey controls **push `GrowDetail`, a root-stack route this tab-only harness does not register**, so those navigations never resolved there. The helper now asserts the **header role**, which only Grow's section heading carries; the two tests keep the regression they actually guard (a later plain tab tap still renders canonical Grow content) and no longer claim a navigation the harness cannot perform. The pushed destinations remain fully covered by `pass-2e-pushed-destinations.render.test.tsx` against the real `RootNavigator`.

## 8. Superseded presentation assertions

Updated **only** where the authorised Design 5.1 anatomy supersedes them; each kept its behavioural, financial, lifecycle, navigation and accessibility intent and was re-asserted against the new construction. **No financial expectation was edited.**

`design5-today-checklist-priority`, `pass-2b-correction`, `pass-2b-score-journey`, `pass-2b-visual-correction`, `pass-2d-today-grow-hierarchy`, `today-briefing`; rendered: `accessibility-semantics`, `grow-tab-navigation`, `pass-2e-pushed-destinations`, `pass-2e-final-corrections`, `reminder-lifecycle`, `reminder-focus-announcements`, `worth-knowing`, `design5-wave5-today`.

Accessible names that deliberately changed: an event/reminder row is now named by the **item itself** rather than a category word; the Journey row leads with its own name; the Briefing's header role sits on its Design 5.1 eyebrow; the goal row speaks amounts as well as percentage.

## 9. Out of scope, unchanged

All read-only engine hashes verified unchanged. No dependency, Expo-config, navigation, persistence or model change. `contrastOverrides.ts` stays retired with no local colour override reintroduced. Ionicons remains the approved mapping. The deferred per-goal AUP opt-in was not started. Wave 6's This Month Sources sheet was not started. Android physical testing remains deferred to Wave 11.

---

# Change control — Wave 5 closure corrections (20 August 2026)

**Status.** Implemented, all automated gates passed, **unstaged and uncommitted** pending owner iOS device testing. Wave 5 not checkpointed. Wave 6 not started.

Three authorised corrections following the owner's iOS device test of the Wave 5 visual pass.

## A. Duplicate setup guidance removed from Today

**Root cause.** Today rendered the month heading and `MonthSnapshotCard` unconditionally. The card owned its own empty state ("Not enough information yet. Add your income and spending to unlock your monthly snapshot."), so an incomplete customer saw the money-picture checklist *and* a second, differently-worded ask for the same thing directly beneath it. The card's `hasData` rule and the screen's decision to render the heading were two separate things, so the heading could not be suppressed with the card.

**Fix.** One eligibility rule, `isMonthSectionEligible(activity)` — the *same* `income > 0 || spend > 0` test the card already applied — now gates the heading and the card **together**. When ineligible the whole section is absent: no unlock copy, no empty card, no orphaned month heading, no spacer.

`computeMonthToDateActivity` (unchanged) is called **once**, in the screen, and its result passed to the card, so the two cannot disagree. The card no longer has an empty state at all.

**Consequence, deliberate.** The empty card's Add-transaction entry point went with it, leaving `transactionModalVisible` and Today's `QuickAddModal` with no caller. A permanently unreachable second Modal in Today's tree is worse than none, so both were removed. **Add transaction is unaffected** — the global `+` owns it via `AddAnythingSheet`, which mounts its own `QuickAddModal`.

**Money is untouched.** Money's This Month card is a different component (`ThisMonthCard`); its empty state and its own Add-transaction action remain.

## B. Today's no-goal entry

**Root cause — and a correction to the reported symptom.** The owner reported that Goal creation from Today "still looks like the old design". Inspection shows that is **not** a routing defect. There is exactly one goal form in the codebase, and all five entry points — Today, Goals, Grow, Money and `AddAnythingSheet` (both the direct `+` and the catalogue) — already render `AddGoalModal`. Its body is a single shared `content` constant used by both standalone and embedded modes, rendering one `GoalFormFields` instance, so the two paths cannot drift.

What looked old was **Today's no-goal card, not the form it opened**. That slot used the shared `UnlockPromptCard`: a pale accent-tinted panel whose only tap target was a small filled pill nested inside an otherwise non-actionable card. Three problems — the pill read as a success/confirm action for what is a neutral invitation; most of a full-width surface was dead to touch; and the tinted panel competed with the two tiers above it that are meant to stand out.

**Fix.** Today's goal slot is now one calm interactive row on the same flat supporting surface as the active-goal row: outline flag in `interactiveTint`, **"Plan a goal"**, "Choose what you're working towards and track progress over time.", trailing **"Create goal"** in the interactive role, chevron. One whole-row press target, 56pt minimum height, one accessible announcement plus hint, no emoji, **no success green**. Supporting copy and trailing action reflow at accessibility text sizes rather than truncating.

`UnlockPromptCard` itself is untouched and still used by Today's Score unlock and by other screens. No form was created, changed or unwired; the row opens the same `setGoalModalVisible` state and the same `AddGoalModal`. Origin behaviour, Cancel, dirty-discard and Save contracts are all unchanged.

## C. Restrained Briefing colour

**Root cause.** The hero read entirely in neutral ink — `textFigure` for the figure, `textTertiary` for the eyebrow — so nothing in it carried emphasis.

**Fix.** One Ocean Blue anchor plus, where it genuinely applies, one status colour:

| State | Treatment |
|---|---|
| Normal AUP figure | `semantic.interactive` |
| Eyebrow, "What's missing", "How this works" | `semantic.interactive` |
| Genuine shortfall | `semantic.warning` + alert glyph |
| Incomplete/missing input | neutral `textPrimary` — a gap is not a money problem |
| Overdue row | `semantic.urgentText` |
| Due-today / due-soon row | `semantic.warning` |
| Incoming money | `semantic.success` |
| Measure label, timeframe, explanatory copy, dates, provenance | neutral secondary/tertiary |

`presentation.tone` alone could not drive this — it is `'warning'` for **both** a genuine shortfall and a plain missing input. `resolveHeroEmphasis` reads the already-structured `heroState` instead, so `recorded_overspend` / `commitments_exceed_cash` / `goals_underfunded` are distinguished from `missing_balance` / `unavailable_*`. **No currency is parsed out of any display string and no financial value is recomputed.** An unknown future state fails safe to neutral.

State is never colour-alone: the shortfall pairs warning ink with an alert glyph and with the presentation's own wording.

**Contrast, measured against every `heroSurface` stop in all six themes:** `interactive` worst case **4.71:1**, `warning` worst case **4.73:1** — both clear the 4.5:1 body floor, well above the 3.0 large-figure floor.

## Superseded assertions

Updated only where an authorised change supersedes them, each keeping its behavioural claim: `pass-2d-today-grow-hierarchy` (no-goal route), `pass-2b-visual-correction` (hero ink roles), `move-money-architecture-correction` (month empty-state wiring), plus the Wave 5 hierarchy suite's own zero-goal clause. No financial expectation was edited.

## Verification

TypeScript 0. Legacy **72 files / 4,871**. Rendered **25 suites / 174**, clean twice. Wave 5 hierarchy **277/277**. Contrast 141/141 and 43/43. Expo Doctor 17/18. Both exports exit 0. Dependency diff empty. `git diff --check` clean. **Every read-only financial engine byte-identical**; the only file changed under `src/lib/calculations` is `todayComposition.ts`, the Wave 5 pure presentation helper.

---

# Change control — Wave 5 final visual polish (20 August 2026)

**Status.** Implemented, all automated gates passed, **unstaged and uncommitted** pending the owner's final iOS device test. Wave 5 not checkpointed. Wave 6 not started.

## A. Your Today Briefing — identity and prominence

**Root cause.** The Briefing's title was `typeStyle('eyebrow')` — 12.5pt, all caps, tracking 1 — with nothing beside it. At that size and weight it read as a caption above a number rather than as the name of the page's primary surface.

**Fix.** A compact identity row inside the hero: a 36pt `interactiveTint` tile holding Ionicons `sunny-outline` at 20pt, beside the title-case **"Your Today Briefing"** at `titleSection` (20/26/600) in `semantic.interactive` ink. Title case, not caps. The Ocean Blue ink distinguishes the hero's own title from Today's neutral section headings.

**A vector icon, not an emoji** — the Add surfaces were deliberately migrated away from emoji, and that decision is preserved. No new package: Ionicons is already the approved Wave 9 mapping.

**One announcement, not two.** The tile carries `accessibilityElementsHidden` *and* `importantForAccessibility="no-hide-descendants"`; the title alone holds `accessibilityRole="header"` and remains the `headingRef` focus target the reminder lifecycle restores to.

**Height.** The row costs one spacing token over the label it replaced (16pt line → 36pt tile); the measure label beneath gives back a step (`designSpacing.md` → `sm`). The title wraps rather than clipping at large text (`flexShrink: 1`, no `numberOfLines`). No animation was added.

Everything else in the hero is unchanged: the AUP figure, shortfall presentation, missing-input state, the two-row cap, *What's missing*, *How this works*, provenance, row destinations and the semantic colour mapping.

## B. August so far — the broken two-line currency

**Root cause — and a correction to the reported symptom.** The value was **already one `<Text>` node containing one string**. It was not two nodes and not two flex items. It broke because it did not *fit*: `figureLarge` is 28pt, `"+$15,000"` needs ~126pt at that size, and a 390pt phone affords ~98pt per column. The only line-break opportunity in that string sits immediately after the sign, so it wrapped there and the customer saw a lone `+` above the amount.

The real defect was in the layout gate: `resolveMonthMeasureLayout` asked only whether a column was wide enough for a **label** (`MIN_MEASURE_COLUMN_WIDTH = 88`). It never asked whether the column could hold the **amount**.

**Fix, in three parts.**

1. **The gate now measures the actual values.** `requiredMeasureColumnWidth` takes the formatted strings being rendered and requires the column to fit the widest at a readable size, so a column count is only offered when it can genuinely carry its values.
2. **A tested discrete size ladder.** Design 5.1 asks for three columns at standard phone width *and* a supporting figure of ~24–26pt. Those meet a hard physical limit — no single size satisfies every device. So `resolveMonthMeasureFigureSize` picks the largest rung of `[28, 26, 24, 22, 20, 17]` at which every value fits the real column: **24pt at 430pt, 22pt at 390pt**, stepping up to 28pt when a column affords it. The top rung is the `figureLarge` role and the floor is the `figureRow` role, so the figure never leaves the established scale. This is a discrete tested decision, **not** `adjustsFontSizeToFit`.
3. **`numberOfLines={1}`** on every value — the hard guarantee that no amount can split at the sign whatever an estimate said. Values carry `flexShrink: 0`; labels shrink instead.

**Documented variance.** At 390pt the figure resolves to 22pt, just below the brief's 24–26pt target. Three 26pt currency values cannot fit a 390pt phone; the explicit "three columns, one line each, at standard width" requirement was treated as binding and the soft size target yielded to it. At 430pt the figure is 24pt, inside the target.

**A second defect found and fixed.** The first version of the gate qualified a column if its values fit at the 17pt floor. That produced a genuinely wrong outcome — a 430pt screen took three columns at 17pt while a 390pt screen took two at 24pt, so the **wider device showed the smaller number**. The gate now measures at a comfortable rung (22pt), so a column count that would force a cramped figure is not offered at all.

**Signed formatting.** One string per value, sign included: `+$15,000`, `$500`, `+$14,500`, `−$500`, `$0`. The minus is **U+2212**, which shares the tabular advance of the digits beside it so a column of amounts stays aligned. Zero is never signed — `+$0` and `−$0` both assert a direction the number denies. No sign is ever a separate node, element or field.

**Accessibility.** Each metric is one spoken statement with its sign as a **word** — "Money in, positive 2,400 dollars" — so a screen reader never stops on a bare "plus" and never depends on a glyph it may skip.

**Colour rules unchanged:** positive success green, spending neutral (never red), negative net caution.

## Superseded assertions

Anchors only, each keeping its behavioural claim: the hero-order and hero-ink markers (`pass-2b-visual-correction`, Wave 5 hierarchy §9a/§18h), the ASCII-hyphen expectations (§11j/§16v), and the Briefing header's accessible name in two rendered suites. **No financial expectation was edited.**

## Verification

TypeScript 0. Legacy **72 files / 4,945**. Rendered **25 suites / 176**, clean twice. Wave 5 hierarchy **351/351**. Contrast 141/141 and 43/43. Expo Doctor 17/18. Both exports exit 0. Dependency diff empty. `git diff --check` clean. All 18 read-only financial engines byte-identical; the only file changed under `src/lib/calculations` is `todayComposition.ts`, the Wave 5 pure presentation helper.

---

# Change control — Wave 6 (Money) implementation record (20 August 2026)

**Baseline.** `ab7727c` (the Wave 5 checkpoint). **Status: implemented, all gates passed, unstaged and uncommitted** pending owner iOS testing. Wave 7 not started.

## A. The flip is retired, and nothing was lost

**Before.** `ThisMonthCard` was a two-face 3D flip. The front carried income, spending and net recorded; the back carried the funding-source breakdown, reachable only by flipping. The complete, untruncated source list was a *third* step — a "View all" control that appeared only on the back face, and only when 5+ sources overflowed the compact 4-row rule.

**After.** A static summary with one explicit **"Spending sources"** control opening `ThisMonthSourcesSheet` directly, whenever spending exists. The sheet already listed **every** source with label, percentage and amount plus a reconciling total, so what the compact face could only show as "+N more sources" is now always fully available in one step.

**Retired with the flip:** the shared `Animated.Value`, both `rotateY` interpolations, `perspective`, `backfaceVisibility`, the absolutely-positioned back face, the measured-height container, per-face `pointerEvents` and accessibility hiding, the `face` state, the stale-completion generation guard, `FLIP_DURATION_MS`, and the compact-row rule. The Reduce Motion branch existed **solely** to make the flip instant — with nothing moving it is gone entirely, which is a stronger guarantee than the branch was: no code path can animate.

## B. Money recomposed

Order: **Available Until Payday hero → payday progress (attached to the hero) → included-balances row → This Month + Sources → What happens next → Money Flow → Money Plan.** One hero-level surface; everything below it is a flat bordered supporting card.

- **Payday bar** (`MoneyPaydayBar`) reads `cycleStart`, `cycleEnd`, `daysRemaining` and `hasKnownPayday` straight off the same `SafeToSpendResult` the hero shows. No local date arithmetic, no payday inference. Without a known payday it says so and shows no bar rather than filling an invented cycle. A zero-length or inverted span is reported honestly instead of dividing into NaN. The fraction is clamped to [0,1] at both ends. The cycle **start** is derived from the payday minus the pay frequency, so it is labelled an estimate — in words, not by shape.
- **Included-balances row** (`IncludedBalancesRow`) reports the engine's own `includedMoneyBalanceAccounts` count and `includedMoneyBalance` total, opens the existing `SelectBalancesSheet` unchanged, and states in rendered text that **changing inclusion does not change net worth**. Empty state shows no total rather than a fabricated `$0`.
- **Definitions.** Eight one-sentence measure definitions in `MONEY_MEASURE_DEFINITIONS`, policed by a banned-word test. A banned word is permitted only as an explicit denial — Money Plan reads "A forecast built from your own preferences — not a guarantee, and not advice", and never implies unallocated money is spendable cash.

## C. Presentation-only, verified

`src/lib/calculations/moneyComposition.ts` is the only file added under `src/lib/calculations`. It imports no engine, calls no `compute*` function, and contains **exactly one division in its whole body** — a time span into a 0..1 progress fraction. No money value is multiplied, divided, summed or reduced anywhere in it. All seven protected engines are byte-identical to `ab7727c`.

## D. Flip test rewritten, not deleted

`tests/this-month-flip-card.test.ts` grew from **136 to 157** assertions. Sections 1–18 and 21–28 (real-import financial coverage: reconciliation to the cent, percentage largest-remainder allocation, deterministic ordering, source identity, invalid amounts, transfer exclusion, BNPL exclusion, date boundaries) are untouched. Sections 19/20 were replaced by their exact inverse — each retired mechanism asserted absent by name — plus a new Section 20B proving item-by-item that every former back-face and front-face element survives. The compact-rule mirror is kept as a record of its arithmetic; what is asserted against shipped code is that the rule and its truncation are genuinely gone.

## E. Verification

TypeScript 0. Legacy **73 files / 5,091** (from 72 / 4,945). Rendered **26 suites / 185** (from 25 / 176), green twice. Wave 6 hierarchy 124/124. Wave 6 rendered 9/9. Wave 5 hierarchy 351/351. Contrast 141/141 and 43/43. Doctor 17/18. Both exports exit 0. Dependency diff empty. `git diff --check` clean.

Financial regression: safe-to-spend 46/71/25, move-money 121, income-destination 230, transfer-funds 83, this-month 157, everyday-account 61/55/72/40 — all green.

**Android** physical testing remains deferred to Wave 11; automated Android export passed. **Android has not been device-tested.**

## F. Out of scope, confirmed untouched

The per-goal "include in Available Until Payday" opt-in remains deferred. No route, navigation architecture, dependency, persistence schema, icon system or Add phase-machine change. No glass effect outside the dock.

---

# Change control — Wave 6 correction pass (20 August 2026)

**Baseline** `ab7727c`. **Unstaged and uncommitted**; Wave 6 not checkpointed, Wave 7 not started.

## A. Arbitrary transaction dates

**Root cause.** `quickDateChoices` returned exactly four offsets and `DateTriggerField` rendered only those, so a customer recording something from three weeks ago had no way to say so.

**Fix.** The four shortcuts stay — they are the common cases at one tap each. Beneath them sits **"Choose another date…"**, which swaps the picker's body to an inline calendar. Deliberately **not** a free-text field and **not** a second date system: same field, same `setDraft`, same committed value, so Cancel/Done still belong entirely to `FocusedPickerTrigger` and a cancelled calendar selection restores the previously committed date exactly as a cancelled shortcut always did.

**Not a second Modal.** The picker is already an overlay inside a sheet, and `MOTION_HARD_RULES` rule 2 allows one native Modal at a time. `InlineCalendar` renders in that same overlay, which also avoids the gesture conflict `DatePickerModal` exists to work around. No dependency added, no `setTimeout` anywhere.

**Local-date integrity.** Every date is constructed from local Y/M/D parts (`localMidnight`), never from an ISO instant and never via `Date.UTC` — so a day chosen as 3 August stays 3 August west of UTC. The calendar's only `new Date(...)` normalises the selected value to local midnight for comparison, from those same parts.

**Future dates are disabled, not coerced.** `maximumDate` is today for a past-facing field and inclusive, so today is selectable and tomorrow is not. A disabled day is still rendered and announced as *"…unavailable — a transaction cannot be dated in the future"*. Forward month-stepping stops at the maximum's own month so a customer never lands on a month with nothing selectable. A future-facing field (a bill's next due date) is untouched and keeps its forward run of days.

Every day cell and month stepper clears 44pt; selection and "today" each carry a shape (filled pill / ring) as well as a colour.

## B. Included balances redesigned

**Root cause.** A wide right-hand "Manage balances" column took content width, squeezing the explanation into three narrow lines.

**Fix.** The whole row is the action, the label column is gone, and a chevron takes only its own width. Title "Balances used", primary summary **"$40,000 across 2 accounts"** (one coherent value, correct singular/plural), support line *"Used only for this estimate — your Wealth total is unchanged."* The action is now spoken rather than spelled out: `"Balances used, $40,000 across 2 accounts. Manage balances."` At accessibility sizes the summary gains a second line rather than truncating.

## C. One Manage affordance per state

**Root cause.** `SafeToSpendHero` rendered a small "Manage balances" link in *every* state, and Wave 6 added the dedicated row beneath it.

**Fix.** `showManageBalancesLink` (default `true`, so other consumers are unchanged) is passed `false` from Money in **both** states. With balances included, the dedicated row is the sole entry point; with none, the hero's own primary **"Select balances"** CTA is the single obvious action and the row is not rendered at all. My first attempt suppressed the link only in the populated state — which left it competing with the hero's own CTA in the empty state, and the rendered test caught it.

## D. Timeline — nested scroll confirmed and removed

**Inspection confirmed the defect.** `MoneyTimelineCard` owned a `ScrollView` with `nestedScrollEnabled` and `maxHeight: 440` once there were more than six events.

**Fix.** The inner scroll, its near-end handler and its `scrollTo` are gone; the page owns all scrolling. The timeline shows the next **five** events with one full-width inline **"View all upcoming" / "Show less"**, exposing `accessibilityState.expanded` and announcing the hidden count. The slice is on the already-ordered engine array and nothing else — grouping runs on whatever slice is displayed, so day headers stay correct in both states. Expanding also asks the parent to widen the planning horizon, as the retired scroll did. An incoming focus target expands the timeline first, so a destination beyond the fifth event is still mounted and the fulfillment lifecycle resolves exactly once per request.

## E. Dismissal polish

`InfoSheet`'s Close gains an explicit 44pt activation area (it previously fell out of padding plus line height) and the interactive role instead of muted secondary ink, still text-only with no button chrome. `ThisMonthSourcesSheet`'s Close moves from the filled `primary` variant to `secondary` — a neutral dismissal should not wear a confirmation's treatment. Backdrop dismissal, accessibility escape and focus restoration are unchanged.

## Verification

TypeScript 0. Legacy **74 files / 5,177** (from 73 / 5,091). Rendered **26 suites / 185**, green twice. Wave 6 hierarchy 126/126. Wave 6 date/timeline 84/84 (new). Wave 6 rendered 9/9. Wave 5 hierarchy 351/351. Contrast 141/141 and 43/43. Doctor 17/18. Both exports exit 0. Dependency diff empty. `git diff --check` clean. **All seven protected engines byte-identical.**

Android physical testing remains deferred; the automated Android export passed. **Android has not been device-tested.**

---

# Change control — Wave 6 Correction A: persistent root-level dock (20 August 2026)

**Baseline** `ab7727c`. **Unstaged and uncommitted.** Corrections B and C not started; Wave 7 not started.

## Root cause

`FloatingNavBar` was `MainTabNavigator`'s `tabBar` render-prop, so it existed only while `Main` was the visible root-stack screen. `FloatingAddButton` is a root-level singleton and survives pushes. Every eligible detail route — `MoneyDetail`, `GrowDetail`, `Transactions`, `Goals`, `Cards`, `EmergencyFund` — is registered on the **root stack** (verified: 1 registration each on the root stack, 0 on the tab navigator). Pushing any of them therefore unmounted the dock and left an orphaned `+`.

`dockVisibility.ts` classified all six as visible throughout. The matrix was correct; the dock was not mounted to consult it.

## Architecture after

The dock and `+` are one root-level assembly, siblings of `RootStack.Navigator`, driven by **one** projection:

- **`tabDefinitions.ts`** (new, pure) — route names, labels, both icon states, canonical order, and `ROUTE_OWNER_TAB`. The outline/filled mapping is now defined exactly once; `MainTabNavigator` derives its `ICONS` from it, so the dock no longer needs React Navigation's `descriptors` to reach it — which is precisely what pinned it inside the tab navigator.
- **`rootNavAssembly.ts`** (new, pure) — `resolveRootNavAssembly` (visibility + active tab) and `resolveTabPress` (three outcomes). It adds no route rule: visibility is delegated wholesale to `dockVisibility.ts`, so the exhaustive matrix stays the single authority including its fail-closed treatment of unknown routes.
- **`FloatingNavBar`** — now presentation-only (`tabs`, `activeIndex`, `onSelectTab`, `reduceMotion`). No `BottomTabBarProps`, no `descriptors`, no navigation interpretation. Capsule, blur, pill, icons, labels, tablet cap, touch targets, the iOS/Android role split and the `"<label>, tab, n of 4"` announcement are unchanged.
- **`GlobalNavDock.tsx`** (new) — the one place the tab set becomes elements.
- **`activeTabStore.ts`** (new) — where the selected tab is published from.

**One writer for the selected tab.** The root stack's `state` event does not re-emit for a change confined to the nested navigator, so observing only at root left the pill stale after a cross-tab move from a pushed route. Reading *both* the root's nested snapshot and the tab event gave two writers, and the root event could fire second carrying a stale snapshot and clobber the correct value. The root listener now reads **only** the root route; the tab navigator publishes its own selection from React Navigation's own state event. React Navigation remains the sole authority.

**No global container ref.** `RootNavigator` renders the root navigator and has no parent navigator context, so no hook can supply navigation. The navigation object is captured from React Navigation's own `screenListeners({ navigation })` — strictly less than `createNavigationContainerRef`, and asserted absent.

## Tab-press semantics

| From | Press | Outcome |
|---|---|---|
| Tab root | same tab | `scrollToTop` — same `tabScrollRefs` map the tab listener used; no navigation dispatched |
| Tab root | other tab | `navigate` into `Main` |
| Detail route | owner tab | `returnToRoot` — never scrolls a covered root |
| Detail route | other tab | `navigate`; the detail does not stay layered above |

## Verification

TypeScript 0. Legacy **75 files / 5,263** (from 74 / 5,177). Rendered **27 suites / 194** (from 26 / 185), green twice. Nav shell 86/86 pure + 9/9 rendered (new). Dock matrix 66/66. Wave 6 hierarchy 126/126, date/timeline 84/84. Wave 5 hierarchy 351/351. Contrast 141/141 and 43/43. Doctor 17/18. Both exports 0. Dependency diff empty. `diff --check` clean.

**All 12 protected files byte-identical** — the seven engines, `floatingAddTransition.ts`, `addWorkspaceTransitionController.ts` and the three transition tests.

Android physical testing remains deferred; the automated Android export passed. **Android has not been device-tested.**

---

# Change control — Wave 6 Correction B: Available Until Payday hero (20 August 2026)

**Baseline** `ab7727c`. **Unstaged and uncommitted.** Correction C not started; Wave 7 not started.

## Root cause

Two things, both presentation:

1. The normal-state hero rendered on **`colors.heroGradient`** — a pre-5.1 legacy token. It does not retint with the Wave 5 colour styles (which is why Sunrise looked wrong in the recording), and a saturated fill reads as a success/status card for what is an **estimate**. The label carried a `💰` emoji, and the body was a stack of sentences with no dominant element.
2. **`MoneyPaydayBar` was a sibling of the hero in `MoneyScreen`**, not part of it — so the measure and its own timeline read as two unrelated stacked cards.

## Before → after

| | Before | After |
|---|---|---|
| Surface | `colors.heroGradient` (legacy, style-blind) | `semantic.heroSurface` + `heroBorder` at `designRadius.hero` |
| Identity | `💰 AVAILABLE UNTIL PAYDAY` (11pt caps) | 36pt `interactiveTint` tile + Ionicons `wallet-outline` + "Available until payday" at `titleSection` |
| Figure | body-sized amount inside a sentence stack | `figureHero` (46pt, tabular) in `semantic.interactive` |
| Payday | sibling card below the hero | the hero's own footer, separated by a hairline |
| Provenance | a separate line in `MoneyScreen` | inside the hero, from the authoritative definition |

Hierarchy is now identity → figure → interpretation → payday rail → provenance, asserted by render order and by type-role size ordering (46 > 20 > 14 > 13).

## Colour and state

The figure is the Ocean Blue **interactive** role, never success green — a positive estimate is not an achievement. The hero uses **no urgent/danger role at all**: an ordinary shortfall is not an emergency, and shortfall states keep their existing warning treatment plus their own non-colour cue. Missing/invalid data stays neutral and renders the presentation's own exact wording — the hero contains **no literal `$0`** anywhere.

State is taken from `heroState`/`amountVisible`, never by parsing a formatted amount or date. Every state-specific CTA is preserved: *Add an expected payday*, *Select balances*, *Review in Wealth*. No second CTA was added to a state that already has one.

**The no-payday state deliberately does not render the rail.** That branch already owns a real *"Add an expected payday"* action; the rail's passive "not recorded yet" line would be a second affordance for the same gap.

## Contrast — measured against every hero-surface stop, all six themes

Figure/title 4.71 · interpretation 4.63 · provenance 3.42 (large floor) · warning 4.73 · progress fill 4.71. Body floor 4.5, large/non-text floor 3.0.

## Correction A — untouched and re-proved

All seven Correction A production files are byte-identical. Three safeguards were added as **pure assertions only, with no production change**: a restored detail route resolves to the correct owner tab with no nested-tab information (so no transient wrong pill); `subscribeActiveTab` returns a working unsubscribe and an unsubscribed consumer is never notified; and exactly one production file publishes the selected tab (`MainTabNavigator`, from React Navigation's own state event). Nav shell is now **102/102** pure and 9/9 rendered.

## Verification

TypeScript 0. Legacy **76 files / 5,357**. Rendered **27 suites / 195**, green twice. Hero 76/76 (new). Nav shell 102/102 + 9/9. Dock matrix 66/66. Wave 6 hierarchy 128/128, date/timeline 84/84. Wave 5 hierarchy 351/351. Contrast 141/141 and 43/43. Safe-to-Spend 25/71/46. Doctor 17/18. Both exports 0. Dependency and config diff empty. `diff --check` clean.

**All 19 protected files byte-identical.** Zero financial outcome changes.

Android physical testing remains deferred — the owner has iOS-only device access. The automated Android export passed. **Android has not been device-tested**; Wave 11 must recover cross-platform physical testing.

---

# Change control — Wave 6 Correction C: Money composition and AUP convergence (20 August 2026)

**Baseline** `ab7727c`. **Unstaged and uncommitted.** Wave 7 not started.

## A. Root cause — six legacy AUP branches, not one

Correction B redesigned only `SafeToSpendHero`'s **final fall-through** return. Six earlier branches returned before ever reaching it and still rendered `styles.card` + `styles.cardWarning` (`colors.warningSoft` — the yellow surface) with `warningCtaButton`/`warningCtaText` (the brown CTA), an all-caps `styles.label` identity and centred dense copy:

`unavailable_balance_data` · `unavailable_other_data` · `no_known_payday` · **`missing_balance`** · `recorded_overspend` · `commitments_exceed_cash`

`missing_balance` is the "no balances selected" state the owner recorded. Fixing only that branch would have left five others behind.

**Fix.** One `renderShell` used by **every** state — verified: the file now contains exactly **one** `<LinearGradient>`, and `cardWarning`/`warningCtaButton`/`warningCtaText` are deleted, not merely unused. Each state supplies only its wording, its single action, and whether an amount or rail can honestly be shown.

**No-balance state:** identity → *"Choose balances to get your estimate"* → *"Select the cash, savings or everyday accounts Nolie should include. This changes this estimate only — not your Wealth total."* → one **Choose balances** action. Neutral interactive, no amount, **no `$0`**, **no rail** (an estimate cannot exist yet).

Warning states keep warning ink **plus** an alert glyph — never colour alone. The hero uses **no urgent/danger role at all**.

## B. Payday rail named

A nearly-full bar with only two dates beside it reads as *money used*. The rail now leads with **"Pay cycle progress"** and **"N days left"**, then the bar, then the two dates, then *"Cycle start estimated"* once — the day count was previously stated twice.

## C. Deduplication

**Needs your attention → unwired.** `computeAttentionItems` derives *entirely* from `timelineEvents` (its only other item is a shortfall notice the hero's own shortfall state owns), so every occurrence it listed was **by construction** already in "What happens next". No identity helper was needed: removing the section cannot lose an occurrence, and separate recurrence dates remain separate because the timeline array is untouched. The engine is unchanged.

**Spending Tracker → "Recent activity".** Its *"Spent this month"* and *"Income recorded this month"* rows were the same month-to-date measures This Month already owned. Those two rows are gone. Everything unique stays: the recent-transaction preview, the largest-category and average-daily-spend insights (kept here because they describe **actual recorded activity**, not the recurring forecast), and *View all transactions*. The component is unwired from duplication, not deleted.

## D. Green removed from navigation

`SelectBalancesSheet` selected rows now use `interactiveTint`/`interactive` instead of `accentSoft`/`accentStrong`, with the existing checkmark as the non-colour cue; *"+ Add a money balance"* is interactive blue. Money's section actions (*+ Add bill*, *+ Add*) take the interactive role and a real 44pt target instead of `hitSlop`. Green stays reserved for money genuinely received.

## Verification

TypeScript 0. Legacy **76 files / 5,359**. Rendered **27 suites / 195**, green twice. Hero 78/78. Nav shell 102/102 + 9/9. Dock 66/66. Wave 6 hierarchy 128/128, date/timeline 84/84. Wave 5 hierarchy 351/351. Contrast 141/141 and 43/43. Balance-inclusion 230/230. Doctor 17/18. Both exports 0. Dependency diff empty. `diff --check` clean.

**All 19 protected files byte-identical.** Zero raw colour in every changed Money surface. Zero financial outcome changes.

Android physical testing remains deferred — iOS-only device access. Automated Android export passed. **Android has not been device-tested**; Wave 11 must recover cross-platform verification.

---

# Change control — Wave 6 final Money composition and polish (20 August 2026)

**Baseline** `ab7727c`. **Unstaged and uncommitted.** Wave 7 not started.

## Correcting a reporting error

The Correction C report described "five sections" and then listed **six** — Available until payday, This month, Recent activity, What happens next, Money flow, Money plan. Recent activity was the one that should never have been top-level. That miscount is corrected here, not restated.

## Root cause of the remaining page length

Three surfaces each added a heading and a full-width card for information already on the page:

1. **Recent activity** — its own top-level section restating This Month's month-to-date framing, with two paragraph-style insight rows and a duplicate `+ Add`.
2. **Typical Monthly Allocation** (`MoneyPlanCard`) — the **same** income, bills, savings, goals and remainder the Typical money flow card above it already showed, for the same period, from the same engines.
3. **Five-row timeline preview** — still pushed Typical money flow and Money plan below the fold at 390pt.

Plus every flow row restated the period the selector had just set (*"Typical monthly income"* ×5).

## Before → after

| | Before | After |
|---|---|---|
| Sections | 6 | **5** |
| Recent activity | own section + card | subsection inside This Month, ≤3 rows |
| Activity insights | 2 prose rows | ≤2 compact `label · value` items |
| Timeline preview | 5 rows | **3** rows |
| Flow + Allocation | two cards, same model | **one** card |
| Flow row labels | "Typical monthly income" ×5 | Income · Bills · Savings · Goals · Remainder |
| Root title | legacy `typography.title` (platform font) | Design 5.1 `titleScreen` via the shipped resolver |

Final order: **Available until payday → This month → What happens next → Typical money flow → Money plan.**

## Reachability — nothing lost

All ten unique actions verified present: *How this was calculated*, *Choose/Manage balances*, *Spending sources*, *View all transactions*, *Add bill*, Money Flow details, Savings allocation details, *Add income*, *Add goal*, *Manage savings allocation*. `MoneyPlanCard`'s four empty-state CTAs were themselves duplicates — each destination has an independent entry point on Money, verified with 4/1/2/3 call sites respectively. The component is **unwired, not deleted**, and its detail sheet stays mounted.

## Root title

`Screen`'s shared title was on the legacy `typography.title` token — 24/700 in the platform default font. It now uses the `titleScreen` role through the shipped resolver, in `semantic.textTitle`. One shared style, so every screen that passes a title inherits it at once; this is **not** the deferred 68-file font migration.

## Period selector

Kept, and now announces its selection: `accessibilityRole="radio"` with `accessibilityState.selected`, each option a 44pt target. Colour: income success, bills neutral ink, savings/goals their existing accents, remainder interactive when positive and **warning plus the word "Shortfall"** when not — never colour alone.

## Verification

TypeScript 0. Legacy **76 files / 5,394**. Rendered **27 suites / 195**, green twice. Wave 6 hierarchy **162/162**. AUP hero 78/78. Nav shell 102/102 + 9/9. Dock 66/66. Date/timeline 84/84. Wave 5 hierarchy 351/351. Contrast 141/141 and 43/43. Typography 59/59. Doctor 17/18. Both exports 0. Dependency diff empty. `diff --check` clean.

**All 19 protected files byte-identical.** Zero raw colour in every changed surface. Zero financial outcome changes — monthly `10,000 − 6,083 − 1,000 − 77 = 2,840` and weekly `2,308 − 1,404 − 231 − 18 = 655` reconcile through the unchanged engines.

Android physical testing remains deferred — iOS-only device access. Automated Android export passed. **Android has not been device-tested**; Wave 11 must recover cross-platform verification.

---

# Change control — Wave 6 final visual refinement (20 August 2026)

**Baseline** `ab7727c`. **Unstaged and uncommitted.** Wave 6 closure candidate; Wave 7 not started.

## Root causes

1. **This Month** — three identical label/value rows and one generic arrow glyph for every transaction, so nothing was differentiable at a glance.
2. **Actions** — plain text links read as captions, not controls.
3. **Credit-card balance** — a present-moment snapshot sat directly beneath three month-to-date measures, inviting exactly the misreading its own disclaimer warned about.
4. **Today Briefing** — `StyleSheet.hairlineWidth` is sub-pixel; the AUP measure, the priority rows and the footer ran together as one box.
5. **August so far** — `meta` (13pt) labels beside a 28pt figure read as micro-text.
6. **Money Flow** — no icons, and the selected period was still legacy accent green.

## What changed

**This Month** — three compact metric cells with tinted glyph tiles (income `cash-outline`/success, spending `receipt-outline`/interactive, net `trending-*`/featured-or-warning); only genuinely positive money takes the success amount role. Recent activity now uses the **canonical** `categoryIconSpec` mapping — Groceries a cart, Dining out a restaurant, Bonus a gift — each with its designed domain tone, and an unmapped category falls back safely inside that map. Two **2pt** outline buttons (*Spending sources* with a pie glyph, *View all transactions* with a receipt), 44pt each, stacking at narrow width or accessibility scale.

**Spending sources** — each card source now shows `Paid this month · $150 · 23%` and `Current card balance · $1,150` as two labelled lines that cannot be confused. `resolveSourceCardContexts` is a **join by stable id**, not arithmetic: it sums nothing and no balance enters any total. A card with a balance but no spending this month keeps its snapshot under *Other card balances*, so retiring the standalone line could not make an existing snapshot unreachable. One clarification, rendered once. The standalone line and its dead derivations (`sanitizeBalance`, `cardsInCredit`, `displayedCardBalance`, and the three props) are **deleted**, not merely unused.

**Today Briefing** — `HERO_DIVIDER_WIDTH = 1` on the hero divider, the footer rule and each priority row's separator, at the theme-aware `semantic.border` role. The hero stays one card; no row became its own surface.

**August so far** — labels moved from `meta` to `support` (14pt, medium) with the figure untouched; "Spending recorded" shortened to "Spent"; each measure gained a restrained tinted glyph. Values and responsive logic unchanged.

**Typical money flow** — selected period is now `semantic.interactive` / `onInteractive`, never success green. Premium glyphs per category with restrained tints; chevrons only on genuinely actionable rows. **Remainder is a result panel** inside the same card: `Estimated remainder`, dominant amount, and a supporting line naming the selected cycle. Positive takes the featured interactive treatment rather than a success-green celebration; zero is neutral; negative pairs warning ink with an alert glyph **and** the word "shortfall".

## Verification

TypeScript 0. Legacy **76 files / 5,453**. Rendered **27 suites / 195**, green twice. Wave 6 hierarchy **220/220**. AUP hero 78/78. Nav shell 102/102 + 9/9. Dock 66/66. Date/timeline 84/84. Wave 5 hierarchy 351/351. Contrast 141/141 and 43/43. Typography 59/59. Doctor 17/18. Both exports 0. Dependency diff empty. `diff --check` clean.

**All 19 protected files byte-identical.** Zero raw colour and zero emoji in every touched surface. Zero financial outcome changes.

Android physical testing remains deferred — iOS-only device access. Automated Android export passed. **Android has not been device-tested**; Wave 11 must recover cross-platform verification.

---

# Change control — Wave 6 closure polish (20 August 2026)

**Baseline** `ab7727c`. **Unstaged and uncommitted.** Wave 6 closure candidate; Wave 7 not started.

## A. "August so far" metric balance

**Root cause.** `flexGrow: 1` with `flexBasis: 0` still let a longer value claim width through its own content, so "Net recorded" measured wider than "Spent". And the figure ladder's top rung was `figureLarge`'s own 28pt beside a 14pt label.

**Fix.** Equal basis + `flexGrow: 1` + **`flexShrink: 0`** + `minWidth: 0` — each cell now measures identically regardless of the characters inside it, including whether the third value is positive or negative. The ladder's top rung steps to **22pt** (comfortable rung 20pt); the *role* is unchanged, so family, weight and tabular numerals still come from `figureLarge`. Measured: **three equal columns at 375/390/430pt**, deterministic 2+1 at 320pt, complete blocks at accessibility sizes. `+$17,500` / `$675` / `+$16,825` unchanged and unsplit.

## B. "How this works" retired from the Briefing

It routed to Money, which the Briefing's own AUP measure and priority rows already reach — a full row of height for no unique destination. Removed, along with its prop, callback, styles and every harness reference. Provenance stays as one calm full-width line: **"Based on what you've recorded · Updated today"**, wrapping rather than truncating. Money's hero keeps its own *How this was calculated* journey, which is where the explanation genuinely lives.

## C. Reminder actions — investigated, then corrected precisely

Code inspection established the semantics rather than inferring them from wording:

| Kind | Control | Handler | Mutation |
|---|---|---|---|
| `bill_due_soon` | **Noted** (was "Got it") | `acknowledgeReminder` | **none** — session-excludes, advances queue |
| all deferrable | Not yet | `deferReminder` | **none** — same |
| `salary_check` | Yes, received → destination | `confirmSalary` | real, via destination choice |
| `bill_overdue`, `bnpl_repayment_due` | source choice → confirm | `confirmBillPaid` / `confirmBnplEveryday` | real, with `transactionId` |
| `card_due_soon`, `loan_repayment_due` | repayment journey | existing handlers | real |

**"Got it" is not relabelled "Close"** — it does more than close: it acknowledges and advances. It is now **"Noted"**, which says exactly what happens and mutates nothing.

**A real defect surfaced.** The action buttons were `paddingVertical: 7` around 12pt text — roughly a **30pt** target on the controls that resolve money. Now **48pt** (`REMINDER_ACTION_MIN_HEIGHT`), above the 44pt floor.

`design5-wave6-reminder-actions.test.ts` (38 assertions) is the guard that this stayed a wording-and-target change: every kind's branch, handler and outcome kind is pinned, and both non-mutating handlers are proved to write nothing.

**Scoped down, deliberately:** the sheet's full visual re-hierarchy is *not* in this pass. It has eight kind branches and a queue/focus lifecycle; a partial redesign there would risk accepted reminder behaviour for a cosmetic gain, which is a poor trade in a closure pass.

## D. One shared Money section header

`MoneySectionHeader.tsx` — 32pt icon tile, `titleSection` role via the shipped resolver, `semantic.textTitle`, optional definition, optional 44pt trailing action, `accessibilityRole="header"`. All four sections adopt it; **zero** legacy `styles.sectionTitle` headings remain. Deliberately **not** a card — a header that became a surface would add a fifth box to a page this wave spent three passes shortening.

Icons: This month `calendar-outline`/interactive · What happens next `calendar-number-outline`/warm · Typical money flow `swap-vertical-outline`/info · Money plan `compass-outline`/featured.

## E–F. Connected polish

**Truncation:** two full labels cannot fit half a 390pt card. The *visible* label shortens to **"Transactions"** while `accessibilityLabel="View all transactions"` stays complete — nothing clipped, nothing lost to a screen reader. Both keep their 2pt border and 44pt target, and stack at narrow/accessibility widths.

**Select Balances Save:** now `semantic.interactive`, scoped to that one control — `Button`'s own `primary` variant is untouched, so no other primary action changes. Green stays reserved for money genuinely received. Contrast verified across all six themes.

## Verification

TypeScript 0. Legacy **77 files / 5,515**. Rendered **27 suites / 195**, green twice. Wave 6 hierarchy **242/242**. Reminder actions 38/38 (new). AUP hero 78/78. Nav shell 102/102 + 9/9. Dock 66/66. Date/timeline 84/84. Wave 5 hierarchy 353/353. Contrast 141/141 and 43/43. Typography 59/59. Doctor 17/18. Both exports 0. Dependency diff empty. `diff --check` clean.

**All 19 protected files byte-identical.** Zero raw colour, zero emoji in every touched surface. Zero financial outcome changes — `$16,123` AUP, `$17,500`/`$675`/`$16,825`, and both flow reconciliations preserved.

Android physical testing remains deferred — iOS-only device access. Automated Android export passed. **Android has not been device-tested**; Wave 11 must recover cross-platform verification.

---

# Change control — Wave 6 closure and checkpoint (21 August 2026)

**Baseline** `ab7727c` (Wave 5 checkpoint). This entry closes Wave 6 and records the owner's iOS approval. Earlier entries above are the wave's working record and are left exactly as written.

## What Wave 6 delivered

**Money hierarchy.** Exactly five top-level sections — Available until payday, This month (Recent activity merged in as a subsection), What happens next, Money flow, Money plan — each led by one shared `MoneySectionHeader`. The Available Until Payday hero converged to a single premium featured surface across all its states, with the duplicate "Manage balances" affordance and the flip-card retired. The Sources sheet and Balances Used row replaced the earlier duplicated balance affordances.

**Navigation.** The dock was hoisted to the root navigator. Root cause: `FloatingNavBar` was `MainTabNavigator`'s `tabBar`, and all six eligible detail routes are root-stack routes, so the dock disappeared the moment a customer opened one. `GlobalNavDock` is now a presentation-only root component driven by `tabDefinitions` / `rootNavAssembly` / `activeTabStore`, with one writer for the selected tab.

**Reminder action and suppression model.** Three intentions per reminder: complete the financial action with a context-specific verb (Mark as paid / Record payment / Record repayment / Confirm received), Snooze until a chosen local date, or Dismiss this occurrence. Suppression is keyed by the canonical occurrence identity (`occurrenceKeyOf`) and persisted in two additive, backward-compatible fields — `snoozedReminderOccurrences`, `dismissedReminderOccurrences` — that load empty for existing customers with no migration. Retention is folded into the write path; there is no timer and no background task. Future recurrences are untouched, because a later occurrence computes a different key.

The canonical composition is now identity → facts → one full-width 52pt primary → two equal secondary columns → optional inline navigation. The primary no longer precedes the facts. Reminder wording is derived from structured fields, so `reminders.ts` is untouched while "Did you pay your Rent?" and the income reminder's party emoji no longer reach a customer on either the sheet or the Today row.

**Shared account-choice presentation.** One row model (`accountChoice.ts`) and one component (`AccountChoiceList.tsx`) now serve bill payment, income destination, credit-card repayment and loan repayment — replacing three separate wrapping-chip implementations. Rows are 56pt, carry the account's type in words, show the balance in its own column (moving beneath the name at 320pt or font scale ≥1.3 rather than truncating), announce their selected state, and distinguish cards from money accounts by icon as well as tint. Credit cards appear under their own `Credit cards` heading with the caption explaining that choosing one records the bill against that card balance.

**Eligibility is read, never rewritten.** Income can credit Savings and never a card; a bill can be charged to a card and never paid from Savings, because `computeBalanceEffect` has no savings-funded-expense branch; the repayment forms stay assets-only. Verified that cards are a correctly classified bill source, not an unfiltered catalogue.

**Select-before-confirm.** The previous pickers fired the caller's mutation straight out of `onSelect`, so a customer discovered they had recorded a payment by having already recorded it. Selecting an account now only marks it: no transaction, no balance change, no occurrence advance, no sheet close. A separate primary control performs the accepted mutation, and remains inert until a choice exists — explicit confirmation is required even when only one account is eligible.

## Device approval

**iOS: approved by the owner.** The recording confirms the canonical hierarchy and aligned actions, the full-width primary with equal Snooze/Dismiss controls, the dated Snooze chooser, the shared account rows, selection occurring separately from confirmation, a successful $50 NAB credit-card repayment, Available until payday $21,989 → $21,939, August spending unchanged at $925 and net recorded unchanged at $16,575 because a repayment is correctly excluded from spending, exactly one −$50 NAB repayment in Transactions, persistent dock behaviour, and no freeze or stuck overlay.

**Android: export-tested only.** The automated Android export exits 0. Android has **not** been device-tested — the owner has iOS-only physical access. Cross-platform device verification remains deferred to Wave 11.

## Verification at checkpoint

TypeScript 0. Legacy **79 files / 5,840**. Rendered **31 suites / 248**, green twice. Wave 6 hierarchy 242/242. Reminder actions 101/101. Reminder intents 135/135. Account choice 125/125 pure + 13/13 rendered. Mark as paid 14/14. Snooze/Dismiss 11/11. Reminder sheet 15/15. AUP hero 78/78. Nav shell 102/102 + 9/9. Dock 66/66. Date/timeline 84/84. Wave 5 hierarchy 353/353. Income destinations 230/230. Contrast 141/141, 43/43 and 55/55. Typography 59/59. Doctor 17/18 (the pre-existing SDK version check). Both exports exit 0.

**Zero financial-engine changes:** all 27 protected files byte-identical, and the original 21-file Wave 5 baseline byte-identical too — every calculation engine, the occurrence-confirmation and repayment paths, both eligibility resolvers, the reminder selectors, and every navigation and Add transition controller. **Zero dependency or configuration changes**; lockfile diff empty. `git diff --check` clean.

Two persistence additions are intentional and additive only: the snooze and dismiss occurrence maps described above. No destructive migration; old stored data remains valid.
