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
