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

## Invariants

All 20 functional and data invariants from the audit §14 remain preserved unchanged. Wave 1A is additive foundation work and touches no engine, no persistence path and no navigation contract.
