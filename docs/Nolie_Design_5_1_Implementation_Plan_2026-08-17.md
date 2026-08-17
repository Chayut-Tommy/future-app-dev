# Nolie Design 5.1 — Implementation Plan

**Date:** 17 August 2026
**Status:** Phase 0 output — design ingestion, verification and planning only. No application or test code was changed by this task.
**Authority:** This plan is a proposal for product-owner approval. It does not authorise implementation of any wave.

---

## Source-of-truth order applied throughout this plan

1. Product-owner decisions in the Phase 0 brief (locked decisions, §6 of the brief).
2. Current repository behaviour and the 20 protected financial/data invariants.
3. `docs/Nolie_Design_5_Current_State_Audit_2026-08-17.md` (the Codex current-state audit).
4. Nolie Design 5.1 (Claude Design MCP package).
5. Design 5.0 / Design 4 — historical context only.

Where Design 5.1 conflicts with repository fact, the repository wins and the conflict is recorded in [§A.6](#a6-conflicts-gaps-and-contradictions-found) rather than silently resolved.

---

# A. Baseline and source verification

## A.1 Repository baseline

| Item | Verified value |
|---|---|
| Repository root | `/Users/tommy/Claude/Lulu/app` |
| Branch | `main` (tracking `origin/main`) |
| Remote | `https://github.com/Chayut-Tommy/future-app-dev.git` |
| HEAD | `6f304e9ebbba0412b223dbf70051a1b26d9df177` |
| HEAD subject | `checkpoint: stabilise floating navigation and quick-action foundation` |
| Baseline requirement | **Met exactly.** HEAD *is* the required baseline commit, not a later descendant. `git merge-base --is-ancestor` confirms; `git diff --stat <baseline> HEAD` is empty. |
| Worktree before this task | `?? docs/` — resolving to exactly one untracked file, `docs/Nolie_Design_5_Current_State_Audit_2026-08-17.md` (the permitted audit). No other uncommitted file and no source-code change. |
| Target plan file pre-existing? | No. `docs/` contained only the audit. |
| Stack (verified in `package.json`) | Expo `^54.0.35`, React Native `0.81.5`, React `19.1.0`, React Navigation 7, TypeScript `~5.9.2`, AsyncStorage `2.2.0`, i18next `^26.3.5`, `expo-font ~14.0.12`, `expo-haptics`, `expo-linear-gradient`, `expo-localization`, `react-native-svg`, `react-native-chart-kit` |
| Test surface | 50 legacy `tests/*.test.ts` (tsx harness) + 15 `tests/rendered/*.render.test.tsx` (jest-expo / RNTL) |

**Preflight verdict: clean. No blocker.**

## A.2 Design MCP project

| Item | Value |
|---|---|
| Tool | `DesignSync` (Claude Design, via the claude.ai login) |
| Project ID | `e3572b99-5c5c-4533-9986-bdc40b5c5f32` |
| Project name | **Navilo mobile design system** |
| Project type | `PROJECT_TYPE_PROJECT` (not `PROJECT_TYPE_DESIGN_SYSTEM`) |
| Access | `canEdit: true`; read-only used. Nothing was written, edited or deleted in the Design project. |

Note: the project is still titled **Navilo**, while all package contents are branded **Nolie**. Cosmetic only; no action required beyond awareness when locating the project.

## A.3 Complete project file manifest (as enumerated, 17 Aug 2026)

```
_ds
_ds/modernist-c39719df-04cd-4975-a9a6-118d633e5a84
_ds/modernist-.../_adherence.oxlintrc.json
_ds/modernist-.../_ds_bundle.js
_ds/modernist-.../_ds_manifest.json
_ds/modernist-.../readme.md
_ds/modernist-.../styles.css
uploads
.thumbnail
Navilo Design Review v2.dc.html
Navilo Design Review v3.dc.html
Navilo Design Review v4.dc.html
Navilo Design System.dc.html
Navilo Motion Addendum.dc.html
Nolie Design 5 - Design System.dc.html
Nolie Design 5 - Master Design.dc.html
Nolie Design 5 - Motion & Accessibility.dc.html
Nolie Design 5.1 - Design System.dc.html
Nolie Design 5.1 - Master Design.dc.html
Nolie Design 5.1 - Motion and Accessibility.dc.html
Nolie_Design_5_Implementation_Handoff.md
Nolie_Design_5_Manifest.md
Nolie_Design_5_Motion_Accessibility.md
Nolie_Design_5_Screen_Specifications.md
Nolie_Design_5_Tokens.json
doc-page.js
ios-frame.jsx
support.js
uploads/Claude Design 4 (Addendum)- Navilo.pdf
uploads/Claude Design 4 - Navilo.pdf
uploads/Nolie_Design_5_Current_State_Audit_2026-08-17.md
```

## A.4 Exact Design 5.1 sources read for this plan

All nine required items are present and readable. The `.md`/`.json` companions retain **Design-5-era filenames but carry 5.1 content** — verified by internal version markers, not by filename.

| # | Required source | Actual file read | Version evidence | Verdict |
|---|---|---|---|---|
| 1 | 5.1 Master Design | `Nolie Design 5.1 - Master Design.dc.html` (17 pp) | Header “Nolie Design 5.1 · A of E”; 5.1 revision list on p.1 | ✅ 5.1 |
| 2 | Design System | `Nolie Design 5.1 - Design System.dc.html` (7 pp) | Header “Nolie Design 5.1 — Design System · B of E”; p.7 is “5.1 · Locale typography & six-theme proofs” | ✅ 5.1 |
| 3 | Motion and Accessibility | `Nolie Design 5.1 - Motion and Accessibility.dc.html` (5 pp) | Header “Nolie Design 5.1 — Motion & Accessibility · C of E” | ✅ 5.1 |
| 4 | Implementation handoff | `Nolie_Design_5_Implementation_Handoff.md` | Title “Nolie Design 5.1 - Implementation Handoff”; §8 “Design 5.1 revisions” change log | ✅ 5.1 |
| 5 | Tokens | `Nolie_Design_5_Tokens.json` | `meta.version: "5.1.0"`; `meta.note51` present | ✅ 5.1 |
| 6 | Screen specifications | `Nolie_Design_5_Screen_Specifications.md` | Title “Nolie Design 5.1 - Screen Specifications”; §11 compliance register | ✅ 5.1 |
| 7 | Motion/a11y machine notes | `Nolie_Design_5_Motion_Accessibility.md` | Title “Nolie Design 5.1 - Motion and Accessibility (machine notes)”; “5.1 locale note” | ✅ 5.1 |
| 8 | MCP/file manifest | `Nolie_Design_5_Manifest.md` | Title “Nolie Design 5.1 - File Manifest (MCP)” | ✅ 5.1 |
| 9 | Compliance-copy register | `Nolie_Design_5_Screen_Specifications.md` §11 (10 rows, Status + Owner columns) | Referenced by handoff §8.4 | ✅ present, contained in the specs |

**Superseded, not used as implementation authority:** `Nolie Design 5 - Master/Design System/Motion & Accessibility` (5.0), `Navilo Design System.dc.html`, `Navilo Design Review v2–v4.dc.html`, `Navilo Motion Addendum.dc.html`, `uploads/Claude Design 4*.pdf`. The 5.1 manifest explicitly fences these.

**Second, independent verification (17 Aug 2026).** The owner supplied a local download of the same Design project at `~/Documents/AI Budgetting App/Claude Design/Navilo mobile design system/`. The three 5.1 documents were compared byte-for-byte against the MCP copies this plan was built from:

| Document | SHA-256 (first 16) | Result |
|---|---|---|
| `Nolie Design 5.1 - Master Design.dc.html` | `2a380e0eb436e66d` | **identical** |
| `Nolie Design 5.1 - Design System.dc.html` | `9168777f4477e9b1` | **identical** |
| `Nolie Design 5.1 - Motion and Accessibility.dc.html` | `1dbded6d0c16bb89` | **identical** |

The local download contains the same 30 files as the MCP project and **no additional asset, glyph, matrix or contrast table**. The two PDFs also supplied (`Claude Design 5 - Nolie.pdf`, 160 pp; `Claude Design 5.1 - Nolie.pdf`, 163 pp) are page renders of this same corpus — the eleven `.dc.html` documents total ~124 counted A4 sections plus the one document using a different page marker — and therefore contain no information beyond the exports above. They were not machine-readable on this host (rasterised, no text layer) and are not relied on.

**Why version discipline matters here — concrete proof.** Design 5.0 doc C specifies `toast 260 ms with Undo (8 s)`, `Undo window 8 s, pauses while VO speaks`, and a spoken string ending `Undo available`. Design 5.1 doc C replaces all three with `Save confirmation — factual, no Undo`. Implementing from the 5.0 document would directly violate the owner's locked decision (no generic Undo, no eight-second window). **5.0 is history; 5.1 is the authority.**

## A.5 Document-rendering files will not be ported — confirmed

`doc-page.js`, `support.js` and `ios-frame.jsx` are browser rendering support for the `.dc.html` design documents. They are **not** React Native components. Neither they, nor any `.dc.html` markup, CSS, inline `<style>`, keyframe (`nUp`, `nFade`, `nSheet`, `nStepL`, `nStepR`, `nToast`) or Google-Fonts `<link>` will be copied into the Expo app. The HTML documents are a visual reference that the `.md`/`.json` exports describe in machine-readable form; **implementation reads the exports, not the HTML.**

For this planning task the three 5.1 HTML documents were fetched and their text extracted locally to a session scratchpad for reading only. Nothing was written into the repository except this plan.

## A.6 Conflicts, gaps and contradictions found

These are identified, **not silently resolved**. Each carries an owner and a required action.

### Blockers for the wave they affect (not blockers for approving this plan)

| # | Conflict | Evidence | Affects | Owner | Required action |
|---|---|---|---|---|---|
| **C-1** | **Icon library mismatch.** Design B mandates `lucide-react-native`, 24 grid, 1.75 stroke. The repo has **no** Lucide dependency and uses `@expo/vector-icons` (Ionicons) in **83 files**. | `package.json`; `grep -rln "@expo/vector-icons" src` → 83 | W1 (icon foundation), W4, all screens | Product + Engineering | Decide: (a) adopt Lucide (new dependency, 83-file migration — large diff, contradicts “keep each wave reviewable”), or (b) keep Ionicons and treat Lucide as visual reference only, mapping stroke/size tokens onto Ionicons. **Recommendation: (b) for W1–W9; revisit Lucide as its own isolated wave.** |
| **C-2** | **Custom tab glyphs do not exist.** Design B p.3 and Tokens `icons.customTabGlyphs` name four custom paths (`today-sunrise`, `money-currents`, `wealth-contour`, `grow-sprout`) and state “custom paths supplied in the handoff”. **No SVG path data appears anywhere in the package.** | **Confirmed against the full 30-file corpus:** the four names occur only as string literals in `Nolie_Design_5_Tokens.json:419-424`. No path data in any `.dc.html` (incl. the 5.0 docs, `Navilo Design System`, `Navilo Motion Addendum`, `Navilo Design Review v2–v4`), the `_ds` bundle, or `ios-frame.jsx` | W2 (dock) | Claude Design | **Request the four glyph path definitions from Claude Design.** Until supplied, W2 keeps current Ionicons tab glyphs and the dock restyle proceeds without them. |
| **C-3** | **Tokens.json has no `§components` value matrix.** Design B p.6 and the handoff both state “Tokens.json §components lists, per component: variants × states × 6 themes with resolved values.” The actual file contains `componentThemeMatrix`, which lists only **role names** per component — no resolved values, no variant × state expansion. | `Nolie_Design_5_Tokens.json` | W1 acceptance, W4 | Claude Design | Either request the resolved matrix, or accept that W1 **derives** it by construction from `color.shared[scheme]` + `color.styleScoped[style][scheme]` and ships a generated six-theme catalogue as the artefact. **Recommendation: derive it in W1** — the semantic model is complete enough, and a derived matrix is self-consistent by construction. Record the deviation. |
| **C-4** | **No contrast table in Tokens.json.** Doc A p.14 quotes 5 key pairs and says “Full table in Tokens.json”. It is absent. | Doc A p.14; `Nolie_Design_5_Tokens.json` | W1 acceptance gate | Engineering | W1 must **compute** the contrast table from the token values and assert the doc-A floors (body ≥ 4.5:1, large figures ≥ 3:1, icons/chrome ≥ 3:1, disabled exempt) as an automated test. The 5 quoted pairs become fixture assertions. |
| **C-5** | **Fonts are not installed and no font is applied anywhere.** Tokens require `@expo-google-fonts/figtree` and `@expo-google-fonts/noto-sans-thai`. Neither is in `package.json`. `grep -rn "fontFamily" src` → **zero hits**; `useFonts` → zero hits. The app runs entirely on platform default fonts. | `package.json`; grep | W1 | Product + Engineering | Approve two dependency additions before W1 starts. This Phase 0 task must not install them. Note `expo-font ~14.0.12` and the `expo-font` plugin are already present, so the plumbing exists. |
| **C-6** | **Thai localisation is nominal, not real.** `en.json` and `th.json` each contain **26 keys**, perfectly matched. Only **3 files** call `useTranslation` (`TodayScreen`, `SettingsScreen`, `LanguageScreen`). Essentially all customer copy is hardcoded English in components. | `src/i18n/locales/*.json`; `grep -rln "useTranslation" src` | W1 (font loading is fine), **W11 acceptance criterion 10** | Product | Design 5.1 assumes a translated product: “Thai runs ~30% longer”, “both locales must pass the same overflow checks”, W11 gate “Thai expansion: no clipped buttons or truncated money labels”. **That criterion is currently unmeetable** — there are only 26 Thai strings. Decide: (a) descope Thai verification to the 26 translated strings + Language screen and record it, or (b) commission a localisation wave (large, separate from Design 5.1). **Recommendation: (a) for Design 5.1, and raise localisation as its own workstream.** Locale-aware font loading still ships in W1 and is correct regardless. |
| **C-7** | **Expo version instruction contradicts the installed version.** `AGENTS.md` says “Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/”. `package.json` pins `expo ^54.0.35`; `jest-expo 54.0.17`. | `AGENTS.md`; `package.json` | Any wave that touches dependencies or Expo APIs | Owner | Confirm which is authoritative before W1 installs fonts. Writing against v57 docs while running v54 risks using APIs that do not exist. **Recommendation: treat v54 as authoritative until an explicit upgrade is approved, and correct `AGENTS.md`.** |

### Lower-severity inconsistencies (record, no blocking action)

| # | Item | Note |
|---|---|---|
| C-8 | Screen_Specifications §10 “Responsive summary” is a four-line summary, while Doc A p.15 says “representative 320/360/768 layouts for every core screen are enumerated in Screen_Specifications.md §Responsive.” The per-screen enumeration does not exist. | W5–W9 derive per-screen responsive behaviour from the stated rules. No request needed. |
| C-9 | Design project is named “Navilo mobile design system”; contents are Nolie. | Cosmetic. |
| C-10 | Handoff §4 lists `AddIncomeModal`, `AddRecurringItemModal`, etc. as “Form bodies (14 tasks)” but names only 7 components. | Correct in substance: 7 form components serve 14 catalogue tasks via presets. Mapping made explicit in [§B.4](#b4-the-fourteen-add-tasks). |
| C-12 | **Residual 5.0 phrasing inside the 5.1 document.** Doc C p.3 “Reduced Motion — construction rule” still reads “guards, locks, focus moves, announcements **and Undo windows** are state-driven”, a leftover from 5.0. The same page's Save-confirmation block correctly says “factual toast — no Undo”. | Cosmetic only — it describes a construction rule and does not reinstate Undo. **The plan follows the 5.1 decision: no generic Undo anywhere** (register row 15). Flag to Claude Design at next revision; no action needed to proceed. |
| C-11 | Doc B says elevation `e3` is “sheet+tray”; Tokens `elevation.light.e3` is `0 -8 26` (upward shadow). Consistent, but Android has no equivalent — Tokens gives `androidElevation.e3: 12`. | Expected platform divergence; W1 must implement both paths. |

### Verified *non*-conflicts (good news)

| Item | Verification |
|---|---|
| **Wealth hero rename is mathematically safe.** | `WealthScreen.tsx:121` renders `computeTotalWealth(data)` into a local named `netWorth`. `wealthDefinitions.ts`: `computeTotalWealth = computeAccessibleNetWorth + computeRetirementSavings = (accessibleAssets − allLiabilities) + retirementAssets = totalAssets − totalLiabilities`. The Design 5.1 formula line “what you own minus what you owe” **reconciles exactly** with `totalAssets` / `totalLiabilities` already computed at `WealthScreen.tsx:114-115`. Renaming “Total Wealth” → “Net worth” is a **copy change with zero calculation change**. Invariant 4 is safe. |
| **Catalogue task set matches 1:1.** | Design’s 14 catalogue tasks map exactly onto the existing `AddAnythingKind` union (`AddAnythingSheet.tsx:29-43`). No task is added or removed — only labels and grouping change. |
| **The origin-contract fix is small and localised.** | `addWorkspaceTransitionController.ts:132` already accepts an optional `returnStack` on `FORWARD`; the defect is the default `?? ['chooser']` plus the call site. `AddAnythingSheet.tsx:787-789` (`beginForwardTransition`) already threads the parameter. The fix is seeding, not a reducer rewrite. |
| **The transfer-draft exception is explicit and contained.** | `AddAnythingSheet.tsx:536, 559, 676` all type as `Exclude<AddWorkspaceRoute, 'chooser' \| 'transfer'>`, and line 740 comments “transfer has no instanceKey/reset concept”. Parking transfer is a bounded, well-marked change. |
| **Phase machine matches the design’s description verbatim.** | `floatingAddTransition.ts:22` — `'closed' \| 'trayOpen' \| 'closingForAction' \| 'closingForDismiss' \| 'addSheetOpen'`, driven by `TRAY_CLOSED` (state, not timer). Design C p.2 describes exactly this. **Preserve verbatim.** |
| **Predictive back already disabled.** | `app.json` `android.predictiveBackGestureEnabled: false` — matches Tokens `system.androidPredictiveBack`. No change needed. |
| **Hardcoded colour debt is smaller than feared.** | Only **20 hex literals outside `src/theme/`** (135 total, 114 inside theme files) plus **56 `rgba()` literals** outside theme. Concentrated in `WelcomeFlow` (8 rgba + 2 hex), `WealthScreen` (8 + 1), `SafeToSpendHero` (8 + 3), `MoneyOpportunitiesHero` (7 + 4), calculators and celebrations. A tractable W1 migration, not an app-wide sweep. |

---

# B. Current-to-target mapping

Legend for disposition: **P** preserve · **RS** restyle · **RST** restructure · **C** consolidate · **RM** remove · **D** defer.

Financial invariants are cited by their audit §14 number.

## B.1 Routed screens

| Current path / component | Design 5.1 target | Disp. | Product behaviour affected | Financial invariant | Accessibility impact | Theme impact | Required tests |
|---|---|---|---|---|---|---|---|
| `src/screens/welcome/WelcomeFlow.tsx` | Doc A p.6 — 7 steps; “AI Financial Coach” removed; every Skip routes to step 6; disclosure mandatory, CTA disabled until ticked; atomic profile+consent write; failure holds on step 6 | **RST** | Skip semantics change (D5-023); preview copy change (D5-004) | 18 (persistence), 19 (atomic save) | Radio role on tiles, checkbox role + state on disclosure (currently missing), focus to heading per step | 2 hex + 8 rgba to migrate; featured gradient CTA | New structural: skip→step 6 routing; consent atomicity; rendered: checkbox/radio semantics; persistence-failure hold |
| `src/screens/today/TodayScreen.tsx` | Doc A p.7 — greeting → briefing hero (max 2 priority rows) → journey → August so far → Worth Knowing (max 1) → goal → Score footnote | **RST** | Card ordering and count caps; Score demoted to footnote | 10 (never fabricate $0), 16 (Score gates) | Spoken order fixed by doc A p.7; priority rows as buttons | Ambient field + one hero; one of only 3 files using `useTranslation` | Priority-rule unit tests; setup/partial/full dataset rendered tests; “no fabricated zero” regression |
| `src/screens/money/MoneyScreen.tsx` (also serves `MoneyDetail`) | Doc A p.8 — labelled measures with one-line definitions; payday bar; timeline; money flow; money plan; **Sources sheet replaces flip**; included-balances row | **RST** | Flip retired; measure labelling (D5-012) | 3 (exclusion ≠ net worth), 7 (repayments), 10, 11 (allocation is a preference) | Money row spoken template; estimate labelling | Hero + payday bar segments | Figures reconcile 1:1 with `safeToSpend`/`moneyPlan`/`moneyTimeline`/`monthlySummary`/`moneyFlowBreakdown`; **rewrite `tests/this-month-flip-card.test.ts`** |
| `src/screens/wealth/WealthScreen.tsx` (title “Wealth Map”) | Doc A p.9 — “Net worth” hero + spoken formula; own/owe bar; accessible-now + retirement line; staged own/owe sections; per-row `recorded [date]`; detail sheets Edit / Move money / Delete | **RST** | Hero rename (D5-011); staged disclosure; freshness lines | 4 (net worth + card sync), 6 (reversal), 13 (transfer eligibility), 14 (linked debt) | Net-worth spoken string; stale suffix | 1 hex + 8 rgba; navy gradient hero → `heroSurface` | Net-worth non-regression (value unchanged, label only); freshness rendering; linked-repayment naming |
| `src/screens/discover/DiscoverScreen.tsx` (route “Grow”, also `GrowDetail`) | Doc A p.10 — Journey hero → Goals row → **one** opportunity slot → Tools (4) → Learn → Score footnote. Market Pulse removed | **RST** + **RM** | Expandable category stacks removed; Market Pulse removed (D5-022) | 16 (Score gates: invalid → “Not enough recorded yet”) | Standing disclaimer footer; Explain sheet restyled | Journey accent retint | Unlock selectors unchanged; Score invalid-state regression; Market Pulse absence structural test |
| `src/components/discover/MarketPulsePreview.tsx` | Absent from Grow | **RM** (defer) | Removal from IA | — | — | — | Structural: not imported by `DiscoverScreen` |
| `src/screens/settings/SettingsScreen.tsx` | Doc A p.12 — profile, Appearance (scheme segmented + 3 style cards), Language, About & disclosure (AUD note), Reset (urgent row). Dock hidden | **RS** | Dock hidden here (new) | 18 | Segmented control semantics | Six-combination picker is the theme control surface | Visibility-matrix test; theme-switch instant |
| `src/screens/settings/LanguageScreen.tsx` | Restyled; immediate apply | **RS** | None | — | — | — | Font family re-resolves on switch (W1) |
| `src/screens/settings/ResetLuluScreen.tsx` (route `ResetLulu`, customer-facing “Reset Nolie”) | Restyled; guarded blocking flow preserved | **P** logic / **RS** | None | 18 (guarded wipe) | Rigid haptic on confirm | Urgent role only | Reset guard non-regression |
| `src/screens/goals/GoalsScreen.tsx` | Doc A p.12 — active list + estimated monthly line; completed/archived section; New goal (contextual origin) | **RS** | Contextual origin wiring | 12 (goal model) | — | — | Goal allocation non-regression; contextual-origin return |
| `src/screens/cards/CardsScreen.tsx` | Doc A p.12 — utilisation as fact; **“Credit health {n}/100” removed** (`CardsScreen.tsx:128`) | **RS** + copy | Copy change (approved row) | 4 (card liability sync) | — | — | Structural: string absent; utilisation figure unchanged |
| `src/screens/transactions/TransactionsScreen.tsx` | Doc A p.12 — optional framing kept; month groups; repayment rows labelled “not counted as ordinary spending”; row tap → contextual edit | **RS** | Contextual-origin edit | 7 (repayment accounting) | Repayment spoken template | — | Repayment labelling; contextual return |
| `src/screens/discover/HomeLoanCalculatorScreen.tsx` | Renamed **“Home loan repayments”**; inputs lead until a result exists; malformed input shows message not zero | **RS** + copy | Title/entry-label change (D5-021) — entry point is `DiscoverScreen.tsx:847,854` | — | — | 2 hex + 3 rgba | Structural: “Can I buy a home?” absent; malformed-input message |
| `src/screens/discover/CompoundCalculatorScreen.tsx` | Result hero after inputs on first open | **RS** | Result/input order | — | — | 2 hex + 4 rgba | Malformed-input handling |
| `src/screens/discover/EmergencyFundScreen.tsx` | “A common guideline is 3–6 months” replaces “Recommended (3-6 months)” (`EmergencyFundScreen.tsx:113`) | **RS** + copy | Approved copy row | — | — | 1 hex + 3 rgba | Structural: string replaced |
| `src/screens/discover/SavingsComparisonScreen.tsx` | Calculator template; “compares rates you enter yourself” | **RS** | — | — | — | — | — |
| `MoneyDetail` / `GrowDetail` (`RootNavigator.tsx:76-87`) | Unchanged — canonical screens in pushed+focused mode | **P** | None | 20 (origin preservation) | Focus lands on focused row, not title | — | Existing `pass-2e-pushed-destinations.render.test.tsx` must stay green |

**Routes: none added, none removed.** `RootNavigator` keeps `Main, Settings, Language, Goals, Cards, Transactions, MoneyDetail, GrowDetail, SavingsComparison, CompoundCalculator, EmergencyFund, HomeLoanCalculator, ResetLulu`. Tabs keep `Today, Money, Wealth, Grow`.

## B.2 Global navigation and Add architecture

| Current | Target | Disp. | Behaviour | Invariant | A11y | Theme | Tests |
|---|---|---|---|---|---|---|---|
| `src/navigation/MainTabNavigator.tsx` | Dock restyle; **no scene animation preserved** (regression gate); repeat-tap scroll-to-top preserved | **P** mechanics / **RS** | None | — | tablist/tab, “selected, 2 of 4” | 2 hex | `floating-navigation.test.ts` + `.render.test.tsx` stay green |
| `src/navigation/floatingNavGeometry.ts` | Geometry preserved (64/64/16/8/safe-area); **add tablet max-width 500 pt** | **P** + extend | Tablet centring is new | — | 68 pt at accessibility sizes | — | `add-workspace-geometry.test.ts`; new tablet-width test |
| `src/components/navigation/FloatingNavBar.tsx` | Restyle; blur capsule 92% + 12 pt, solid fallback | **RS** | None | — | — | Six-theme | Rendered dock states |
| `src/components/navigation/FloatingAddButton.tsx` | Restyle; **five-phase machine preserved verbatim** | **P** | None | — | button + expanded | featured gradient | `floating-add-transition.test.ts` — must not change |
| `src/components/navigation/QuickActionsTray.tsx` | 3×2 panel, dashed neutral **More** tile, 2×3 reflow at accessibility sizes | **RST** | 9 → 6 tiles | — | menu/menuitem, “1 of 6” | tray tile tints retint | Tray config tests; reflow test |
| `src/components/navigation/quickActions.ts` | **Rewrite to six:** `record_spending, income_received, add_bill, move_money, add_goal, more`. Remove `addAccount`, `addDebt`, `addAsset`, `centerAction`(as “Add anything”) | **RST** | D5-002, D5-003; “Add asset”→ETF path removed | 2 (income models must stay distinct) | — | `ambient` flag becomes dead (Ask Nolie absent) | New unit tests for the 6-tile config and resolutions |
| `src/lib/askNolie.ts` + `src/components/navigation/AskLuluSheet.tsx` | Ask Nolie absent from IA — no tile, no teaser | **RM** from IA (code disposition = engineering decision, out of visual scope) | Centre tile no longer resolves via `resolveCenterTileConfig` | — | — | — | Structural: no Ask surface reachable |
| `src/components/navigation/addWorkspaceTransitionController.ts` | **Origin-seeded return stacks.** `quick → []`, `catalogue → ['chooser']`, `contextual → []`. Change the `?? ['chooser']` default at line 132; nested handoffs keep pushing | **RST** (small) | **D5-001 fix** | 20 (origin preservation) | Back control absent entirely for quick origin | — | `add-workspace-transition-controller.test.ts` extended with all four origins; `nested-loan-handoff-back.test.ts` must stay green |
| `src/components/navigation/AddAnythingSheet.tsx` | Catalogue restyle (3 groups, r24 sheet, 52 pt rows, DRAFT badge); origin metadata threaded into `beginForwardTransition` (line 787); **transfer drafts parked** | **RST** | Transfer parking is an interaction change | 13 (transfer eligibility **unchanged**), 19 (atomic save) | Inactive layers keep `accessibilityElementsHidden` | — | `add-anything-sheet-*.test.ts`, `parked-draft-and-repayment-ux.test.ts`; **new** transfer-parking tests |
| `src/components/shared/KeyboardSheet.tsx` | Canonical task workspace; pinned Save; discard guard; breadcrumb for nested steps | **P** logic / **RS** | None | 19 | Focus → title on open, → section heading on step | 2 rgba | `discard-warning-and-repayment-schedule.test.ts` green |

## B.3 Overlays, sheets and shared primitives

| Current | Target | Disp. | Notes / tests |
|---|---|---|---|
| `shared/Screen.tsx` | Preserve safe-area / bottom-clearance / overlay contract; **add** ambient slot, large-title collapse (44 pt bar after 56 pt scroll), FlatList variant | **P** + extend | Overlay z-order is delicate — regression risk R-4. Back control already has role/label/hint |
| `shared/InfoSheet.tsx`, `shared/OptionsSheet.tsx`, `shared/DatePickerModal.tsx` | One sheet shell + one motion pair (280/200 ms); native date wheel kept | **C** | `OptionsSheet` currently **does not consume** `useReduceMotion` — must be fixed or retired (Design C p.3 names it explicitly) |
| `shared/SectionCard.tsx`, `Button.tsx`, `EmptyState.tsx`, `ProgressBar.tsx` | Canonical variants; local implementations migrate onto them | **C** | W4 |
| `shared/MetricCard.tsx` + local heroes | Canonical figure/card family (hero ≤1 per screen, tint ≤2 visible) | **C** | W4 |
| `shared/ScoreRadialGauge.tsx` | Kept as the single Score visual | **P** | — |
| `shared/CircularScore.tsx`, `shared/ScoreRing.tsx` | Visually unused; **retire only after Score v2** (D5-025) | **D** | `CircularScore` also does not consume `useReduceMotion` |
| `shared/UnsavedChangesBanner.tsx`, `shared/ResetPendingOverlay.tsx` | Behaviour preserved, restyled | **P** / **RS** | Assertive announcement preserved |
| `money/ThisMonthCard.tsx` (3D flip) | **Flip retired**; content → `money/ThisMonthSourcesSheet.tsx` | **RST** | Uses its own local `AccessibilityInfo.isReduceMotionEnabled` (lines 286-311) — a third reduce-motion pattern. **`tests/this-month-flip-card.test.ts` is a Class-C structural test that regex-matches flip wiring in source and will fail — it must be rewritten, not deleted silently.** |
| `celebrations/*` (Big / Medium / Small) | Tiers: toast = routine save (not a celebration) · medium inline card = goal complete / stage-up · full overlay = first-setup completion only. No confetti | **RS** | 1+2 hex, 4+3 rgba to migrate |
| `today/*` (15 components incl. `TodayBriefingCard`, `WorthKnowingCard`, `ScoreChip`, `SmartReminderCard`, `ReminderDetailSheet`) | Rebuilt into the p.7 hierarchy; reminder lifecycle preserved | **RST** logic-preserving | `reminder-lifecycle.render.test.tsx`, `reminder-focus-announcements.render.test.tsx`, `worth-knowing*.test` must stay green |
| `money/SafeToSpendHero.tsx`, `discover/MoneyOpportunitiesHero.tsx` | Migrate to `heroSurface` tokens | **RS** | Highest hardcoded-colour density outside theme |
| `lib/a11yFocus.ts` + `lib/accessibilityFocus.ts` | **One focus-helper module** (D5-026) | **C** | 48 lines total, 5 consumers — a small, safe consolidation. W11 |

## B.4 The fourteen Add tasks

All logic preserved. Seven form components serve fourteen tasks via presets — this is correct reuse, not duplication (clarifies C-10).

| # | Catalogue task (5.1 label) | Current label | `AddAnythingKind` | Form component | Preserve (invariant) |
|---|---|---|---|---|---|
| 1 | Record spending | Add expense | `expense` | `dashboard/QuickAddModal.tsx` | 5 (payment source vs balance effect), 6 (exact reversal), 17 (money grammar) |
| 2 | Add income source | Add income source | `income` | `income/AddIncomeModal.tsx` | 2 (never becomes recurring silently), 9 (anchor day) |
| 3 | Record income received | Record income received | `income_received` | `dashboard/QuickAddModal.tsx` | 2 |
| 4 | Add bill | Add bill | `bill` | `money/AddRecurringItemModal.tsx` | 8 (idempotency), 9, 14 (linked debt blocking) |
| 5 | Move money | Transfer money | `transfer` | `wealth/TransferForm.tsx` | 13 (eligibility — **unchanged**), 15 (BNPL rules) |
| 6 | Add cash | Add cash | `cash` | `wealth/AddWealthItemModal.tsx` | 3 (inclusion defaults) |
| 7 | Add savings | Add savings | `savings` | `wealth/AddWealthItemModal.tsx` | 3 (**savings defaults OUT of Money**) |
| 8 | Add everyday account | Add everyday account | `everyday` | `wealth/AddWealthItemModal.tsx` | 3 |
| 9 | Add investment | Add investment | `investment` | `wealth/AddWealthItemModal.tsx` | 4 |
| 10 | Add property | Add property | `property` | `wealth/AddWealthItemModal.tsx` | 4, 14 |
| 11 | Add retirement savings (super) | Add retirement savings | `retirement` | `wealth/AddWealthItemModal.tsx` | 4 (excluded from accessible-now by definition) |
| 12 | Add debt (loan · BNPL) | Add liability | `liability` | `wealth/AddWealthItemModal.tsx` | 14, 15 |
| 13 | Add credit card | Add credit card | `creditCard` | `credit/AddCreditCardModal.tsx` | 4 (card liability sync) |
| 14 | Add goal | Add goal | `goal` | `goals/AddGoalModal.tsx` | 12 (optional target/date) |

Label changes only: #1 `Add expense` → `Record spending`; #5 `Transfer money` → `Move money`; #12 `Add liability` → `Add debt (loan · BNPL)`. Catalogue title `Add to Nolie` retained; tray centre `Add anything` → `More`.

---

# C. Design-system migration

## C.1 Token model: current → Design 5.1 semantic

The current `src/theme/tokens.ts` `ColorTokens` interface is **brand-and-feature-named** (`accent`, `navy`, `aiBlue`, `purple`, `sunrise`, `market`, `gold`). Design 5.1 is **role-named**. This is the core migration.

| Current token | Design 5.1 semantic token | Note |
|---|---|---|
| `background` | `bgCanvas` | |
| `surface` | `bgSurface` | |
| `surfaceMuted` | `bgRaised` | |
| `border` / `borderStrong` | `border` (hairline 1 pt) | Dark mode’s primary depth cue |
| `textPrimary` / `textSecondary` / `textMuted` | `textPrimary` / `textSecondary` / `textTertiary` | Ink is deep ocean navy, never pure black |
| `navy` (important numbers) | `textTitle` + `textFigure` | Split by role |
| **`accent` (green)** | **`success` + `movementPositive`** | **Green is no longer the brand accent.** Highest-impact rename |
| `accentStrong` / `accentSoft` | `success` / `successTint` | |
| `aiBlue` / `aiBlueSoft` / `onAiBlue` | `interactive` / `interactiveTint` / `onInteractive` | **Interactive is Ocean Blue in all three styles** |
| `purple`, `sunrise` (+ `*Soft`, `on*`) | `styleScoped.purple.*`, `styleScoped.sunrise.*` (ambient/featured/hero only) | Styles may no longer touch interactive or status |
| `success` / `successSoft` / `successBright` | `success` / `successTint` (+ `successBorder`) | `successBright` has no 5.1 equivalent — its only use is the Score ring tiering; **retain until Score v2** |
| `warning` / `warningSoft` | `warning` / `warningTint` (+ `warningAccent`, `warningBorder`) | Always icon + word |
| `danger` / `dangerSoft` | `urgent` / `urgentTint` (+ `urgentText`) | Overdue, destructive confirm, persistence failure — nothing else |
| `market`, `marketSoft` | `info` / `infoTint` | Market Pulse removed; role survives for insight |
| `gold`, `goldSoft`, `onGold` | celebration accent within `styleScoped` | Barred from status roles |
| `heroGradient`, `aiGradient`, `aiGradientBlue`, `navyGradient` | `heroSurface` (3-stop) + `featured` (2-stop) | Four gradients collapse to two roles |
| — (new) | `movementNegative` = slate `#3E5266` | **Negative deltas are slate with an explicit −, never red** |
| — (new) | `scrim`, `toastBg`, `toastAction` | |
| `src/theme/contrastOverrides.ts` | **Retired** — values correct by construction | 2 hex; retire only once the computed contrast test (C-4) passes |

## C.2 Hardcoded colour → token migration map (exact files)

135 hex literals total; **114 live inside `src/theme/`** (legitimate token definitions). The migration targets the **20 hex + 56 rgba outside theme**:

| File | hex | rgba | Target |
|---|---|---|---|
| `src/screens/welcome/WelcomeFlow.tsx` | 2 | 8 | `featured` CTA + scrim stop ≥ `rgba(0,0,0,0.13)` |
| `src/screens/wealth/WealthScreen.tsx` | 1 | 8 | `heroSurface`/`heroBorder`; the inline `'#8FE0B8'` delta colour (line ~277) → `movementPositive` |
| `src/components/money/SafeToSpendHero.tsx` | 3 | 8 | `heroSurface`, `textFigure` |
| `src/components/discover/MoneyOpportunitiesHero.tsx` | 4 | 7 | `heroSurface`, `infoTint` |
| `src/screens/discover/CompoundCalculatorScreen.tsx` | 2 | 4 | `heroSurface`, `interactive` |
| `src/screens/discover/HomeLoanCalculatorScreen.tsx` | 2 | 3 | as above |
| `src/screens/discover/EmergencyFundScreen.tsx` | 1 | 3 | as above |
| `src/components/celebrations/BigCelebrationOverlay.tsx` | 1 | 4 | celebration accent (style-scoped) |
| `src/components/celebrations/MediumCelebrationSheet.tsx` | 2 | 3 | as above |
| `src/navigation/MainTabNavigator.tsx` | 2 | — | `interactive` / `textTertiary` |
| `src/components/shared/KeyboardSheet.tsx` | — | 2 | `scrim` |
| `src/theme/ThemeContext.tsx` | 1 | — | resolve into token set |
| Remainder | — | ~6 | audit during W1 |

**System guarantee to enforce from end of W1:** no hex or `rgba()` literal outside `src/theme/`. Enforce with a repository test, not review discipline.

## C.3 Typography: current → locale-aware target

Current `tokens.ts:181-186` — five roles, fixed sizes, no line heights, **no font family anywhere**:

| Current | Size/weight | Design 5.1 role | Size / line-height / weight |
|---|---|---|---|
| — | — | `figureHero` | 46 / 52 / 600, tracking −1.5, tabular, cap 1.6× |
| — | — | `figureLarge` | 28 / 34 / 600 tabular |
| — | — | `figureRow` | 17 / 24 / 600 tabular, right-aligned |
| `title` | 24 / 700 | `titleScreen` | 29 / 34 / 600, tracking −0.6, cap 1.8× |
| — | — | `titleSection` | 20 / 26 / 600 |
| `heading` | 17 / 600 | `titleCard` | 17 / 23 / 600 |
| `body` | 15 / 400 | `body` | 16 / 23 / 400 |
| — | — | `support` | 14 / 20 / 400 |
| `caption` | 13 / 400 | `meta` | 13 / 18 / 400 |
| `micro` | 11 / 500 | `eyebrow` | 12.5 / 16 / 600, uppercase, tracking +1 |
| — | — | `labelButton` | 16 / 20 / 600 |
| — | — | `labelTab` | 11 / 14, inactive 500 / active 600 |

**Locale architecture (new, W1):**

- `en` → Figtree (`@expo-google-fonts/figtree`, 400/500/600/700, SIL OFL 1.1, free for commercial bundling).
- `th` → Noto Sans Thai (`@expo-google-fonts/noto-sans-thai`, same four weights, 1:1 mapping). **Figtree carries no Thai glyphs and must never be applied to Thai text.**
- Thai metrics: line-height ×1.42; field height 56 → **60 pt**; button vertical padding **+2 pt**; chip 26 → **28 pt**; **no uppercase transforms** (so `eyebrow` renders sentence case in Thai); buttons wrap to two lines rather than shrink below 11 pt; baselines align via **fixed control heights**, not font metrics.
- Digits: Figtree tabular in **both** locales (`fontVariant: ['tabular-nums']`), cents at 55% size in `textSecondary`, currency symbol full size.
- Loading: `useFonts` + splash hold at startup, both families. **On load failure, fall back to the platform default for that locale, log, and never block launch.**
- Language switch re-resolves the **family token only**.
- Fallbacks: SF Pro (iOS) / Roboto (Android) — layouts must not assume Figtree-only widths.

⚠️ See **C-6**: locale-aware font loading is correct and shippable, but the app has only 26 Thai strings. The font architecture is right; the Thai *verification* scope must be honestly reduced.

## C.4 Component → primitive map

| Current | Target primitive | Wave |
|---|---|---|
| Local `TextInput`s across form components | Field system: text / currency / picker-trigger, 56 pt (60 pt Thai), label-in-field eyebrow, **error reserves its line so nothing jumps**, strict money grammar enforced **on blur, in words, never a shake** | W4 |
| Local chips / segmented / toggles | Chips (radio semantics, ✓ + fill, never colour alone), segmented ≤3, toggles with state in the label; all ≥44 pt (chips via 9 pt hit-slop) | W4 |
| Local rows (settings, assets, liabilities, transactions, goals) | List / navigation / financial rows: 56 pt min, leading 28 pt icon tile, money right + tabular, meta line carries recurrence + freshness, **one full spoken sentence per row** | W4 |
| `SectionCard` + local card styles | Three tiers: hero surface (**1 per screen**) · highlighted tint (**≤2 visible**) · supporting surface (unlimited) | W4 |
| `Button` + bespoke links/add buttons | 52 primary / 44 secondary-tertiary / 36 compact; pressed = one ramp step + scale .97 @150 ms; loading replaces label with **width locked**; destructive solid **only inside confirmations** | W4 |
| `MetricCard` + local heroes | Financial figure anatomy: symbol full-height `textSecondary` · dollars `textFigure` tabular · cents 55% · sign always explicit | W4 |
| `InfoSheet` / `OptionsSheet` / `DatePickerModal` | One sheet shell + one motion pair | W4 |
| `ProgressBar` | 6 pt, r3, track `bgRaised`, fill semantic by meaning (goal=success, generic=interactive, tight=warningAccent), **never red** | W4 |
| `EmptyState` | Canonical empty/error/success/toast/disclosure family | W4 |

**Deprecated components and when they may be removed:**

| Component | Removable when |
|---|---|
| `contrastOverrides.ts` | End of W1, **after** the computed contrast test passes in all six themes |
| `CircularScore.tsx`, `ScoreRing.tsx` | **Only after Score v2 ships** (D5-025). Not in Design 5.1 scope |
| `AskLuluSheet.tsx`, `askNolie.ts` | Removed from IA in W3. Code deletion is an engineering decision outside visual scope — leave the modules, unwire the surfaces |
| `MarketPulsePreview.tsx` | Unwired from `DiscoverScreen` in W8. Retain the file pending the defer-or-source decision (D5-022) |
| `ThisMonthCard` flip mechanics | W6, once `ThisMonthSourcesSheet` carries the content and the flip test is rewritten |
| Legacy gradient tokens (`aiGradient`, `aiGradientBlue`, `navyGradient`) | End of W5–W9 once every consumer moves to `heroSurface`/`featured` |

## C.5 Six-theme and platform implications

- Three styles (Ocean, Purple, Sunrise) × two schemes. **Styles retint only** `ambient`, `featured`, `heroSurface`, journey/celebration accents, onboarding backdrop, tray tile tints.
- Styles **may never touch** `interactive`, status roles, text roles, borders, movement colours, chart semantic series. Interactive blue, destructive clay, success, warning and text roles are **byte-identical across all six**.
- Sunrise ambient is **barred from status components**; warnings always pair warning text + icon + word.
- Platform: light uses shadows (e1/e2/e3), dark halves shadow opacity and relies on **surface step + border**; Android uses `elevation 2/6/12`. Only hero, dock, FAB, tray, sheets and toasts float — ordinary cards sit flat with borders.
- Blur has exactly **one** use: the dock capsule at 92% opacity + 12 pt, with a solid fallback on low-end Android. No glass cards.
- `app.json` `userInterfaceStyle` is currently `"light"` and must become `"automatic"` (**D5-019, W2**).
- Theme switch is **instant** (`themeSwitch: 0` ms) — no scene crossfade, scroll preserved. System-scheme changes apply on next foreground.

## C.6 Minimum safe foundation before any screen migration

W1 must land **all** of the following before W5 touches a screen; W2–W4 may proceed in parallel with nothing below outstanding:

1. Semantic token module rebuilt from `Nolie_Design_5_Tokens.json` (roles, not brand names), resolving `shared[scheme]` + `styleScoped[style][scheme]`.
2. Locale-aware typography with both font families loaded, splash hold and non-blocking failure fallback.
3. Spacing (4–48), screen margins (20 / 16 ≤360), radius (12/16/20/24/12/999/20), elevation (e1–e3 + Android + dark rule).
4. A derived six-theme component catalogue (satisfying C-3 by construction) plus an automated contrast test asserting the doc-A floors (satisfying C-4).
5. A repository test forbidding hex/`rgba()` outside `src/theme/`.

---

# D. Behaviour-change register

Classes: **V** visual only · **EP** existing behaviour preserved · **NI** navigation/interaction change · **NEW** new product behaviour · **DEF** deferred · **CB** compliance-blocked.

| # | Change | Class | Status / conditions |
|---|---|---|---|
| 1 | **Origin-aware Add** — quick `[]`, catalogue `['chooser']`, contextual `[]`; Save always returns to origin | **NI** | Approved. Fixes D5-001. Requires the full journey matrix green before checkpoint |
| 2 | **Quick tray 9 → 6** (record spending, income received, add bill, move money, add goal, More) | **NI** | Approved. D5-002 |
| 3 | **“Add asset” removed** as a quick action; six named asset types in catalogue | **NI** | Approved. D5-003 — removes the misleading ETF shortcut |
| 4 | **Floating navigation visibility matrix** (visible on 4 roots + MoneyDetail/GrowDetail/Goals/Cards/Transactions/EmergencyFund; hidden for tasks, keyboard, pickers, alerts, Settings/Language/Reset, calculators, onboarding, recovery, info sheets) | **NI** | Approved. D5-013. Driven by route + keyboard + overlay state, **never scroll** |
| 5 | **Transfer draft parking** on Back (parity with all other tasks) | **NI** | Approved — uses the existing parked-draft mechanism, **no new persistence**. Requires targeted tests. **Transfer eligibility and financial effects are not touched** (invariant 13) |
| 6 | **Catalogue parked drafts + DRAFT badge** | **EP** (badge is **V**) | Approved |
| 7 | **This Month flip retired → Sources sheet** | **NI** (content unchanged) | Approved. Breaks `tests/this-month-flip-card.test.ts` — rewrite required |
| 8 | **Grow restructuring** (journey hero → goals → 1 opportunity → tools → learn → score footnote; category stacks removed) | **NI** (content unchanged) | Approved. D5-006 |
| 9 | **Market Pulse removed** | **DEF** | Deferred pending source + refresh cadence decision (D5-022). Absent, not teased |
| 10 | **Score containment** — footnote on Today, quiet row + Explain sheet on Grow, always “interim · based on what you’ve recorded · not a credit score” | **EP** presentation | Approved interim. **Formula, gates, categories and history unchanged** (invariant 16). Invalid renders “Not enough recorded yet”, never a clamped number |
| 11 | **Recorded-date freshness** on decision-relevant manual balances; aggregates may surface the oldest included record date | **V** + **NI** | Approved for the *label*. **No calculation changes based on freshness** |
| 12 | **Stale-data auto-labelling threshold** | **NEW → DEF** | Stale visual state may be implemented **only as an inactive/configurable component state**; trigger **ships OFF** pending a category-aware policy (cash/accounts, cards, investments, property, retirement savings) |
| 13 | **Save confirmations** — atomic save, calm close, factual toast (record, amount, cadence, effective date) | **NI** | Approved in 5.1 form. **No generic Undo, no 8-second window, no restore language anywhere** |
| 14 | **Delete confirmations** — destructive alert **before** execution, consequence sentence, rigid haptic on confirm, factual confirmation with no restore implied | **NI** | Approved. Existing exact-reversal and linked-record behaviour (invariants 6, 14) **unchanged** |
| 15 | **Generic Undo / restore window** | **DEF** | **Removed from implementation scope.** Requires its own persistence/reversal specification |
| 16 | **Theme switching instant** + `userInterfaceStyle` → `"automatic"` | **NI** + config | Approved. D5-019 engineering change, W2 |
| 17 | **Locale-aware fonts** (Figtree EN / Noto Sans Thai TH) | **NEW** (foundation) | Approved. Blocked on dependency approval (**C-5**) and Expo-version confirmation (**C-7**). Verification scope constrained by **C-6** |
| 18 | **Onboarding: “AI Financial Coach” removed; every Skip routes to the mandatory disclosure** | **NI** | Approved (D5-004, D5-023). Preview copy APPROVED; **disclosure wording itself is PRESERVE-EXISTING pending legal** |
| 19 | **Wealth hero “Total Wealth” → “Net worth” + spoken formula** | **V** + copy | Approved. Verified arithmetically identical — see §A.6 non-conflicts |
| 20 | **“Can I buy a home?” → “Home loan repayments”** | **V** + copy | Approved. D5-021 |
| 21 | **“Credit health {n}/100” removed; utilisation stated as fact** | **V** + copy | Approved |
| 22 | **Emergency fund “Recommended (3-6 months)” → “A common guideline is 3–6 months”** | **V** + copy | Approved |
| 23 | **Grow opportunity / debt-coach reframed wording** | **CB** | **BLOCKED pending compliance review — keep existing production copy until sign-off.** Do not implement new wording in W8 |
| 24 | **Onboarding disclosure revised wording** | **CB** | **BLOCKED pending legal.** Structure/layout may be restructured; **wording preserved verbatim** |
| 25 | **Tab scenes never animate** | **EP** | Regression gate, not taste — prior fades caused blank device scenes |
| 26 | **Repeat-tap scroll-to-top; stable tab mounting** | **EP** | Preserved |
| 27 | **Modal-freeze invariant** — tray is a plain overlay, closes fully, `onClosed` confirms, only then the single native workspace mounts, **never a timeout** | **EP** | **Preserved verbatim.** Highest-severity regression risk |
| 28 | **Reduced Motion parity** — every behaviour state-driven; RM is a parallel build, not shorter durations | **EP** + extend | `OptionsSheet` and `CircularScore` currently do not consume the RM hook; `ThisMonthCard` uses a third local pattern. Consolidate in W10 |
| 29 | **Ask Nolie absent from IA** (no tile, no disabled teaser) | **DEF** | Approved. Code disposition of `askNolie.ts`/`AskLuluSheet.tsx` is an engineering decision, out of visual scope |
| 30 | **Score v2** | **DEF** | Separate workstream. No new factors, categories, recommendations or wellbeing language |

---

# E. Phased implementation waves

**Global rules for every wave.** Never combine financial-calculation refactoring with visual implementation. Never combine two waves. Every wave ends with a checkpoint commit only after the owner’s device test passes. All 20 invariants are presentation-only throughout.

**Repository checkpoint convention.** Existing history uses `checkpoint: <lowercase description>`. The design package proposes tag-style names (`design5-w1-tokens`). This plan recommends the **repository convention**, with the design tag noted for traceability.

---

## Wave 1 — Foundations and tokens

**Scope.** Semantic token model; locale-aware typography and font architecture; theme structure; shared surface/spacing/radius/elevation foundations. No screen restructuring.

**Exact intended files.**
- `src/theme/tokens.ts` (rebuild to semantic roles), `src/theme/palettes.ts` (→ `styleScoped`), `src/theme/ThemeContext.tsx` (resolution + font family token)
- New: `src/theme/typography.ts` (roles + locale resolution), `src/theme/fonts.ts` (load, splash hold, failure fallback)
- `App.tsx` (font loading + splash hold)
- `package.json` — **two dependency additions only**: `@expo-google-fonts/figtree`, `@expo-google-fonts/noto-sans-thai` (requires approval, C-5)
- Colour migration in the 12 files listed in §C.2
- New tests: `tests/design5-tokens.test.ts`, `tests/design5-contrast.test.ts`, `tests/design5-no-raw-color.test.ts`, `tests/rendered/design5-typography.render.test.tsx`

**Explicit non-goals.** No screen layout change. No navigation change. No Add change. No component API change. No icon-library change (see C-1). No copy change. No calculation touched.

**Dependencies.** C-5 (font packages approved), C-7 (Expo version confirmed). C-3 and C-4 are resolved *within* this wave by derivation/computation.

**Migration strategy.** Add the new semantic names **alongside** the old ones in one commit, migrate consumers file-by-file, then delete the legacy names in a final commit within the wave. This keeps every intermediate state compiling and each diff reviewable. `contrastOverrides.ts` is retired only after the computed contrast test passes.

**Tests.**
- *Unit/structural:* every semantic role resolves in all six combinations; deprecated-token map has no orphans; **no hex or `rgba()` outside `src/theme/`**; Thai metrics resolve (line-height ×1.42, field 60 pt, chip 28 pt, no uppercase transform).
- *Rendered:* type-role rendering; font-load-failure path falls back and does not block launch.
- *Financial regression:* full legacy suite (50 files) + rendered suite (15 files) — **zero diffs expected**; W1 touches no calculation.

**Device test script.** 1) Launch cold on iOS — fonts render, no splash hang. 2) Same on Android. 3) Kill network / simulate font failure — app launches with platform font, no block. 4) Switch to Thai — Thai text renders in Noto Sans Thai, digits stay tabular Latin. 5) Cycle all six themes — no unstyled flash. 6) Dynamic Type XXL — figures cap, body reflows.

**Acceptance criteria.** Contrast floors pass in all six themes including gradient scrim stops (disabled exempt); six-theme sample renders; Dynamic Type samples at 100/200%; **zero calculation diffs**; both font families load with a working failure path; no raw colour outside theme.

**Rollback risks.** Font metrics shift layouts app-wide — snapshot before/after. Token rename is broad; mitigated by the additive-then-delete strategy. If fonts destabilise, the wave can ship tokens-only and defer typography.

**Checkpoint.** `checkpoint: design 5.1 wave 1 semantic tokens and locale typography foundation` *(design tag: `design5-w1-tokens`)*

---

## Wave 2 — Navigation and global surfaces

**Scope.** Screen shell restyle + large-title collapse + ambient slot + FlatList variant; dock and detached `+` restyle; route/keyboard/overlay visibility matrix; safe areas; tablet max-widths; `app.json userInterfaceStyle` → `"automatic"`. **Preserve the modal phase machine untouched.**

**Exact intended files.** `src/components/shared/Screen.tsx`; `src/components/navigation/FloatingNavBar.tsx`, `FloatingAddButton.tsx` (**styling only**); `src/navigation/floatingNavGeometry.ts` (add tablet max-width 500 pt); `src/navigation/MainTabNavigator.tsx`, `RootNavigator.tsx` (visibility wiring); `app.json`. New: `src/navigation/dockVisibility.ts` (pure matrix). Tests: `tests/design5-dock-visibility.test.ts`, `tests/rendered/design5-shell.render.test.tsx`.

**Explicit non-goals.** No Add architecture change (W3). No screen content change. **`floatingAddTransition.ts` must not be edited.**

**Dependencies.** W1.

**Migration strategy.** Extract visibility into a **pure, testable matrix function** first, unit-test it exhaustively, then wire it. Never scroll-driven.

**Tests.** Dock visibility for every route × keyboard × overlay combination; Android Back matrix; repeat-tap scroll-to-top; tablet max-width; **zero tab-scene animation** (structural); VoiceOver tablist semantics; existing `floating-navigation.test.ts` + `.render.test.tsx` unchanged and green.

**Financial regression.** Full suite; no calculation touched.

**Device test script.** 1) Each of 4 tabs — dock visible, no blank scene on switch. 2) Push MoneyDetail/GrowDetail/Goals/Cards/Transactions — dock visible. 3) Open Settings/Language/Reset/each calculator — dock hidden. 4) Open keyboard anywhere — dock hides, returns on dismiss. 5) Open a picker and an alert — dock hidden. 6) Android hardware Back at each level. 7) Set system to Dark with app on System — native chrome follows. 8) Tablet — dock centred, ≤500 pt. 9) 320 pt phone — safe areas correct. 10) Low-end Android — blur falls back to solid without jank.

**Acceptance criteria.** Four tabs stable; repeat-tap scroll-top; dock hides per matrix including keyboard; Android Back matrix green; VO tablist semantics; **zero scene animation**; `userInterfaceStyle: "automatic"` with correct system bars in all six themes.

**Rollback risks.** Overlay z-order in `Screen.tsx` is delicate (audit §8). Keyboard listeners can leak. `userInterfaceStyle` change affects native chrome globally — verify on both platforms before checkpoint.

**Checkpoint.** `checkpoint: design 5.1 wave 2 navigation shell and visibility matrix` *(design tag: `design5-w2-nav`)*

---

## Wave 3 — Canonical Add architecture

**Scope.** Six-action tray; `More` → catalogue; origin metadata; Back/Cancel/Save matrix; fourteen shared task workspaces; nested handoffs; dirty drafts; transfer-draft parking.

**Exact intended files.** `src/components/navigation/quickActions.ts` (rewrite to 6); `QuickActionsTray.tsx` (3×2 + More tile + 2×3 reflow); `addWorkspaceTransitionController.ts` (**origin-seeded `returnStack`; change the `?? ['chooser']` default at line 132**); `AddAnythingSheet.tsx` (origin metadata through `beginForwardTransition` line 787; transfer parking at lines 536/559/676/740; catalogue grouping and labels); `src/components/shared/KeyboardSheet.tsx` (breadcrumb slot); unwire `askNolie.ts` / `AskLuluSheet.tsx` from the tray.

**Explicit non-goals.** **No field visuals (W4).** No form-body logic change. **No change to transfer eligibility or financial effects.** No change to the five-phase machine.

**Dependencies.** W2.

**Migration strategy.** Land in three reviewable commits: (a) six-tile config + tray layout; (b) origin metadata + return-stack seeding; (c) transfer parking. Each commit keeps the suite green.

**Tests.**
- *Unit/structural:* six-tile config and resolutions; return-stack seeding for all four origins; nested handoff still unwinds one genuine step; `Exclude<..., 'transfer'>` removal does not break draft typing.
- *Rendered:* quick origin renders **no Back control at all**; catalogue origin renders the chevron and returns with the draft parked + DRAFT badge; Cancel is journey-level in both.
- *Existing suites that must stay green:* `add-anything-sheet-discard-orchestration`, `add-anything-sheet-full-workspace`, `add-workspace-transition-controller`, `nested-loan-handoff-back`, `parked-draft-and-repayment-ux`, `embedded-destinations-wiring`, `floating-add-transition`, `add-asset-transition-controller`.
- *New:* transfer draft parked on Back; transfer draft discarded on dirty Cancel with guard.

**Financial regression.** `transfer-funds-wiring`, `move-money-architecture-correction`, `bnpl`, `everyday-account-*`, `income-destination-and-scoped-balances`, `linked-repayment-persistence`, `repayment-prefill`, `discard-warning-and-repayment-schedule`, `money-parsing` — **all must be byte-identical in outcome.**

**Device test script (iOS + Android, both required).** 1) `+` → Record spending → **Back is absent**; Cancel returns to origin. 2) `+` → More → Record spending → Back returns to catalogue with DRAFT badge. 3) Same, Cancel → closes whole journey to origin with discard guard when dirty. 4) Transactions → Record spending → Back/Cancel/Save all return to Transactions, no catalogue chrome. 5) Add bill → linked loan → linked card; Back unwinds one step at a time; Save commits atomically. 6) `+` → Move money → enter amount → Back → reopen: **draft preserved**. 7) **Rapid-tap stress:** hammer `+` and tiles; first wins, rest ignored. 8) **Back mid-close:** Android Back during `closingForAction` completes the close and does **not** open the workspace. 9) Double-tap Save → lands on disabled Saving. 10) Backdrop tap during `workspaceIn` → single queued Cancel. 11) Interrupt with a call/notification mid-transition.

**Acceptance criteria.** Full journey matrix green including quick-origin Back to origin; **phase tests unchanged and passing**; dirty-draft tests green; transfer parking verified; rapid-tap device stress clean on both platforms; **no reachable state mounts two native modals**.

**Rollback risks.** **This is the freeze-regression wave.** The phase machine is preserved verbatim and no timing coordination is introduced. If any device stress step fails, roll back the whole wave rather than patching timing.

**Checkpoint.** `checkpoint: design 5.1 wave 3 origin-aware add architecture and six-action tray` *(design tag: `design5-w3-add`)*

---

## Wave 4 — Shared component system

**Scope.** Buttons, fields, rows, cards, financial figures, sheets, pickers, empty/error/success states, disclosures, confirmations. Migrate the 7 form bodies onto the new field primitives.

**Exact intended files.** New `src/components/shared/fields/*` (Text, Currency, PickerTrigger), `src/components/shared/rows/*`, `src/components/shared/Chip.tsx`, `Segmented.tsx`, `Toast.tsx`, `Disclosure.tsx`, `FinancialFigure.tsx`. Extend `Button.tsx`, `SectionCard.tsx`, `EmptyState.tsx`, `ProgressBar.tsx`, `MetricCard.tsx`. Consolidate `InfoSheet.tsx` / `OptionsSheet.tsx` / `DatePickerModal.tsx`. Migrate `QuickAddModal`, `AddIncomeModal`, `AddRecurringItemModal`, `AddWealthItemModal`, `AddCreditCardModal`, `AddGoalModal`, `TransferForm`.

**Explicit non-goals.** No screen recomposition. **No validator, recurrence, balance-effect or repayment logic changed — validators are reused untouched.**

**Dependencies.** W3.

**Migration strategy.** Build primitives with their full state matrix first and prove them in isolation; migrate one form component per commit, running that form’s existing tests each time. **Formalise the body-vs-container contract** so bodies never own presentation.

**Tests.** Component state matrix (default/pressed/focused/selected/disabled/loading/error) across six themes; a11y role on **every** control (no bare `TouchableOpacity`); **strict money grammar unchanged** via existing `money-parsing.test.ts`; error line is reserved so layout never jumps.

**Financial regression.** All form-related suites: `goal-target-amount`, `goal-allocation`, `add-income-source-helper-copy`, `everyday-account-provider-and-select-balances`, `transaction-deletion-and-tracked-balance-copy`, `safe-to-spend-*`, `bnpl`, `repayment-prefill`.

**Device test script.** 1) Every field type with software and hardware keyboard. 2) Currency field: type `189.001` → message in words on blur, no shake, no jump. 3) Save pinned above keyboard in every task. 4) Chips/segmented/toggles at 44 pt. 5) Six themes on one representative form. 6) Thai on the 26 translated strings + Language screen.

**Acceptance criteria.** Component matrix complete across six themes; a11y roles on every control; money grammar unchanged; no validation regressions.

**Rollback risks.** Validation regressions are the main hazard — mitigated by reusing validators verbatim and migrating one form per commit.

**Checkpoint.** `checkpoint: design 5.1 wave 4 shared component and field system` *(design tag: `design5-w4-components`)*

---

## Wave 5 — Today

**Scope.** Briefing hierarchy (hero, max 2 priority rows), journey snapshot, August so far, Worth Knowing (max 1), goal, interim Score containment as a footnote row.

**Exact intended files.** `src/screens/today/TodayScreen.tsx`; `src/components/today/*` (`TodayBriefingCard`, `BriefingTileRow`, `TodayJourneySnapshotCard`, `MonthSnapshotCard`, `WorthKnowingCard`, `ScoreChip`, `SmartReminderCard`, `ReminderDetailSheet`, `FinancialStateCard`, `ProfileNudgeCard`, `MoneyPictureChecklistCard`, `SavingFactsCard`, `LuluCheckInCard`, `LuluRecommendationCard`, `LoanBalanceReminderCard`).

**Explicit non-goals.** No engine change — `safeToSpend.ts`, `todayBriefing.ts`, `worthKnowing.ts`, `reminders.ts`, `achievements.ts`, `monthlySummary.ts`, `luluScore.ts` are read-only. No Money/Wealth/Grow change.

**Dependencies.** W4.

**Migration strategy.** Compose the new hierarchy from existing calculation outputs; delete no engine. Cards not in the p.7 hierarchy become contextual extras or are removed from the default composition — **not deleted from the codebase** in this wave.

**Tests.** Priority rule (overdue > bill ≤3d > unresolved reminder > next income); **max 2 priority rows**; **max 1 Worth Knowing**; setup state names the exact missing input and **never renders $0** (invariant 10); Score footnote renders “interim · based on what you’ve recorded”; invalid score → “Not enough recorded yet” (invariant 16).

**Financial regression.** `today-briefing`, `worth-knowing`, `pass-2b-*`, `pass-2d-today-grow-hierarchy`, `reminder-*`, and all rendered Today/reminder suites.

**Device test script.** 1) Fresh install → setup state, no fabricated zeros. 2) Partial data → exclusions attributed to the customer. 3) Full data → briefing figure matches Money exactly. 4) Tap a priority row → MoneyDetail scrolls to and tints the event, focus lands on the row. 5) Six themes. 6) 200% Dynamic Type. 7) VoiceOver spoken order matches doc A p.7.

**Acceptance criteria.** Setup/partial/full datasets correct; priority rules enforced; focus-reveal into MoneyDetail works; no fabricated zeros; Score contained as a footnote.

**Rollback risks.** Today has the densest conditional composition; removing a card from default composition may hide a state the audit recorded as present. Verify against the audit §12 state matrix row for Today before checkpoint.

**Checkpoint.** `checkpoint: design 5.1 wave 5 today briefing hierarchy` *(design tag: `design5-w5-today`)*

---

## Wave 6 — Money

**Scope.** Available Until Payday hero + payday bar; timeline (“What happens next”); Money Flow; Money Plan; **Sources sheet replacing the This Month flip**; included-balances row. Each measure carries a one-line definition.

**Exact intended files.** `src/screens/money/MoneyScreen.tsx`; `src/components/money/SafeToSpendHero.tsx`, `MoneyTimelineCard.tsx`, `MoneyPlanCard.tsx`, `ThisMonthCard.tsx` (**retire flip**), `ThisMonthSourcesSheet.tsx`, `SelectBalancesSheet.tsx`, `MoneyFlowCategoryDetailSheet.tsx`, `SavingsAllocationDetailSheet.tsx`. **Rewrite `tests/this-month-flip-card.test.ts`.**

**Explicit non-goals.** No engine change — `safeToSpend`, `moneyPlan`, `moneyTimeline`, `monthlySummary`, `moneyFlowBreakdown`, `repaymentAccounting`, `savingsAllocation` are read-only. Presentation only.

**Dependencies.** W5.

**Migration strategy.** Move flip content into `ThisMonthSourcesSheet` **first**, verify parity, then remove the flip mechanics. Rewrite the flip test to assert the sheet route in the same commit that removes the flip.

**Tests.** Every figure reconciles **1:1** with its engine on seeded datasets; repayments shown separately (invariant 7); Money Plan labelled “forecast preference, not proof” (invariant 11); exclusion changes availability, **not net worth** (invariant 3); estimated rows labelled; invalid → “Not enough recorded yet”; timeline row tap opens contextual-origin edit and returns to Money.

**Financial regression.** `safe-to-spend-calendar-and-invalid-data`, `safe-to-spend-closure-corrections`, `safe-to-spend-final-closure`, `everyday-account-*`, `move-money-architecture-correction`, `income-destination-and-scoped-balances`, `transfer-funds-wiring`, `this-month-flip-card` (rewritten).

**Device test script.** 1) Compare each Money figure against the same figure on Today. 2) Payday bar dates match the engine forecast. 3) Open Sources sheet — content matches the retired flip exactly. 4) Toggle an included balance — availability changes, net worth on Wealth does **not**. 5) Tap a timeline row → edit → Back, Cancel and Save each return to Money. 6) Reduced Motion on — sheet still opens, all content reachable. 7) Six themes.

**Acceptance criteria.** Figures reconcile 1:1 with engines; freshness lines present; estimate labels present; Sources sheet reaches parity with the retired flip; flip test rewritten, not deleted.

**Rollback risks.** Retiring the flip removes a discoverable surface — the Sources sheet must be reachable from an obvious control before the flip goes. Conflating measures is the audit’s D5-012 risk; definitions must ship with the layout, not after.

**Checkpoint.** `checkpoint: design 5.1 wave 6 money measures and sources sheet` *(design tag: `design5-w6-money`)*

---

## Wave 7 — Wealth

**Scope.** Net worth hero + spoken formula; own/owe bar; accessible-now + retirement line with Definitions sheet; progress row; What you own / What you owe with staged disclosure; per-row recorded dates; detail sheets with Edit / Move money / Delete.

**Exact intended files.** `src/screens/wealth/WealthScreen.tsx`; `src/components/wealth/MoneyEngineCard.tsx`, `PortfolioInsightCard.tsx`, `YourFutureCard.tsx`, `WealthGuideSteps.tsx`, `TransferModal.tsx`. Copy touch in `src/lib/calculations/wealthDefinitions.ts` **comments/labels only** — `RETIREMENT_LABEL` may change; **no function body changes**.

**Explicit non-goals.** **No net-worth mathematics changed** (verified identical, §A.6). No card-sync change (invariant 4), no reversal change (6), no transfer eligibility change (13), no linked-debt blocking change (14). **Stale trigger stays OFF.**

**Dependencies.** W6.

**Migration strategy.** Rename the hero label and add the formula line as a **standalone commit** with a test asserting the rendered value is unchanged — so the rename is provably copy-only. Then restructure.

**Tests.** Net-worth value unchanged before/after rename; “what you own minus what you owe” figures equal `totalAssets` / `totalLiabilities`; accessible-now and retirement never summed into a third number; per-row “Recorded [date]”; **stale visual exists but its trigger is off by default**; linked repayments named on the row.

**Financial regression.** All wealth and transfer suites; `linked-repayment-persistence`; `everyday-account-integrity-correction`; `everyday-account-phantom-credit-correction`.

**Device test script.** 1) Net worth figure identical to pre-wave build. 2) Own/owe values reconcile with the hero. 3) Row detail → Edit / Move money / Delete each behave as before. 4) Delete a linked record → consequences explained before the alert. 5) Recorded dates on every manual balance. 6) Confirm **no** stale warning appears by default. 7) Six themes.

**Acceptance criteria.** Net-worth tests untouched and green; stale treatment present but inactive; linked repayment naming correct; staged disclosure works.

**Rollback risks.** The rename is the single highest-visibility copy change in the package; if any figure moves, roll back immediately — that would mean a calculation was touched.

**Checkpoint.** `checkpoint: design 5.1 wave 7 wealth net worth naming and staged disclosure` *(design tag: `design5-w7-wealth`)*

---

## Wave 8 — Grow

**Scope.** Journey hero; Goals row; **one** opportunity slot with stated trigger; Tools (4 tiles); Learn; interim Score footnote; **Market Pulse removed**.

**Exact intended files.** `src/screens/discover/DiscoverScreen.tsx`; `src/components/discover/WealthJourneyCard.tsx`, `MoneyOpportunitiesHero.tsx`, `LearningCardItem.tsx`, `LearningPathCard.tsx`, `ExploreCategorySection.tsx` (**removed from composition**), `FutureYouCard.tsx`, `MarketPulsePreview.tsx` (**unwired**); `src/components/health/ScoreExplanationSheet.tsx`, `OpportunityCard.tsx`, `JourneyTimeline.tsx`; `src/components/debt/DebtCoachSheet.tsx` (**restyle only — copy blocked**).

**Explicit non-goals.** **No new debt-coach or Grow opportunity wording** (register row BLOCKED — keep existing production copy). No unlock-selector change. No Score formula, gate, category or history change.

**Dependencies.** W7.

**Migration strategy.** Unwire Market Pulse rather than deleting the component, pending the defer-or-source decision (D5-022). Restyle `DebtCoachSheet` while leaving its strings byte-identical.

**Tests.** Unlock selectors unchanged; standing disclaimer footer present; **at most one opportunity card**; opportunity states its trigger; Score row reads “interim · based on what you’ve recorded · not a credit score”; invalid Score → “Not enough recorded yet”; **structural test: Market Pulse not imported by `DiscoverScreen`**; **structural test: debt-coach strings unchanged from baseline**.

**Financial regression.** `pass-2b-score-journey`, `pass-2c-score-journey-reorg`, `pass-2c-score-safety-correction`, `pass-2d-today-grow-hierarchy`, `grow-tab-navigation.render.test.tsx`.

**Device test script.** 1) Grow scrolls in a fraction of its former length. 2) Score row is quiet, never a hero. 3) Explain sheet opens restyled with factors as recorded facts. 4) Opportunity appears only when its existing rule fires. 5) Four tool tiles route correctly, Home loan repayments renamed. 6) Market Pulse absent everywhere. 7) Six themes.

**Acceptance criteria.** Unlock selectors unchanged; disclaimer footer present; interim badges correct; Market Pulse gone; **blocked copy unchanged**.

**Rollback risks.** Accidentally shipping reframed compliance copy is the main hazard — the structural string test is the guard.

**Checkpoint.** `checkpoint: design 5.1 wave 8 grow restructure and score containment` *(design tag: `design5-w8-grow`)*

---

## Wave 9 — Secondary screens and Settings

**Scope.** Settings + Appearance; Language; Reset Nolie; Goals; Cards; Transactions; the four calculators; onboarding rebuild; other pushed details.

**Exact intended files.** `src/screens/settings/SettingsScreen.tsx`, `LanguageScreen.tsx`, `ResetLuluScreen.tsx`; `src/screens/goals/GoalsScreen.tsx`; `src/screens/cards/CardsScreen.tsx` (**remove “Credit health {n}/100”, line 128**); `src/screens/transactions/TransactionsScreen.tsx`; `src/screens/discover/HomeLoanCalculatorScreen.tsx`, `CompoundCalculatorScreen.tsx`, `EmergencyFundScreen.tsx` (**line 113 copy**), `SavingsComparisonScreen.tsx`; `src/screens/welcome/WelcomeFlow.tsx` (**remove “AI Financial Coach”, line 21; Skip → step 6**); `src/components/settings/EditProfileModal.tsx`, `src/components/goals/GoalDetailSheet.tsx`; `DiscoverScreen.tsx:847,854` (calculator entry label).

**Explicit non-goals.** **Onboarding disclosure wording is preserved verbatim** (legal-blocked) — structure and layout only. No reset-guard behaviour change. No calculator formula change.

**Dependencies.** W8.

**Migration strategy.** Onboarding is the riskiest item: rebuild the step machine so **every** Skip routes to step 6, keep the existing atomic profile+consent write, and add the failure-holds-on-step-6 path. Land onboarding as its own commit within the wave.

**Tests.** Skip from steps 3, 4 and 5 each land on step 6; **step 6 has no Skip and its CTA is disabled until ticked**; consent write is atomic; write failure keeps the user on step 6 with banner + Retry; disclosure exposes checkbox role **with state**; tiles expose radio role; “AI Financial Coach” absent; “Credit health” absent; “Can I buy a home?” absent; emergency-fund guideline copy replaced; calculators show a message, not zero, on malformed input.

**Financial regression.** Full suite. Calculators: `compoundCalculator.ts`, `homeLoanCalculator.ts`, `emergencyFund.ts` untouched.

**Device test script.** 1) Fresh install → complete onboarding; try Skip at each skippable step → always lands on disclosure. 2) Try to pass step 6 without ticking → blocked. 3) Force a write failure → held on step 6 with Retry. 4) Settings → Appearance → all six combinations apply instantly. 5) Language → Thai → applies immediately, fonts switch. 6) Reset Nolie → guarded flow → returns to Welcome. 7) Each calculator with malformed input. 8) Cards — no credit-health language.

**Acceptance criteria.** Skip→disclosure enforced; consent atomic; approved copy rows implemented; blocked rows unchanged; reset guard intact.

**Rollback risks.** Onboarding touches consent — a defect here is a compliance issue, not just a UX one. If the atomicity test cannot be made deterministic, do not ship the onboarding portion.

**Checkpoint.** `checkpoint: design 5.1 wave 9 secondary screens settings and onboarding` *(design tag: `design5-w9-secondary`)*

---

## Wave 10 — Motion and polish

**Scope.** Apply the doc-C motion tokens by name; haptics (four events only); calm Save feedback; celebration tiers; Reduced Motion parity; figure-change guards; **flip removal completed**.

**Exact intended files.** New `src/theme/motion.ts` (named constants from `Nolie_Design_5_Motion_Accessibility.md`); `src/hooks/useReduceMotion.ts` (**make it the single RM source**); `src/components/shared/OptionsSheet.tsx` (**add RM consumption**), `CircularScore.tsx` (**add RM or confirm unused**); `src/components/money/ThisMonthCard.tsx` (**replace the local `AccessibilityInfo` pattern with the shared hook**); `src/components/celebrations/*`; `src/lib/celebrations.ts`.

**Explicit non-goals.** No layout change. No new animation not in doc C. **No behaviour may depend on an animation having run.**

**Dependencies.** W9.

**Migration strategy.** Introduce named motion constants first and replace raw millisecond literals mechanically; then consolidate the three reduce-motion patterns onto one hook; then tune.

**Tests.** Every component references motion by token name, never a raw ms literal (structural); RM parity — all 14 tasks completable with identical information; figures animate **only** on changed engine results; no haptic on scroll, tab taps, number changes, score movement or toast echo; celebration queued one at a time.

**Financial regression.** Full suite; `briefing-motion-*.render.test.tsx`, `use-reduce-motion.render.test.tsx`.

**Device test script.** 1) RM off → full choreography walkthrough. 2) **RM on → repeat every step; all 14 tasks completable.** 3) 60 fps trace on save and settle sequences. 4) Revisit a screen — unchanged figures stay static. 5) Confirm exactly one haptic per save, shared with any celebration. 6) Tab switch — no scene animation, no blank frame.

**Acceptance criteria.** RM parity walkthrough complete; no replay on unrelated state updates; 60 fps on save/settle; four haptic events only.

**Rollback risks.** Motion tuning can mask state bugs. The construction rule — nothing depends on an animation having run — is the guard; verify by running the whole app in RM.

**Checkpoint.** `checkpoint: design 5.1 wave 10 motion tokens haptics and reduced motion parity` *(design tag: `design5-w10-motion`)*

---

## Wave 11 — Accessibility and device verification

**Scope.** Focus-helper consolidation; spoken-string templates; Dynamic Type audit; Thai pass (scope-limited per C-6); keyboard; Android Back; small phones; tablets; all six themes; persistence interruption; modal stress testing.

**Exact intended files.** Consolidate `src/lib/a11yFocus.ts` + `src/lib/accessibilityFocus.ts` into one module and update the 5 consumers (`AddAnythingSheet`, `FloatingAddButton`, `QuickActionsTray`, `ReminderDetailSheet`, `TodayScreen`). Spoken-string helpers for financial values. Targeted a11y fixes found during audit.

**Explicit non-goals.** No visual change beyond a11y-required fixes. No new features.

**Dependencies.** W10.

**Migration strategy.** Consolidate focus helpers (48 lines, 5 consumers — small and safe) in one commit, then run the audit and fix findings in separate commits.

**Tests.** Spoken strings match the doc-C templates verbatim on sampled screens; touch-target audit ≥44 pt; contrast floors in all six themes; persistence-failure announcement is assertive; onboarding checkbox/radio semantics verified.

**Financial regression.** **Full legacy suite (50) + full rendered suite (15) must pass.**

**Device test script (the sign-off gate, D5-028).** 1) VoiceOver full journey tray → workspace → save → toast, **zero hidden-layer stops**, focus restored to `+`. 2) TalkBack equivalent. 3) Every screen at 200% type — no lost amounts or dates, Save visible with keyboard. 4) All 14 tasks in Reduced Motion. 5) Android Back matrix (tray / step / workspace root / root tab). 6) 44 pt audit tool clean. 7) 320 pt phone. 8) Tablet — dock ≤500 pt centred, content ≤560 pt. 9) Six-theme recordings including pickers and system bars. 10) Thai pass **limited to the 26 translated strings + Language screen** (C-6). 11) Persistence failure interrupted mid-save — entry preserved, assertive announcement heard. 12) Modal stress repeat of the W3 script.

**Acceptance criteria.** Doc C p.4 checklist green **except** criterion 10 (Thai expansion), which is formally descoped per C-6 with owner sign-off; legacy + rendered suites pass; device matrix signed.

**Rollback risks.** Focus-helper consolidation can silently break focus restoration — the VoiceOver journey test is the guard.

**Checkpoint.** `checkpoint: design 5.1 wave 11 accessibility consolidation and device verification` *(design tag: `design5-w11-a11y`)*

---

# F. Testing strategy

## F.1 Available commands

```bash
npm run test:all
```

Individually: `npm run test:legacy` (50 tsx files), `npm run test:render` (15 RNTL suites).

**There is no `typecheck` script.** Add one, or run:

```bash
npx tsc --noEmit
```

Expo health check:

```bash
npx expo-doctor
```

Export verification:

```bash
npx expo export --platform ios --platform android
```

## F.2 What must pass before and after every wave

| Check | Before wave | After wave |
|---|---|---|
| `npx tsc --noEmit` | ✅ clean | ✅ clean |
| `npm run test:legacy` (50) | ✅ all pass | ✅ all pass |
| `npm run test:render` (15) | ✅ all pass | ✅ all pass |
| `npx expo-doctor` | ✅ record baseline | ✅ no new issue |
| `npx expo export` | W1, W2, W9, W11 only | same |
| Financial calculation non-regression | ✅ | ✅ **byte-identical outcomes** |
| `git diff --stat` reviewed against the wave’s declared file list | — | ✅ only intended files |
| Device script for that wave | — | ✅ owner-run, before checkpoint |

**Rule: a wave is not complete until the owner’s device test passes.** Automated tests are separate evidence from device evidence and never substitute for it.

## F.3 New test classes this programme introduces

| Class | Purpose | Introduced |
|---|---|---|
| Theme matrix tests | Every semantic role resolves in all six combinations | W1 |
| Contrast tests | Computed ratios assert doc-A floors (satisfies C-4) | W1 |
| Raw-colour ban | No hex/`rgba()` outside `src/theme/` | W1 |
| Typography/locale tests | Role sizes; Thai metrics; font-failure fallback | W1 |
| Visibility-matrix tests | Route × keyboard × overlay → dock visible/hidden | W2 |
| Origin-navigation tests | All four origins × Back/Cancel/Save | W3 |
| Modal-phase invariants | **Existing** `floating-add-transition.test.ts` — must not change | W3 (guard) |
| Rapid-tap / double-submit | First-wins; second Save tap lands on disabled | W3, W4 |
| Dirty-draft tests | Including the new transfer parking | W3 |
| Component state matrix | Variants × states × six themes | W4 |
| Structural copy guards | Blocked compliance strings unchanged; removed strings absent | W8, W9 |
| Motion-token structural test | No raw ms literals in components | W10 |
| Spoken-string tests | Templates matched verbatim | W11 |

## F.4 Financial non-regression discipline

The 50 legacy suites are the financial contract. For every wave:

1. Capture outcomes **before** the wave.
2. Re-run after.
3. **Any diff in a financial outcome is a stop-the-wave event**, not a test to update.

Test files may only be edited when the *presentation* they assert has legitimately changed (e.g. `this-month-flip-card.test.ts` in W6, which is a Class-C structural test asserting flip wiring in source). A test asserting a *financial* outcome is never edited to accommodate a change.

## F.5 Device testing

Physical iOS **and** Android required for W2, W3, W6, W10, W11 (W3 and W11 are mandatory stress gates). Simulator is acceptable for W1, W4, W5, W7, W8, W9 provided W11 re-covers them.

---

# G. Risk register

| ID | Risk | Sev | Trigger | Affected behaviour | Prevention | Detection | Rollback |
|---|---|---|---|---|---|---|---|
| **R-1** | **Modal freeze regression** | **Critical** | W3 tray/workspace work; any reintroduction of stacked native modals or timeout coordination | Total app lockup — invisible touch-intercepting layer | Phase machine preserved **verbatim**; tray stays a plain overlay; workspace mounts only on `onClosed`; `floatingAddTransition.ts` is a no-edit file in W3 | `floating-add-transition.test.ts`; W3 device stress steps 7–11 (rapid tap, Back mid-close, interruption) | Revert the whole W3 checkpoint. **Do not patch timing** |
| **R-2** | **Financial calculation change** | **Critical** | Any wave touching a screen that reads an engine | Wrong money shown or stored | Engines are read-only in every wave; never combine calculation refactor with visual work | 50 legacy suites; 1:1 engine reconciliation in W6; net-worth identity test in W7 | Revert to previous checkpoint; re-run full suite |
| **R-3** | **Data loss / reversal error** | **Critical** | W3 transfer parking; W4 form migration; W9 onboarding consent | Balances not reversed exactly; consent lost | Reuse validators and reversal logic untouched; transfer parking uses the **existing** parked-draft mechanism, no new persistence | `transaction-deletion-and-tracked-balance-copy`, `linked-repayment-persistence`, `everyday-account-integrity-correction`; consent atomicity test | Revert wave; verify AsyncStorage integrity on a device |
| **R-4** | **Navigation context loss** | High | W2 visibility matrix; W3 origin seeding; `Screen.tsx` overlay z-order | User stranded, or catalogue revealed from a quick action | Pure testable matrix function; exhaustive origin tests | Origin-navigation tests; W3 device steps 1–5 | Revert to `['chooser']` default temporarily — restores old behaviour, keeps the app usable |
| **R-5** | **Theme contrast failure** | High | W1 token rebuild; retiring `contrastOverrides.ts` | Unreadable text, especially Sunrise and gradient scrims | Retire overrides **only after** the computed contrast test passes | Automated contrast test across six themes; device recordings | Reinstate `contrastOverrides.ts` |
| **R-6** | **Font-loading failure** | High | W1 | App blocked at splash, or Thai renders as tofu | **Never block launch on fonts**; fall back to platform default per locale and log; Figtree never applied to Thai | Font-failure test; device script step 3 | Ship tokens-only; defer typography |
| **R-7** | **Thai clipping / overflow** | Medium | W1 metrics; W4 controls | Clipped buttons, truncated money | Fixed control heights, +2 pt button padding, 60 pt fields, 28 pt chips, wrap before shrinking below 11 pt, no uppercase transforms | Thai pass — **but only 26 strings exist (C-6)**; residual risk accepted and recorded | Adjust Thai metric constants only |
| **R-8** | **Keyboard lock / Save unreachable** | High | W2 keyboard listeners; W4 pinned Save | User cannot complete a task | Save pinned above keyboard in every task; dock hides on keyboard; sheet resizes with the native curve | W2 device step 4; W4 device steps 1–3 | Revert the shell change |
| **R-9** | **Dynamic Type overflow** | Medium | W1 caps; W5–W9 layouts | Lost amounts or dates | Figures cap 1.6×, titles 1.8×, body unlimited with reflow; **amounts, dates and disambiguating labels never truncate** — rows grow | 200% device pass each wave; W11 criterion 2 | Adjust caps; never reintroduce truncation on money |
| **R-10** | **Accessibility focus loss** | High | W11 focus-helper consolidation | VoiceOver strands the user on a hidden layer | 48-line consolidation in one isolated commit; inactive layers keep `accessibilityElementsHidden` | W11 device steps 1–2 | Revert the consolidation commit only |
| **R-11** | **Persistence failure handling regression** | High | W9 onboarding; W4 save states | Silent pass-through on failed consent write; lost entry | Failure keeps the workspace open with entry preserved; onboarding failure holds on step 6 | Persistence-failure tests; W9 device step 3; W11 step 11 | Revert wave |
| **R-12** | **Score / compliance copy drift** | High | W8 Grow; W9 secondary | Shipping BLOCKED wording; implying advice, eligibility or a credit score | Register is the gate: implement **only** APPROVED / PRESERVE-EXISTING; structural test pins blocked strings to baseline | Structural copy guards; compliance review before W8 checkpoint | Revert the copy commit |
| **R-13** | **Large-diff review failure** | Medium | W1 token rename (broad); W4 component migration | A regression hides inside an unreviewable diff | Additive-then-delete in W1; one form per commit in W4; three commits in W3; **never combine waves** | `git diff --stat` reviewed against each wave’s declared file list | Split the wave and re-land |
| **R-14** | **Icon-library churn** | Medium | Adopting Lucide (C-1) | 83-file diff, unreviewable, unrelated to design intent | **Recommendation: do not adopt Lucide during W1–W9**; map stroke/size tokens onto Ionicons | Diff size review | Keep Ionicons |

---

# H. Recommended first implementation wave

**Wave 1 — Foundations and tokens. Do not implement in this task.**

## H.1 Files expected to change

**Modified**
- `src/theme/tokens.ts` — rebuild to Design 5.1 semantic roles
- `src/theme/palettes.ts` — three styles → `styleScoped` (ambient / featured / heroSurface only)
- `src/theme/ThemeContext.tsx` — six-combination resolution + font-family token
- `App.tsx` — `useFonts`, splash hold, non-blocking failure fallback
- `package.json` — **exactly two additions**: `@expo-google-fonts/figtree`, `@expo-google-fonts/noto-sans-thai` (+ `package-lock.json`)
- Colour migration, 12 files: `src/screens/welcome/WelcomeFlow.tsx`, `src/screens/wealth/WealthScreen.tsx`, `src/screens/discover/CompoundCalculatorScreen.tsx`, `HomeLoanCalculatorScreen.tsx`, `EmergencyFundScreen.tsx`, `src/components/money/SafeToSpendHero.tsx`, `src/components/discover/MoneyOpportunitiesHero.tsx`, `src/components/celebrations/BigCelebrationOverlay.tsx`, `MediumCelebrationSheet.tsx`, `src/navigation/MainTabNavigator.tsx`, `src/components/shared/KeyboardSheet.tsx`, `src/theme/contrastOverrides.ts` (retire last)

**Added**
- `src/theme/typography.ts`, `src/theme/fonts.ts`
- `tests/design5-tokens.test.ts`, `tests/design5-contrast.test.ts`, `tests/design5-no-raw-color.test.ts`
- `tests/rendered/design5-typography.render.test.tsx`

## H.2 Files that must NOT change

- `src/lib/calculations/**` — **all 66 files**
- `src/state/AppStateContext.tsx`, `CelebrationContext.tsx`, `SavingsAllocationPromptContext.tsx`
- `src/types/models.ts`, `src/lib/storage.ts`, `src/lib/persistenceState.ts`
- `src/components/navigation/**` — the entire Add/tray/phase surface (W2/W3 territory)
- `src/navigation/RootNavigator.tsx`, `floatingNavGeometry.ts`, `floatingTrayRef.ts`, `tabScrollRefs.ts`
- `app.json` — **`userInterfaceStyle` stays `"light"` until W2**
- All 50 existing `tests/*.test.ts` and 15 `tests/rendered/*` — none edited in W1
- `src/i18n/**` — no new strings in W1

## H.3 Tests required

- `npx tsc --noEmit` clean
- `npm run test:legacy` — 50/50 pass, **zero outcome diffs**
- `npm run test:render` — 15/15 pass
- `npx expo-doctor` — no new issue vs baseline
- `npx expo export --platform ios --platform android` — succeeds
- New: token resolution across six combinations; computed contrast asserts doc-A floors (incl. the five quoted pairs); no hex/`rgba()` outside `src/theme/`; type roles; Thai metrics; font-failure fallback

## H.4 Device verification

1. Cold launch iOS — Figtree renders, no splash hang.
2. Cold launch Android — same.
3. Simulated font-load failure — app launches on platform font, logs, does not block.
4. Switch to Thai — Noto Sans Thai renders; digits remain Figtree tabular.
5. All six theme combinations — no unstyled flash, no contrast failure (spot-check Sunrise light warning chips and gradient scrim text).
6. Dynamic Type 100% / 200% — figures cap at 1.6×, titles 1.8×, body reflows; no truncated amount or date.
7. Confirm **no** screen layout, navigation or Add behaviour changed.

## H.5 Proposed checkpoint

```
checkpoint: design 5.1 wave 1 semantic tokens and locale typography foundation
```

*(Design package tag for traceability: `design5-w1-tokens`.)*

## H.6 Blockers to resolve before Wave 1 starts

| Blocker | Owner | Needed |
|---|---|---|
| **C-5** — approve `@expo-google-fonts/figtree` + `@expo-google-fonts/noto-sans-thai` | Owner | Explicit dependency approval; this is the only dependency change in W1 |
| **C-7** — Expo v54 (installed) vs v57 (`AGENTS.md`) | Owner | Confirm which is authoritative before installing anything |
| **C-1** — Lucide vs Ionicons | Product + Engineering | Decide. **Recommendation: keep Ionicons through W9**; treat Lucide as visual reference |
| **C-3** — Tokens.json `§components` matrix absent | Claude Design *or* accept derivation | **Recommendation: derive in W1** and record the deviation; no need to block |
| **C-4** — contrast table absent | Engineering | Compute in W1; no external dependency |

## H.7 Must go back to Claude Design

**One genuine request:**

- **C-2 — the four custom tab glyph paths** (`today-sunrise`, `money-currents`, `wealth-contour`, `grow-sprout`). Doc B p.3 and `Tokens.json:icons.customTabGlyphs` both state the paths are “supplied in the handoff”; **they are not present anywhere in the package.** Needed for W2, not W1 — so this does not block starting.

**Two optional clarifications** (both have sound local workarounds, so neither need block the programme):

- **C-3** — the promised per-component `§components` resolved value matrix.
- **C-8** — the promised per-screen 320/360/768 responsive enumeration in `Screen_Specifications.md §Responsive`.

**One decision for the product owner rather than Claude Design:**

- **C-6** — Design 5.1's Thai acceptance criteria assume a translated product; the app has 26 Thai strings across 3 screens. Descope Thai verification for Design 5.1, or commission localisation as a separate workstream.

---

## Change control

This plan covers presentation, navigation, states, copy (approved rows only) and motion. It changes **no** calculation, engine, data model, persistence rule or compliance boundary. All 20 functional invariants from audit §14 are preserved unchanged throughout all eleven waves.

Waves are not to be combined. Each wave ends with a reviewable diff, a passing full test suite, an owner-run device test, and a checkpoint commit — in that order.
