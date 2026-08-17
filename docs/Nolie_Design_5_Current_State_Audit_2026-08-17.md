# Nolie Design 5 — Current-State Product, UX and Implementation Audit

**Audit date:** 17 August 2026

**Status:** Design-discovery source of truth; no implementation authority

**Baseline:** `main` at `6f304e9ebbba0412b223dbf70051a1b26d9df177` — `checkpoint: stabilise floating navigation and quick-action foundation`

## Table of contents

1. [Report identity and baseline](#1-report-identity-and-baseline)
2. [Executive summary](#2-executive-summary)
3. [Nolie product definition](#3-nolie-product-definition)
4. [Current information architecture](#4-current-information-architecture)
5. [End-to-end customer journeys](#5-end-to-end-customer-journeys)
6. [Screen-by-screen inventory](#6-screen-by-screen-inventory)
7. [Add and quick-action architecture deep dive](#7-add-and-quick-action-architecture-deep-dive)
8. [Current design-system inventory](#8-current-design-system-inventory)
9. [Theme matrix](#9-theme-matrix)
10. [Motion, animation and interaction inventory](#10-motion-animation-and-interaction-inventory)
11. [Accessibility and responsive behaviour](#11-accessibility-and-responsive-behaviour)
12. [State-completeness matrix](#12-state-completeness-matrix)
13. [Copy, content and compliance review](#13-copy-content-and-compliance-review)
14. [Functional and data invariants](#14-functional-and-data-invariants)
15. [Reusable component assessment](#15-reusable-component-assessment)
16. [Findings register](#16-findings-register)
17. [Preserve, redesign, remove or defer matrix](#17-preserve-redesign-remove-or-defer-matrix)
18. [Design 5 gap analysis](#18-design-5-gap-analysis)
19. [Decisions required before visual design](#19-decisions-required-before-visual-design)
20. [Required Nolie Design 5 deliverables](#20-required-nolie-design-5-deliverables)
21. [Recommended implementation sequence](#21-recommended-implementation-sequence)
22. [Claude Design handoff brief](#22-claude-design-handoff-brief)
23. [Evidence appendix](#23-evidence-appendix)

## Evidence labels used in this report

- **Fact** — directly evidenced by the audited repository baseline.
- **Owner direction** — supplied for this audit; not inferred from the repository.
- **Inference** — a reasoned conclusion from repository evidence, not directly observed on a device.
- **Recommendation** — a proposed Design 5 action.
- **Open decision** — requires product/design approval before implementation.

---

## 1. Report identity and baseline

### Baseline and scope

| Item | Audited value |
|---|---|
| Repository root | `app/` (Git repository within the supplied workspace) |
| Product | Nolie mobile application; legacy repository/package identifiers include Lulu and Navilo |
| Branch | `main` |
| HEAD | `6f304e9ebbba0412b223dbf70051a1b26d9df177` |
| HEAD subject | `checkpoint: stabilise floating navigation and quick-action foundation` |
| Preflight worktree | Clean |
| Platform | Expo/React Native, portrait-first iOS/Android; tablet support declared for iOS; a web script exists |
| Core stack | Expo 54.0.35, React Native 0.81.5, React 19.1, React Navigation 7, TypeScript 5.9, AsyncStorage, i18next, SVG/chart tooling |
| Audit scope | Product definition, IA, every routed screen and significant overlay, data entry/edit/delete, states, calculations, design system, themes, motion, accessibility, copy/compliance, tests and relevant history |

**Fact.** `app.json` exposes the app name “Nolie,” portrait orientation, light `userInterfaceStyle`, iOS tablet support, Android icons and no remote-service configuration. `package.json` still names the package `lulu`. Customer-facing brand constants are Nolie (`src/lib/brand.ts:12-16`).

**Fact.** The baseline is the intended checkpoint: its subject explicitly identifies the stabilised floating-navigation and quick-action foundation, and its commit changes the floating dock, tray, phase machine, accessibility focus helpers and targeted tests.

### Evidence sources

The audit followed the requested priority:

1. Production routes, screens, state context, models, calculations, persistence and theme sources.
2. Customer-facing UI components and English/Thai localization files.
3. Legacy pure/structural tests and React Native Testing Library rendered tests.
4. `AGENTS.md`, `CLAUDE.md`, `tests/README.md`, package/app configuration and code-level product comments.
5. Git history through the current checkpoint and recent product checkpoints.

Automated verification completed successfully: the legacy suite completed with all focused files passing; the rendered suite completed **15/15 suites and 112/112 tests**. Rendered tests emitted non-failing `act()` and isolated-navigator warnings; these are test-harness quality signals, not demonstrated production failures.

### Important limitations

- The exact historical files `Claude Design 4 - Navilo(2).pdf` and `Claude Design 4 (Addendum)- Navilo(1).pdf` were not present. They must be supplied separately to Claude Design and treated as inspiration, not truth.
- No already-running preview or simulator was available. This audit created no preview, recording, screenshot or asset. Visual conclusions are based on explicit styles/tokens, composition, code comments recording prior physical-device findings, and rendered/structural tests—not direct visual inspection.
- Device-only behaviour remains unverified: real VoiceOver/TalkBack order and focus restoration, gesture competition, keyboard variants, Dynamic Type extremes, tablet layouts, smallest supported phones, rotation despite portrait configuration, real blur/elevation rendering, animation smoothness and native modal timing.
- There is no authentication or account backend in the repository. Storage is local AsyncStorage. “Guest” is an implementation concept, not a routed authentication state (`src/navigation/RootNavigator.tsx:31-43`, `src/lib/storage.ts`).
- Repository comments contain many historical “PRD ask” statements but no standalone current PRD. They are supporting context below current behaviour, not independent owner approval.

---

## 2. Executive summary

Nolie is functionally much more mature than its small route count suggests. It has a substantial manual-entry finance model, careful recurrence and repayment accounting, durable local persistence, contextual daily briefing, money forecasting, wealth mapping, goals, educational calculators, three colour styles, light/dark support and a broad regression suite. Its strongest foundation is not visual—it is the unusually explicit behavioural contract around money, balances, recurring events, repayments, dates, and reversals.

Design maturity is mixed. The current product has coherent ingredients: shared surfaces, semantic colour tokens, one screen shell, a floating four-tab capsule, detached `+`, stable Add workspaces, reduced-motion hooks, friendly coaching copy and purposeful empty states. However, the experience remains compositionally dense and historically layered. Today and Grow aggregate many cards and concepts; Money combines forecast, timeline, monthly activity and planning; Wealth mixes setup guidance, net-worth reporting, asset/liability administration and projections. Multiple standalone entry points open the same forms that the global Add catalogue embeds. The new nine-tile tray duplicates most of a fourteen-tile catalogue and sends “fast” actions through the catalogue host even when the chooser is skipped.

The highest-priority Design 5 decisions are:

1. Make one canonical Add model: direct quick actions should enter a stable task workspace; “More” should show the complete catalogue; only catalogue-origin tasks should Back to the catalogue.
2. Define whether the detached `+` remains globally visible on pushed screens/forms and how it behaves when navigation or keyboards are active.
3. Reduce Today/Grow hierarchy competition and establish one clear primary story per screen.
4. Separate Nolie’s brand system from semantic success/warning colours and specify all six colour-style/scheme combinations.
5. Treat the current Score as an existing feature requiring containment and compliance review, not Design 5’s final Score.
6. Resolve legacy Lulu/Navilo language and “AI coach” claims while Ask Nolie remains unavailable.

**Inference.** The product is ready to enter holistic design because flows and calculation contracts are sufficiently real and testable. It is not ready for disconnected visual reskinning: Design 5 must settle IA, Add origin/return rules, content hierarchy, states, accessibility and compliance before high-fidelity polish.

---

## 3. Nolie product definition

### Product purpose and customer

**Owner direction.** Nolie is an Australian, manual-entry personal-finance and wealth companion. It should feel like a calm, intelligent coach rather than a conventional transaction tracker.

**Fact.** The implementation supports that positioning through manually recorded balances, income sources, income receipts, expenses, bills, cards, liabilities, goals and transfers. Transactions are explicitly optional; the empty state says Nolie already works from income and balances (`src/screens/transactions/TransactionsScreen.tsx:241-248`). There is no bank connection, authentication, synchronization API or AI backend.

**Inference.** The likely customer is an Australian consumer who wants a consolidated money picture and forward-looking coaching without connecting bank accounts. Onboarding asks name, main money goal and confidence level, but not demographic or financial eligibility questions (`src/screens/welcome/WelcomeFlow.tsx:13-15, 297-386`).

### Current value proposition

- A daily, contextual view of available money, upcoming events, reminders, monthly progress and “Worth Knowing” insight.
- A Money workspace for available-until-payday, timeline, money flow, month-to-date records and allocation.
- A Wealth Map for assets, liabilities, accessible net worth, retirement savings, transfer and future projection.
- A Grow hub for current Score, journey, goals, opportunities, calculators, learning and market previews.
- One global entry system for supported manual updates.

### Australian and manual-entry conventions

**Fact.** All customer amounts render with `$`/locale formatting; no multi-currency field exists. Copy uses Australian terminology including “super” internally and “Retirement Savings” in customer-facing definitions (`src/lib/calculations/wealthDefinitions.ts:10-11`). Pay frequencies are weekly, fortnightly, monthly and irregular (`src/types/models.ts:27`). Date inputs and recurrence logic are local-calendar-oriented and tests cover Melbourne DST.

**Recommendation.** Design 5 should explicitly annotate AUD rather than assume `$` is unambiguous, especially in onboarding, export/future multi-region concepts and calculators. Do not introduce currency switching without a product/data specification.

### Tone and compliance boundaries

**Fact.** Onboarding requires acknowledgement of a disclosure stating that Nolie provides educational information, estimates and planning tools, not personal financial advice (`src/screens/welcome/WelcomeFlow.tsx:15, 378-386`). Grow says “Educational information only. Not investment advice” (`src/screens/discover/DiscoverScreen.tsx:463-470`). Calculator and emergency-fund screens use illustrative/guideline disclaimers.

**Owner direction.** Nolie must not imply regulated financial advice, credit assistance, debt-management services or specific product recommendations. Existing logic and compliance constraints must remain unless separately specified.

**Design boundary.** Design 5 must not imply:

- bank/account connectivity or automatic transaction truth;
- a regulated adviser, personalised recommendation or guaranteed result;
- lender eligibility, approval, borrowing capacity or credit assistance;
- debt negotiation/management services;
- real market execution or specific product recommendations;
- an operational Ask Nolie assistant;
- that Nolie Score is a complete assessment of financial wellbeing.

**Fact/issue.** Onboarding still advertises “AI Financial Coach” in a preview callout (`WelcomeFlow.tsx:20-25`) despite no operational AI capability. The repository also contains a dormant “Coming with Premium” `AskLuluSheet`, currently unwired (`src/lib/askNolie.ts:3-15`). This is a compliance and expectation-setting gap.

---

## 4. Current information architecture

### Navigation map

```text
Cold launch
├─ persistence loading indicator
├─ WelcomeFlow (if hasSeenIntro=false)
│  └─ Welcome → preview → name → goal → confidence → disclosure
└─ Root stack / Main
   ├─ Today tab
   │  ├─ Settings (modal) → Language; Reset Nolie
   │  ├─ Transactions
   │  ├─ Goals / Goal detail / Add goal
   │  ├─ MoneyDetail (pushed canonical Money screen, focused section/event)
   │  ├─ GrowDetail (pushed canonical Grow screen, focused section)
   │  └─ reminder, transaction and contextual sheets
   ├─ Money tab
   │  ├─ Transactions
   │  ├─ Goals
   │  ├─ Select balances → scoped Add catalogue
   │  └─ timeline/flow/month-source/allocation sheets and add/edit forms
   ├─ Wealth tab (“Wealth Map” screen title)
   │  ├─ asset/liability/card/income forms
   │  ├─ Move money
   │  └─ estimated-change info sheet
   └─ Grow tab (implementation file/dormant naming: Discover)
      ├─ Score explanation; Journey subviews; Goals
      ├─ Savings Comparison
      ├─ Compound Calculator
      ├─ Emergency Fund
      ├─ Home Loan Calculator
      ├─ Debt coach
      └─ add cash/goal/goal detail

Global above every root-stack destination
└─ Detached + → 3×3 quick-action tray
   ├─ direct initial task inside AddAnythingSheet
   └─ centre “Add anything” → full Add to Nolie catalogue
```

### Route index and behaviour

| Destination | Parent/entry | Exit behaviour | Implementation |
|---|---|---|---|
| WelcomeFlow | Root conditional when intro unseen/reset | Completion atomically writes profile/disclosure then Main appears; several early “Skip” paths call finish | `RootNavigator.tsx:37-46`; `WelcomeFlow.tsx` |
| Main | Root stack initial | Persistent tab state; custom dock | `RootNavigator.tsx:49`; `MainTabNavigator.tsx` |
| Today | Main tab | Repeat tab tap scrolls top | `TodayScreen.tsx`; `MainTabNavigator.tsx:80` |
| Money | Main tab | Repeat tap scrolls top; internal links can push detail routes | `MoneyScreen.tsx`; `MainTabNavigator.tsx:81-83` |
| Wealth | Main tab | Repeat tap scrolls top | `WealthScreen.tsx`; `MainTabNavigator.tsx:84` |
| Grow | Main tab | Repeat tap scrolls top | `DiscoverScreen.tsx`; `MainTabNavigator.tsx:85-87` |
| Settings | Root modal from Today gear | Back/goBack to origin | `RootNavigator.tsx:50`; `SettingsScreen.tsx` |
| Language | Root push from Settings | Back to Settings; selection updates immediately | `LanguageScreen.tsx` |
| ResetLulu route | Root push from Settings | Cancel returns; successful reset returns to Welcome through state gate | `ResetLuluScreen.tsx`; `AppStateContext.tsx:3363+` |
| Goals | Root push from Today/Money/Grow | Back to exact origin | `GoalsScreen.tsx` |
| Cards | Root push from reminders/opportunities | Back to origin | `CardsScreen.tsx` |
| Transactions | Root push from Today/Money | Back to origin | `TransactionsScreen.tsx` |
| MoneyDetail | Root push from Today briefing/Worth Knowing | Canonical Money content in `pushed` mode; Back to Today | `RootNavigator.tsx:76-81`; `MoneyScreen.tsx` |
| GrowDetail | Root push from Today Score/Journey/Worth Knowing | Canonical Grow content in `pushed` mode; Back to Today | `RootNavigator.tsx:82-87`; `DiscoverScreen.tsx` |
| SavingsComparison | Root push from Grow/savings coach | Back to origin | `SavingsComparisonScreen.tsx` |
| CompoundCalculator | Root push from Grow/Saving Facts | Back to origin; route params can prefill | `CompoundCalculatorScreen.tsx` |
| EmergencyFund | Root push from Grow | Back to origin | `EmergencyFundScreen.tsx` |
| HomeLoanCalculator | Root push from Grow | Back to origin | `HomeLoanCalculatorScreen.tsx` |

### Conditional, hidden and dormant destinations

- **Fact:** Ask Nolie is disabled by a typed capability flag and has no route/backend (`src/lib/askNolie.ts:17-37`). `AskLuluSheet.tsx` remains dormant and unwired.
- **Fact:** `SavingsAllocationPromptSheet` is contextual after qualifying income setup, not a root route.
- **Fact:** Wealth projection, portfolio insight, journey stages, opportunity content and some cards are conditional on recorded data/unlock selectors.
- **Fact:** `QuickAddModal` and the add/edit components exist both embedded in the catalogue workspace and as standalone modals from domain screens.
- **Fact:** There is no authentication, sign-in, account recovery or permissions route.
- **Inference:** “Discover,” “Lulu” and `ResetLulu` are implementation/historical names that should not define Design 5 IA.

---

## 5. End-to-end customer journeys

| Journey | Current path | Strength | Friction/risk | Design 5 requirement |
|---|---|---|---|---|
| First use | Welcome → decorative preview → name → goal → confidence → disclosure → Today | Warm, optional personalization; atomic completion | “AI Financial Coach” overstates capability; name Skip exits before disclosure despite comments saying disclosure mandatory | Define exact skip/consent rules and truthful preview; device-test small screens/keyboard |
| Returning daily review | Launch → Today greeting/briefing → reminder or contextual card → pushed Money/Grow/detail | Contextual and origin-preserving | Many cards compete; destination focus machinery is sophisticated but invisible | Establish one daily priority, predictable sections and destination affordances |
| Review money position | Money → Available Until Payday → timeline → flow/month/allocation drill-down | Strong calculations and explicit missing-data states | Dense multi-model page; “available,” “cashflow,” “spending” and “allocation” can be conflated | Create explanatory hierarchy without changing measures |
| Review wealth | Wealth → total/accessibility/retirement → assets/liabilities → edit/details | Comprehensive and manual-entry appropriate | “Total Wealth” currently displays net worth; setup, projection and administration intermix | Resolve naming and staged hierarchy |
| Review growth | Grow → Score → Journey → goals → opportunities → future → learning/markets | Broad coaching vision | Extremely long, content-library feel persists beneath “Grow”; Score dominates despite future v2 | Prioritise coaching tasks; contain/defer Score v2 |
| Add expense | `+` → tray → Record spending → embedded expense workspace → Save closes to origin | Quick label; stable workspace; origin preserved | Technically enters catalogue host; Back currently returns to hidden chooser, contrary to owner direction | Direct-origin Back/Cancel must return to origin; no catalogue reveal |
| Add income receipt | `+` → Record income → `income_received` transaction form | Separates receipt from recurring source | Tray label “Record income” can be confused with catalogue “Add income source” | Clarify nouns and taxonomy |
| Add income source | `+` → Add anything → Money/Add income source → source form → optional mid-cycle allocation prompt | Correct recurrence model | One extra chooser layer; prompt complexity | Catalogue-origin Back returns to catalogue; completion returns to origin |
| Add bill | `+` → Add bill → bill workspace; may hand off Bill → Liability → Credit Card | Handles linked repayment architecture | Nested conceptual task, though one workspace; Back stack can be hard to predict | Prototype nested handoff and breadcrumbs/copy |
| Add account | `+` → Add account → balance-scoped chooser → Cash/Savings/Everyday → asset form | Avoids wrong preset; includes all liquid types | Still an intermediate chooser; tray taxonomy “account” vs catalogue’s three balance types | Decide whether account quick action merits picker or becomes “More” |
| Move money | `+` → Move money → transfer workspace → Save/Transfer closes | Reuses real balance/debt eligibility | Transfer draft is the exception that is not parked/preserved on Back | Specify cancellation and resumption explicitly |
| Add debt | `+` → Add debt → liability type selector/form; possible card handoff | Broad debt support | “Debt” tray vs “Liability” catalogue taxonomy | Choose customer terminology and map types consistently |
| Add asset | `+` → Add asset → generic investment preset (`etf`) workspace | Fast for investments | Label implies all assets but defaults to investment; catalogue exposes six asset types | Rename to “Add investment” or use an asset picker |
| Add goal | `+` → Add goal → goal form | Genuine frequent action | Duplicated entry from Today/Grow/Goals | Keep global fast path; harmonise completion |
| Edit/delete | Tap transaction/card/goal/asset/liability rows → standalone form/sheet → save/delete/confirm | Existing data effects reverse carefully | Different containers and footer patterns; destructive actions vary | Standard edit workspace and confirmation system |
| Change appearance | Today gear → Settings → Appearance/System-Light-Dark and Nolie colour style | Separate scheme and colour-style controls | App manifest declares light UI; coverage varies due hardcoded colours | Six-combination spec plus system behaviour |
| Failure recovery | Persistence banner/retry; reset blocking overlay; inline validation; discard confirmations | Persistence failure is globally visible; dirty drafts protected | Most calculations are synchronous, so loading/error/offline states are sparse; some errors are Alert-based | State taxonomy, inline error pattern, focus/announcement rules |

**Confirmed navigation issue.** A quick-action task is initialized inside `AddAnythingSheet`, whose direct destination receives a default return stack of `['chooser']`; Back therefore exposes the full catalogue rather than returning to the origin. Owner direction requires the opposite for tray-origin flows. Save closes to the original screen (`AddAnythingSheet.tsx:1045-1055, 1131-1219`; `addWorkspaceTransitionController.ts:89-99, 131-144`).

---

## 6. Screen-by-screen inventory

### Routed screens

| Screen/route | Purpose and hierarchy | Actions and destinations | States/data | Strengths/issues | D5 disposition |
|---|---|---|---|---|---|
| WelcomeFlow | Welcome gradient; product preview; name; goal; confidence; disclosure | Continue, Skip, acknowledge, Get started | Local step state; user profile; theme | Warm and focused. No Back; fixed layouts risk small screens; AI claim; early Skip appears to bypass disclosure | **Redesign** |
| Today | Daily greeting/settings; Briefing; reminder; month snapshot; Worth Knowing; journey; goal; supporting cards | Settings; pushed Money/Grow; Transactions; Goals; add/edit overlays | Extensive derived daily state, reminders, achievements, monthly summary | Best expression of coaching product; crowded and conditional | **Refine/restructure** |
| Money | Available Until Payday hero; timeline; flow/plan; month summary and balances | Goals, Wealth, Transactions, add/edit, selection/detail sheets | Income, recurring items, transactions, liquid balances, goals/cards/BNPL | Strong domain logic and drill-down; too many financial measures need clearer differentiation | **Refine** |
| Wealth (“Wealth Map”) | Total Wealth hero; setup guide/engine; future; Assets; Liabilities | Move money; add/edit assets/liabilities/cards/income; info sheet | Assets, liabilities, cards, income, projections/unlocks | Complete manual wealth map; hero naming and long administration page need redesign | **Redesign hierarchy; preserve logic** |
| Grow (`DiscoverScreen`) | Disclaimer; Score; Journey tabs; goals; opportunities; future/safety; expandable categories; markets | Score sheet, goals, calculators, debt coach, add cash | Score, achievements, learning, opportunities, market constants | Broad value; overloaded page and Score ambiguity | **Redesign/consolidate** |
| Settings | Profile; appearance; Nolie colour style; language; disclosure/about; data reset | Edit profile, scheme/style selection, Language, Reset | User preferences/local data | Functional central settings; mixed legacy identifiers and likely row inconsistency | **Refine** |
| Language | English/Thai selection | Select then remain/back | i18next and user language | Real localization infrastructure | **Refine; audit translation completeness** |
| Reset Nolie (`ResetLulu`) | Explains local-data wipe; destructive action | Cancel/back; reset | Persistence state; global reset overlay | Clear high-risk separation and retry state | **Refine** |
| Goals | Goal list/progress | Add; open detail; back | Active/completed/archived goals | Useful canonical management | **Refine** |
| Cards | Aggregate credit limit/available/utilisation/health; card list | Add/edit card; back | Cards, repayments, due dates | Rich card understanding; “health score” adds another scoring concept | **Refine/compliance review** |
| Transactions | Spending insights; monthly expandable summaries; transaction rows | Add/edit/delete via QuickAdd; back | Transaction ledger/categories | Optional timeline framing is appropriate; screen remains tracker-like | **Refine** |
| MoneyDetail | Canonical Money screen focused from Today | Back to Today | Route focus request/event identities | Reuses canonical content; avoids duplicate screen | **Preserve** |
| GrowDetail | Canonical Grow screen focused from Today | Back to Today | Route focus request | Reuses canonical content | **Preserve** |
| Savings Comparison | Savings-rate entries/calculation | Edit local comparison inputs; back | Savings assets/comparison records | Educational utility | **Refine/compliance review** |
| Compound Calculator | Projection hero then inputs | Frequency chips/fields; back | Pure calculator, optional params | Clear disclaimer; result precedes inputs and hardcoded gradients need theme review | **Refine** |
| Emergency Fund | Coverage hero/empty guidance, detail, savings rate | Back | Liquid cash, expenses, income | Good setup state and disclaimer | **Refine** |
| Home Loan Calculator | Repayment hero and loan inputs | Frequency/input controls; back | Pure calculator | Clear educational disclaimer; must avoid borrowing-capacity implication | **Refine/compliance review** |

### Important overlays, sheets and task workspaces

| Overlay/workspace | Purpose/states | Entry/exit | D5 disposition |
|---|---|---|---|
| QuickActionsTray | 3×3 menu, backdrop, opening/closing phases, accessibility modal semantics | Global `+`; backdrop/Back/tab/keyboard/`×` dismiss | **Redesign taxonomy; preserve repaired mechanics** |
| AddAnythingSheet | Complete catalogue and persistent embedded workspace; dirty/parked drafts; nested return stack | Global centre or scoped balance flows; Save closes; Back currently returns through internal stack | **Canonicalize** |
| QuickAddModal | Expense or received-income create/edit; category/date/source/balance-effect; validation/delete | Embedded from catalogue or standalone Today/Transactions | **Canonical form; consolidate containers** |
| AddIncomeModal | Recurring income source, frequency/date/unknown-date and mid-cycle reconciliation | Catalogue, Wealth, other prompts | **Preserve logic; redesign form** |
| AddRecurringItemModal | Bill creation/edit, recurrence, payment source, optional loan handoff | Catalogue/Money; nested liability handoff | **Preserve logic; redesign form** |
| AddWealthItemModal | Asset/liability type selection, account provider, rates, property/vehicle links, repayment schedules, delete | Catalogue, Wealth, Grow, recovery overlays | **Preserve logic; simplify progressive disclosure** |
| AddCreditCardModal | Card details, due day, limit/balance/repayment, edit/delete | Catalogue, Cards, Wealth | **Preserve logic; standardize** |
| AddGoalModal | Goal type/name/optional amount/date/priority | Catalogue, Today/Grow/Goals | **Preserve logic; standardize** |
| TransferForm/Modal | Move between liquid assets or pay debt; BNPL handoffs and validation | Catalogue or Wealth | **Preserve logic; standardize** |
| GoalDetailSheet | Progress, target/date/priority edit, completion and delete | Today/Grow/Goals | **Refine** |
| ReminderDetailSheet / SmartReminderCard | Queue and resolve salary/bill/card/BNPL/loan reminders | Today briefing/reminder | **Refine; preserve lifecycle** |
| ScoreExplanationSheet | Score breakdown, factors and explanation | Grow Score | **Defer visual finality pending Score v2** |
| DebtCoachSheet | Contextual debt coaching/add debt | Grow opportunity | **Compliance review/redesign** |
| SelectBalancesSheet | Include/exclude liquid balances; add balance | Money | **Refine** |
| MoneyFlowCategoryDetailSheet | Reconciled line-item breakdown | Money flow/plan | **Preserve/refine** |
| ThisMonthSourcesSheet | Spending funding-source detail | This Month flip card | **Refine/consolidate** |
| SavingsAllocationDetailSheet / EditSavingsAllocationModal / Prompt | Explain/set optional forecast allocation | Money/Wealth/income completion | **Consolidate** |
| InfoSheet / OptionsSheet / KeyboardSheet / DatePickerModal | Shared overlay primitives | Many flows | **Canonicalize; remove primitive drift** |
| Celebration overlay/sheet/toast | Big/medium/small achievement feedback, queued one at a time | State-driven | **Refine motion/accessibility** |
| Persistence banner / reset overlay | Retry unsaved data; block while reset unresolved | Global App shell | **Preserve** |

### State coverage notes

Most list screens have explicit empty states. Most forms have disabled Save and some inline validation. Persistence has global saving-error/reset failure handling. There are few explicit content-loading states because calculations and local data are synchronous. There is no authenticated/offline/server state. “Success” usually means immediate close plus optional celebration, not a consistent confirmation pattern.

---

## 7. Add and quick-action architecture deep dive

### Actual current implementation

**Fact. Floating assembly.** A 64pt four-tab capsule and separate 64pt circular FAB share geometry, 16pt horizontal margins, 8pt gap and safe-area offset (`floatingNavGeometry.ts:19-69`). The dock is rendered by the tab navigator; the FAB is a root-level singleton and remains present across pushed screens (`MainTabNavigator.tsx:53-88`; `RootNavigator.tsx:47-102`). Screen content gets shared bottom clearance (`Screen.tsx:53-62`).

**Fact. Quick tray.** The FAB rotates `+` to `×`, opens an absolutely positioned 3×3 tray, hides when an unrelated keyboard is visible, closes on backdrop, hardware Back, tab switch or keyboard, announces opening, traps accessibility semantics, and restores focus (`FloatingAddButton.tsx:67-199`; `QuickActionsTray.tsx`).

| Position | Current action | Resolution |
|---|---|---|
| 1 | Record income | `income_received` workspace |
| 2 | Record spending | `expense` workspace |
| 3 | Add bill | `bill` workspace |
| 4 | Add account | balance-only catalogue (Cash/Savings/Everyday) |
| 5 | Add anything | full catalogue; would become Ask Nolie only if a real capability is enabled |
| 6 | Move money | `transfer` workspace |
| 7 | Add debt | `liability` workspace |
| 8 | Add asset | `investment` preset, which maps to ETF |
| 9 | Add goal | `goal` workspace |

Evidence: `src/components/navigation/quickActions.ts:37-95`; `src/lib/askNolie.ts:24-37`.

**Fact. Full catalogue.** “Add to Nolie” has fourteen visible options in three groups (`AddAnythingSheet.tsx:29-91`):

- Money: Add expense; Add income source; Record income received; Add bill; Transfer money.
- Wealth: Add cash; Add savings; Add everyday account; Add investment; Add property; Add retirement savings.
- Debt and planning: Add liability; Add credit card; Add goal.

All destinations run inside one persistent `KeyboardSheet` workspace. Chooser and task layers slide horizontally; forms remain mounted to preserve drafts; inactive layers disable pointer and accessibility exposure; nested handoffs preserve a return stack. Transfer alone is not parked after Back (`AddAnythingSheet.tsx:93-159, 1128-1417`; `addWorkspaceTransitionController.ts`).

### Exact journey table

| Origin → Trigger | Intermediate layer | Task workspace | Back/Cancel destination now | Save destination now |
|---|---|---|---|---|
| Any screen → `+` → Record income | Tray closes fully | Record income received | Back → full Add catalogue; Cancel → origin after discard guard | Origin |
| Any screen → `+` → Record spending | Tray closes fully | Add expense | Back → catalogue; Cancel → origin | Origin |
| Any screen → `+` → Add bill | Tray closes fully | Add bill | Back → catalogue; nested Liability/Card Back follows handoff stack; Cancel → origin | Origin |
| Any screen → `+` → Add account | Tray closes fully → scoped balance chooser | Cash/Savings/Everyday asset | Back → scoped chooser; Cancel → origin | Origin |
| Any screen → `+` → Add anything | Tray closes fully → full catalogue | Selected workspace | Back → catalogue (correct for catalogue origin); Cancel → origin | Origin |
| Any screen → `+` → Move money | Tray closes fully | Move money | Back → catalogue; Cancel → origin | Origin |
| Any screen → `+` → Add debt | Tray closes fully | Liability selector/form | Back → catalogue; nested returns preserved; Cancel → origin | Origin |
| Any screen → `+` → Add asset | Tray closes fully | Investment/ETF asset form | Back → catalogue; Cancel → origin | Origin |
| Any screen → `+` → Add goal | Tray closes fully | Add goal | Back → catalogue; Cancel → origin | Origin |
| Money Select Balances → Add money balance | Select sheet closes after committing toggles → scoped chooser | Cash/Savings/Everyday | Back → scoped chooser; dismiss → Money/selection context | Underlying Money flow |
| Domain screen → local Add/Edit | No global catalogue | Standalone canonical form component | Close/Cancel → same domain screen | Same domain screen |

### Repair that prevented the app freeze

**Fact. Root cause recorded in source.** The prior tray was a native React Native `Modal`. Selecting a tile synchronously presented `AddAnythingSheet`—another native modal—before the tray modal had dismissed. On iOS the lower presented controller could not dismiss while presenting another controller, leaving an invisible touch-intercepting tray and an apparently frozen app (`QuickActionsTray.tsx:17-40`).

**Fact. Current repair.** The tray is now a plain overlay, never a native modal. `FloatingAddButton` owns a five-phase reducer: `closed → trayOpen → closingForAction/closingForDismiss → addSheetOpen/closed`. A task sheet can open only after `QuickActionsTray.onClosed` confirms its close animation ended; reachable phases cannot mount both layers. Destination props live in a ref so the sheet’s first visible render cannot read stale `initialKind` (`FloatingAddButton.tsx:31-61, 105-137`; `floatingAddTransition.ts:1-95`). Tests cover phase invariants, direct destination props and rendered handoff.

**Recommendation.** Preserve this single-native-modal invariant and deterministic close-completion signal. Design 5 may change visuals and taxonomy, but must not reintroduce stacked native modals or timeout-based handoffs.

### Duplication and canonical Design 5 model

The tray duplicates eight task concepts from the catalogue. It also creates competing labels:

| Tray | Catalogue | Problem |
|---|---|---|
| Record income | Record income received + Add income source | “Income” means two different data models |
| Record spending | Add expense | Verb/noun mismatch |
| Add account | Cash/Savings/Everyday account | One tray category hides a second picker |
| Add debt | Add liability + Add credit card | Different taxonomy and credit card exclusion |
| Add asset | Six asset types; currently resolves specifically to Investment/ETF | Over-broad label for narrow behaviour |
| Add anything | Add to Nolie | Duplicate “all” concept and inconsistent label |

**Recommendation — canonical model.** Keep one catalogue as the source of truth for all supported data types. Configure a small owner-approved quick-action subset as shortcuts that invoke the same form logic but with origin metadata:

- `origin=quick`: open task directly; Back/Cancel closes to initiating screen.
- `origin=catalogue`: catalogue → task; Back returns to catalogue; Cancel closes to initiating screen unless product explicitly defines Cancel as task-level Back.
- Centre tile while Ask is unavailable: label **More** (recommended) and open catalogue.
- `origin=contextual`: local screen actions return to their local context.

Ask Nolie remains deferred and must not share a live-looking entry until product, privacy, compliance and AI behaviour are specified.

---

## 8. Current design-system inventory

### Foundations

| Defined token/system | Actual usage | Inconsistency | Design 5 implication |
|---|---|---|---|
| Colour roles: background, surfaces, border, text, accent, semantic, navy, AI blue, purple, sunrise, market, gold and gradients | Widely consumed through `useTheme` | Primary `accent` is green while “Nolie colour style” independently drives selected AI/hero surfaces; several brand concepts coexist | Define brand vs interactive vs semantic roles and prohibit semantic colour as decoration |
| Spacing 4/8/12/16/24/32 | Common across components | Many local margins/paddings and fixed sizes sit outside a documented layout grid | Provide responsive grid, section rhythm and component spacing contracts |
| Radius: card 20, control 12, pill 999 | Broad use | Local radii include 15/18/22/28/36 and sheet-specific values | Expand deliberate radius scale or consolidate |
| Typography: 24/17/15/13/11, weights 700/600/400/400/500 | Used as spreads then frequently overridden | Many local font sizes and weights; no font family or line-height scale; Dynamic Type behaviour unspecified | Define semantic type roles, line heights, scaling/truncation rules |
| Minimum touch target 44 | Available and used in some new navigation | Many touchables rely on padding/hitSlop rather than a canonical control | Audit every interactive target in D5 specs |
| `cardShadow` and `glow()` | Cards/heroes/tray/FAB | Dark uses border; light uses shadow; Android elevation often absent | Specify platform-specific elevation and contrast, not one visual assumption |
| Semantic Nolie palette per style/scheme | Today/Grow/AI surfaces | Separate `aiAccent*` and `naviloPalette` systems can drift; hardcoded colours remain | Unify naming and component application matrix |
| Shared `Screen` shell | Routed screens | Some FlatList screens own layout; overlay z-index fix is delicate | Preserve safe-area/bottom-clearance contract and specify list equivalent |

### Colour evidence

`src/theme/tokens.ts:1-189` defines paired light/dark tokens. `src/theme/palettes.ts` resolves Ocean Blue, Purple and Sunrise per scheme, including hero gradients, translucent tiles, muted insight gradients and foregrounds. `contrastOverrides.ts` contains local fixes for warning text, hero scrims and Worth Knowing provenance.

Hardcoded colours still occur outside the token sources, most heavily in `SafeToSpendHero`, `MoneyOpportunitiesHero`, `WelcomeFlow`, `WealthScreen`, calculator screens and celebration surfaces. Some are legitimate white-on-gradient/scrim values, but the absence of semantic names makes theme coverage and contrast harder to prove.

### Typography and coloured text

The system uses the platform default font. Coloured typography communicates positive/negative figures, brand accents, market information, due/attention states and selected controls. This is expressive but sometimes relies on colour as a primary differentiator. Design 5 should pair colour with labels/icons and define accessible numeric reading (sign, currency, period and whether a repayment counts as spending).

### Surfaces and primitives

- `SectionCard` is the closest canonical ordinary surface.
- Heroes use green, navy or selected Nolie gradients with local layouts.
- `KeyboardSheet` is the most capable task container; `InfoSheet`, `OptionsSheet`, native `Modal` wrappers and standalone screen pushes coexist.
- Buttons have shared variants, but many screens implement text links, chips, icon buttons and local add buttons.
- Charts/progress use `ProgressBar`, rings/gauges and chart-kit/SVG; Score has three ring implementations (`CircularScore`, `ScoreRing`, `ScoreRadialGauge`).
- Fields are mostly locally styled `TextInput`s rather than shared primitives.
- Empty state is shared; error, success, field, row, pill and badge primitives are not consistently centralized.

### Duplicate/conflicting implementations

| Area | Evidence | Implication |
|---|---|---|
| Score visuals | `CircularScore`, `ScoreRing`, `ScoreRadialGauge` | Do not consolidate until Score v2; then retire superseded primitives |
| Sheets/modals | KeyboardSheet, InfoSheet, OptionsSheet, DatePickerModal, many component-specific native modals | Define canonical task sheet, info sheet, picker and alert behaviours |
| Add containers | Same form components embedded and standalone | Separate form body from presentation container consistently |
| Savings allocation | Prompt, detail sheet, edit modal, picker body | Consolidate explanation/edit architecture |
| Accessibility focus helpers | `a11yFocus.ts` and `accessibilityFocus.ts` | Review and consolidate after behaviour mapping |
| Hero cards | Today, Money, Wealth, Grow/calculators each local | Define hero roles and limit one dominant stage per screen |
| Numeric formatting | `toLocaleString`, formatMoney, cents formatters across modules | Canonicalize display contracts without changing stored calculations |

---

## 9. Theme matrix

| Theme | Current support | Risks/missing states | Components needing explicit D5 treatment |
|---|---|---|---|
| Ocean Blue light | Default colour style; full token/palette resolution | Blue gradient has known scrim needs; hardcoded whites and green global accent can compete | Today hero/tiles, Worth Knowing, Grow Score/Journey, opportunities, quick tray, onboarding |
| Ocean Blue dark | Full resolution | Dark borders replace shadows; light hardcoded assets/gradients may not harmonize | Cards, sheets, calculators, charts, nav dock |
| Purple light | Selectable | Original “AI” connotation persists; must not imply active AI; green primary interaction can conflict | Same themed surfaces plus future Ask placement |
| Purple dark | Full resolution | Contrast mostly code-corrected but visual depth unverified | Gradient text, selected tabs, translucent tray |
| Sunrise light | Selectable; warm amber/terracotta | Highest risk of confusion with warning/gold; provenance contrast previously failed and is locally overridden | All warning, achievement, attention and selected-style combinations |
| Sunrise dark | Full resolution | Warm surfaces can become muddy; hardcoded celebration/gold colours can collapse hierarchy | Heroes, journey, celebrations, warning states |

**Fact.** Scheme preference supports System/Light/Dark. Colour style is independent: blue/purple/sunrise (`ThemeContext.tsx`).

**Fact/risk.** `app.json` declares `userInterfaceStyle: "light"` while application theme context supports dark/system. Device-level native chrome parity should be verified rather than assumed.

**Recommendation.** Design 5 must provide component-by-component light/dark output for all three styles, not merely six palette swatches. Include disabled, error, warning, success, chart, scrim, keyboard, native picker and system-bar treatment.

---

## 10. Motion, animation and interaction inventory

| Behaviour | Current implementation | Assessment |
|---|---|---|
| App/screen entry | Native stack defaults; tabs intentionally have no transition | Stable; preserve no-animation tab switch because fade/shift caused device blank scenes (`MainTabNavigator.tsx:68-74`) |
| Active tab | Selected item has an animated pill in `FloatingNavBar`; repeat tap scrolls top | Good hierarchy cue; reduced-motion equivalent exists |
| Quick tray open/close | 220ms open, 165ms close; backdrop and panel animate; FAB rotates | “Fast in, calm out” direction; preserve deterministic sequencing |
| Tray → workspace | Tray fully closes, then one native task sheet opens | Correct “one stage, one act” repair; visually verify no perceived flash |
| Add internal navigation | 220ms horizontal push; fixed-height workspace; no opacity ghosting | Strong stable-workspace model; complex native-driver layering has prior device defects and needs regression recording |
| Sheets | KeyboardSheet animated presentation/swipe; OptionsSheet spring; native stack/modal defaults | Multiple motion languages; consolidate |
| Card flip | This Month 3D flip with hidden inactive face | Distinctive but may be ornamental/discoverability-poor; reduced motion supported locally |
| Figure/Score | `CircularScore` animates ring/number; newer radial gauge is deliberately static | Conflicting score motion primitives |
| Briefing/cards | Tile and state-retention animations covered by rendered tests | Motion must not replay on incidental state changes |
| Haptics | Expo Haptics dependency; celebratory/interaction usages exist but are not a universal feedback system | Specify sparse semantic use; never rely on haptics alone |
| Loading/error | Activity indicators and persistence overlays; few skeletons | Appropriate for local data, but saving/error transitions need consistent feedback |
| Reduced Motion | Live OS preference hook; quick tray, dock, Add push, Briefing/timeline/card flip have branches/tests | Good foundation; not every Animated user demonstrably consumes it (e.g. generic OptionsSheet and CircularScore require review) |

### Principles assessment

- **One stage, one act:** repaired tray-to-sheet flow meets it; domain screens can still stack a sheet, picker and Alert conceptually.
- **Stable task workspaces:** Add catalogue meets it; standalone forms use varied containers.
- **No stacked-sheet journeys:** native-modal race is removed, but nested form overlays/pickers require device verification.
- **Fast in, calm out:** tray timing supports it; celebrations and repeated card animations may compete.
- **Motion explains hierarchy/state:** Add push and selected-tab pill do; flip/score animations are less clearly necessary.
- **Reduced Motion:** meaningful coverage exists but is not yet a complete audited guarantee.

---

## 11. Accessibility and responsive behaviour

### Confirmed strengths

- Shared Back controls have role, label and hint (`Screen.tsx:119-135`).
- Quick tray uses menu/menuitem semantics, accessibility-modal behaviour, opening announcement, hidden backdrop, focus transfer and restoration.
- Add workspace hides inactive layers from pointer and assistive technology and moves focus after transitions.
- Progress bars can expose `progressbar`; major money figures often have explicit spoken labels.
- Forms use selected/disabled states and several inline errors use `accessibilityLiveRegion="polite"`.
- Segmented controls and expandable areas expose selected/expanded semantics.
- Reduced Motion is observed live in several high-motion features.
- Screen and floating geometry consume safe-area insets; keyboard visibility hides the global dock outside its own sheet.

### Confirmed defects or implementation gaps

- Many `TouchableOpacity` controls still lack explicit roles/labels; nested text may be announced but behaviour is less predictable.
- Onboarding choice tiles and disclosure checkbox do not consistently expose checkbox/radio state semantics.
- Typography uses fixed numeric sizes and many `numberOfLines` limits; there is no explicit Dynamic Type/max-font-scale policy.
- Some meaning uses green/red/amber alone, including financial deltas and status text.
- Multiple focus helper implementations exist.
- The rendered suite passes but emits `act()` and isolated-navigation console warnings, reducing signal quality.

### Risks requiring device testing

1. VoiceOver/TalkBack traversal and focus restoration across tray close → native sheet open → internal pushes → Alerts/pickers.
2. Dynamic Type at accessibility sizes for dock labels, 3×3 tray, catalogue tiles, Score/Journey tabs, transaction rows and calculator results.
3. Small-screen fit of onboarding preview callouts and fixed-height Add workspace.
4. Hardware/software keyboard: field visibility, footer avoidance, focus order and global dock hiding.
5. Android Back across tray, sheet, internal form step and root stack.
6. Tablet width: the floating assembly stretches almost full width; no max-width is defined by shared geometry.
7. Contrast of every hardcoded/transparent colour over gradients and disabled states across six themes.
8. Screen-reader reading of negative values, “available,” percentages, dates, repayment splits and $ without explicit AUD.
9. Gesture coexistence between sheet swipe, nested ScrollView, horizontal transition and system back gestures (Android predictive back is disabled).

**Recommendation.** Design 5 annotations must define focus destination/restoration, spoken financial strings, reading order, touch targets, scaling/reflow, non-colour cues, reduced-motion substitution and keyboard-safe footer behaviour.

---

## 12. State-completeness matrix

Legend: ✓ explicit; ◐ partial/implicit; — not applicable; ✕ missing or not evidenced.

| Major surface | Default | Empty/setup | Partial | Loading | Success | Error/invalid | Disabled | Stale/offline/permission |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| App shell/persistence | ✓ | ✓ Welcome | ✓ | ✓ initial | ◐ silent save | ✓ banner/reset retry | ✓ reset blocks | Offline — local; stale ◐ |
| Welcome | ✓ | — | ✓ skipped choices | — | ✓ completion | ✕ write failure is global/transition unclear | ✓ buttons | — |
| Today | ✓ | ✓ setup nudges | ✓ conditional cards | — | ✓ reminder outcomes/celebrations | ◐ invalid derived states | ◐ | Stale reminder identities ✓; offline — |
| Money/AUP | ✓ | ✓ missing balance/income | ✓ | — | ◐ | ✓ invalid balance/data selectors | ◐ | Stale route focus ✓ |
| Money timeline/flow/month | ✓ | ✓ | ✓ | — | ◐ | ◐ | ◐ | Stale occurrence focus ✓ |
| Wealth | ✓ | ✓ guide/debt-free | ✓ unlocks | — | ◐ | ◐ | ◐ | — |
| Grow/Score/Journey | ✓ | ✓ locked/unavailable | ✓ | — | achievements ✓ | invalid Score guarded | ◐ future content | Market freshness not represented |
| Lists (Goals/Cards/Transactions) | ✓ | ✓ | ✓ | — | ◐ | ◐ | ✓ max card condition | — |
| Add catalogue | ✓ | ✓ scoped chooser | ✓ parked drafts | — | closes | ✓ discard/validation | ✓ Save | Stale Alert callbacks guarded |
| Expense/income form | ✓ | — | ✓ | — | closes | ✓ field/target errors | ✓ Save | orphaned targets handled |
| Bill/income source recurrence | ✓ | — | ✓ unknown/ambiguous | — | closes/prompt | ✓ dates/duplicates | ✓ Save | stale occurrence protection |
| Asset/liability/card | ✓ | — | ✓ type-specific | — | closes | ✓ ambiguity/validation | ✓ Save | deleted linked records guarded |
| Goal form/detail | ✓ | ✓ optional target | ✓ | — | saved cue/celebration | ✓ date/amount | ✓ Save | — |
| Transfer | ✓ | ✓ eligible targets | ✓ BNPL states | — | completion | ✓ insufficient/corrupt | ✓ action | stale confirmation guarded |
| Calculators | ✓ | ✓ zeros | ✓ | — | live result | ◐ invalid inputs usually collapse to zero | ◐ | No market/API permissions |
| Themes | ✓ | — | — | — | immediate | ✕ explicit unsupported-colour fallback | — | System changes ✓ |

### Missing states Design 5 must specify

- Persistence failure during onboarding completion or task Save: whether the customer remains, closes with banner, or sees inline recovery.
- Explicit task success feedback and whether it should be toast, inline confirmation or quiet close.
- Data freshness language for manually entered balances and market previews.
- Calculator malformed input and impossible combinations, not only zero results.
- Theme-switch transitions and native picker/system chrome parity.
- Max-card state, completed/archived goal discovery and deleted-linked-data recovery.
- No-data vs invalid-data vs intentionally excluded-balance explanations.
- Future/disabled features must be absent or clearly non-operational, not tempting dead ends.

---

## 13. Copy, content and compliance review

### Terminology inventory

| Concept | Current variants | Issue/recommendation |
|---|---|---|
| Brand | Nolie customer-facing; Lulu/Navilo in files, comments, package, route names | Keep internal migration out of visual scope, but remove customer-visible legacy strings and annotate technical legacy |
| Grow | Route label Grow; implementation/components use Discover; copy still resembles content discovery | Design Grow as coaching progression, not a renamed library |
| Wealth | Tab Wealth; title Wealth Map; hero “Total Wealth” displays computed net worth | Decide precise hierarchy: net worth vs total assets vs accessible net worth |
| Income | Add income source; Record income received; tray Record income | Preserve model distinction and make labels explicit |
| Expense/spending | Add expense; Record spending; spending recorded; cashflow | Define glossary and use terms by measure |
| Debt/liability | Add debt; Add liability; Cards separate | Choose customer-first “Debt” umbrella and precise subtypes |
| Transfer | Transfer money; Move money | Choose one label; owner direction uses quick action “Move” concept |
| Score | Nolie Score; Credit health score; journey/achievement scoring concepts | Avoid score proliferation; Score v2 separate |
| AI | AI Financial Coach; AI identity comments; Ask Nolie disabled | Remove operational implication until capability exists |

### Voice and tone

The strongest copy is factual and non-shaming: “money you are working towards clearing,” “there’s no wrong answer,” “based on what you’ve recorded,” and optional transaction language. Error and discard copy is generally neutral. Red is documented as urgent-only.

Potentially problematic areas requiring compliance review—not legal conclusions—include:

- “AI Financial Coach” in onboarding without an AI service.
- Money opportunities and savings comparisons that can edge toward product recommendation unless framed as user-entered educational comparisons.
- “Credit health” and Nolie Score interpretations that may imply authoritative assessment.
- Debt coach naming and actionable debt messaging.
- Emergency-fund “Recommended (3–6 months)” despite guideline disclaimer.
- “Can I buy a home?” as a link to a repayment calculator; it does not assess affordability or approval and should not suggest it does.
- Market Pulse freshness/source disclosure; current data is repository-defined, not evidenced as live.

### Disclosure architecture

Disclosures exist at onboarding, Grow and calculators, but they are repeated local blocks. Design 5 should define a disclosure hierarchy: persistent contextual label, expandable explanation, and full legal copy where required. Do not hide a material limitation behind a decorative info icon alone.

---

## 14. Functional and data invariants

These are engineering contracts Design 5 must preserve. Visual designs may reorganize presentation but must not change the underlying meaning.

1. **Manual truth.** Stored balances and dates are customer-entered; no bank-feed claim. Transaction `source` reserves a future bank feed but current flows are manual (`models.ts:152-155`).
2. **Income models differ.** Recurring income sources drive forecasts/payday; received income is a transaction and must not silently become recurring (`AddAnythingSheet.tsx:56-60`).
3. **Money availability vs wealth.** Cash and Everyday default into short-term Money; Savings defaults out unless opted in. Exclusion changes Money availability, not net worth (`models.ts:294+`; `liquidAssets.ts`).
4. **Net worth.** Assets minus liabilities/credit-card representations, with synchronized card liabilities and history updates managed centrally (`AppStateContext.tsx:45-117`). Retirement and accessible net worth are separately defined (`wealthDefinitions.ts`).
5. **Transaction factual source vs balance effect.** `paymentSource` records how money moved; `balanceEffect` records whether Nolie updates a balance; `appliedBalanceEffect` records the actual delta for exact reversal (`models.ts:93-193`).
6. **Exact reversal.** Edit/delete reverses the last actual applied delta, never a newly inferred intended amount. Insufficient balances can floor the applied delta; reversal restores only what moved.
7. **Repayment accounting.** Credit-card/BNPL repayments are not ordinary spending; loan repayments distinguish known principal, all-interest and unknown split. Cashflow, aggregate spending and category coaching are deliberately different measures (`repaymentAccounting.ts`).
8. **Recurring confirmation idempotency.** Occurrence keys, expected dates and stale guards prevent duplicate confirmation; schedule advances once.
9. **Calendar recurrence.** Monthly/irregular recurrence preserves an anchor day across short months; local calendar differences, including DST, must not change days-until-payday.
10. **Safe to Spend/Available Until Payday.** Uses eligible included balances, next income/payday, fixed costs, variable spend, savings allocation and goal reservation according to `safeToSpend.ts`; unavailable/invalid states must not fabricate zero.
11. **Savings allocation.** Explicit off/absent means $0; percentage applies to expected recurring income; fixed monthly amount is prorated. It is a forecast preference, not proof money was saved (`models.ts:32-49`).
12. **Goals.** Target amount/date are optional; estimated monthly contribution is derived; priority governs allocation order; status is active/completed/archived (`models.ts:275-292`; `goalAllocation.ts`).
13. **Transfers.** Sources are liquid Cash/Everyday/Savings; destinations exclude source and may include liabilities. Debt repayments have distinct eligibility and confirmation rules (`moveMoneyEligibility.ts`; `TransferForm.tsx`).
14. **Linked debt records.** Mortgages/car loans can link property/vehicle and recurring repayments; ambiguous duplicate linked repayments are blocked, never guessed.
15. **BNPL.** Due/overdue occurrences may be confirmed; future ones cannot. Effective repayment is capped to outstanding balance.
16. **Score.** Current `computeLuluScore` is authoritative only under its own lock/validity gates; invalid values render unavailable, never clamped. Design 5 must not change formula or imply final Score v2 approval.
17. **Formatting.** Inputs accept strict positive money grammar (or explicit zero-allowing variants), at most two decimals, no comma/currency-symbol permissive parsing. Displays often round to whole dollars for reconciled summaries; row totals use deterministic reconciliation.
18. **Persistence.** All app data persists locally via AsyncStorage; failed writes surface globally; reset is a guarded wipe and returns to fresh-install Welcome.
19. **Save semantics.** Duplicate submit guards and atomic transitions protect multi-record actions. A design must not split an atomic operation into independently committable-looking steps.
20. **Origin preservation.** Root detail routes reuse canonical screens and return to the initiating tab; no automatic tab switching for contextual pushes.

---

## 15. Reusable component assessment

| Component/family | Current use/variants | Duplication/suitability | D5 disposition |
|---|---|---|---|
| `Screen` | Header, Back, safe areas, ScrollView/FlatList shell, overlay, dock clearance | Strong canonical shell; needs responsive max-width and list contract | **Preserve/refine** |
| `SectionCard` | Default content surface | Strong base but local card styles duplicate it | **Canonical primitive** |
| `Button` | Primary/secondary/destructive-ish uses | Many bespoke links/add buttons remain | **Expand canonical variants** |
| `KeyboardSheet` | Forms, swipe/keyboard/footer/dirty guards | Most mature container; complex | **Canonical task workspace** |
| `InfoSheet` | Explanations | Separate visual implementation | **Canonical info surface** |
| `OptionsSheet` | Selectors with spring/swipe | Motion and accessibility divergence | **Consolidate with sheet system** |
| `DatePickerModal` | Native date picking | Necessary platform primitive | **Preserve/refine** |
| `EmptyState` | Lists/setup | Reusable and tone-aligned | **Canonical primitive** |
| `ProgressBar` | Goals, cards, journey | Good accessible optional role | **Canonical primitive** |
| Score rings | Three implementations | Conflicting visual/motion contracts | **Defer/consolidate after Score v2** |
| Metric/financial cards | `MetricCard`, local heroes, summary rows | Fragmented number hierarchy | **Create canonical figure/card family** |
| Form fields | Local TextInputs/chips/pickers | High duplication; inconsistent errors/helper text | **Create canonical field system** |
| Rows | Settings, assets, liabilities, transactions, goals, navigation cards | Repeated local chevron/icon patterns | **Create canonical list/action rows** |
| Pills/badges/chips | Frequency, category, status, selected tabs | Semantics and sizes vary | **Consolidate by role** |
| Floating dock/FAB/tray | Shared geometry and repaired state machine | Mechanically strong, taxonomy unsettled | **Preserve mechanics; redesign presentation/content** |
| Add form bodies | Reused embedded/standalone via imperative handles | Correct reuse but complex container coupling | **Preserve logic; formalize body/container contract** |
| Celebration surfaces | Toast/sheet/overlay | Three scales intentionally exist | **Refine and document thresholds** |
| Persistence feedback | Global banner/blocking overlay | Correct global ownership | **Preserve** |

---

## 16. Findings register

| ID | Severity; class | Finding/evidence | Customer impact | Design 5 implication / owner / disposition |
|---|---|---|---|---|
| D5-001 | S1; fact | Quick-origin Back returns to the catalogue because direct initial routes receive `['chooser']` (`addWorkspaceTransitionController.ts:89-99, 131-144`) | Context loss and an unexpected extra layer | Add origin metadata and explicit return matrix / Product+Design+Engineering / **Redesign** |
| D5-002 | S1; open decision | Nine tray actions duplicate most of fourteen catalogue entries (`quickActions.ts`; `AddAnythingSheet.tsx:61-91`) | Two taxonomies and more choice than a “quick” menu | Limit quick actions; centre More opens canonical catalogue / Product / **Consolidate** |
| D5-003 | S1; fact | “Add asset” resolves to `investment`, mapped to ETF, while catalogue asset scope is much broader (`quickActions.ts:91-94`; `AddAnythingSheet.tsx:126-133`) | Misleading action can create wrong expectations | Rename “Add investment” or introduce asset picker / Product+Content / **Redesign** |
| D5-004 | S1; fact | Onboarding says “AI Financial Coach,” but Ask Nolie is disabled and no AI backend exists (`WelcomeFlow.tsx:20-25`; `askNolie.ts`) | Misrepresentation/expectation and compliance risk | Remove/reframe until approved capability / Product+Compliance / **Remove/refine** |
| D5-005 | S1; fact | Current Score is prominent across Today/Grow while owner says Score v2 is separate; code includes multiple Score presentations | Design could accidentally canonize an unapproved score | Contain current state; propose interim/transition options / Product+Compliance / **Defer** |
| D5-006 | S1; inference | Grow is a very long aggregation of Score, journey, goals, opportunities, calculators, learning and markets (`DiscoverScreen.tsx:463-918`) | Weak task hierarchy and content-library feel | Re-architect Grow around prioritized coaching jobs / Product+Design / **Redesign** |
| D5-007 | S1; inference | Today conditionally composes many high-emphasis cards and destinations | Daily focus can become visually noisy and unpredictable | Define one primary daily stage and strict secondary hierarchy / Design / **Redesign** |
| D5-008 | S1; fact | Prior stacked-native-modal implementation froze the app; current repair relies on strict phase sequencing (`QuickActionsTray.tsx:17-40`; `floatingAddTransition.ts`) | Regression could block all interaction | Preserve single-modal invariant and add prototype/device gate / Engineering+Design / **Preserve** |
| D5-009 | S2; fact | Tray label “Record income” competes with “Add income source” and “Record income received” | Customers may choose wrong model | Use explicit “Income received” vs “Income source” / Content+Product / **Refine** |
| D5-010 | S2; fact | Tray “Add debt,” catalogue “Add liability,” cards separate | Taxonomy feels financial-system-centric and inconsistent | Define Debt umbrella/subtypes / Content / **Consolidate** |
| D5-011 | S2; fact | Wealth hero “Total Wealth” renders `netWorth`, while assets and liabilities are shown below (`WealthScreen.tsx:248-280`) | Metric may be misunderstood | Rename “Net worth” or specify exact formula disclosure / Product+Content / **Refine** |
| D5-012 | S2; inference | Money combines several valid but different measures: availability, cashflow, spending, allocation and timeline | Customers can compare unlike figures | Design explanatory hierarchy and glossary / Design+Content / **Refine** |
| D5-013 | S2; fact | Global FAB remains mounted on pushed screens because it is outside root stack navigator | Competes with local forms/details and can create parallel tasks | Decide visibility rules per route/state / Product+Design / **Refine** |
| D5-014 | S2; fact | Three theme styles × light/dark exist, but hardcoded colours remain across heroes/calculators/celebrations | Theme inconsistency and contrast risk | Deliver six-mode component matrix/tokens / Design Systems / **Refine** |
| D5-015 | S2; fact | Sunrise overlaps warning/gold hue territory despite semantic separation in code | State meaning may be visually ambiguous | Specify colour-pairing rules/non-colour cues / Design Systems+A11y / **Refine** |
| D5-016 | S2; fact | Fixed type sizes, truncation and fixed 3×3/fixed workspace layouts lack Dynamic Type specs | Accessibility and small-screen failure risk | Provide reflow/scaling designs / Design+A11y / **Redesign** |
| D5-017 | S2; fact | Sheet/modal primitives and motion languages vary | Inconsistent Back/Cancel/swipe/focus behaviour | Canonical overlay hierarchy and contracts / Design Systems / **Consolidate** |
| D5-018 | S2; fact | Form fields and error/helper patterns are mostly local | Higher cognitive load and implementation drift | Full field/picker/validation library / Design Systems / **Consolidate** |
| D5-019 | S2; fact | App supports dark/system in code while manifest declares light UI | Native chrome/theme parity uncertain | Validate configuration and specify system surfaces / Engineering+Design / **Refine** |
| D5-020 | S2; recommendation | Manual data has no prominent freshness treatment | Customers may treat old balances as current | Design “recorded/updated” language where decision-relevant / Product+Content / **Refine** |
| D5-021 | S2; fact | “Can I buy a home?” leads only to repayment math | Can imply affordability/eligibility not calculated | Rename to repayment-estimate intent / Compliance+Content / **Refine** |
| D5-022 | S2; fact | Market and savings comparison content has no evidenced live-data source | Freshness/product recommendation ambiguity | Label source/date/manual nature or defer / Product+Compliance / **Refine/defer** |
| D5-023 | S2; fact | Early onboarding Skip calls completion before disclosure, conflicting with code comment that disclosure is mandatory (`WelcomeFlow.tsx:28-36, 313-315`) | Consent/compliance ambiguity | Owner/legal decision and corrected journey spec / Product+Compliance / **Redesign** |
| D5-024 | S3; fact | Customer brand is Nolie but internal Lulu/Navilo terms are extensive | Design handoff and analytics/engineering naming confusion | Include canonical terminology map; avoid incidental code rename in visual work / Product Ops / **Refine** |
| D5-025 | S3; fact | Score has three visual components and both animated/static patterns | Visual inconsistency and maintenance overhead | Retire only after Score v2 decision / Design Systems / **Defer** |
| D5-026 | S3; fact | Two accessibility focus helper modules exist | Drift risk | Consolidate during accessibility implementation wave / Engineering / **Consolidate** |
| D5-027 | S3; fact | Render tests pass with console warnings | Noisy suite can hide future issues | Clean harness separately; no D5 visual dependency / Engineering / **Refine** |
| D5-028 | S3; evidence gap | No direct visual/device inspection was available | Polish conclusions are bounded | Require recordings and six-theme device QA before sign-off / Product+QA / **Defer to validation** |

No S0 data-loss issue was established by this audit. The current persistence and reversal logic is unusually well defended by tests, but passing tests do not eliminate device or undiscovered financial edge cases.

---

## 17. Preserve, redesign, remove or defer matrix

| Area | Disposition | Rationale |
|---|---|---|
| Product hierarchy | **Redesign** | Four areas are sound; internal hierarchy is too dense |
| Top-level Today/Money/Wealth/Grow | **Preserve** | Matches owner direction and current routes |
| Floating bottom bar | **Refine** | Direction is approved; shared geometry/mechanics strong |
| Detached `+` | **Refine** | Preserve direction; define route/keyboard/form visibility |
| Quick actions | **Consolidate/redesign** | Too many actions and taxonomy duplication |
| Full Add catalogue | **Preserve as canonical; refine** | Complete, real task inventory and stable workspace |
| Task workspaces | **Preserve logic; redesign UI** | Strong validation/atomicity; need common visual contract |
| Today | **Redesign hierarchy** | Preserve contextual data and destinations |
| Money | **Refine** | Preserve all measures/calculations; clarify model |
| Wealth | **Redesign hierarchy** | Preserve net-worth/data administration logic |
| Grow | **Redesign/consolidate** | Preserve approved learning/calculators; reduce breadth |
| Current Score | **Defer/refine containment** | Score v2 separate; no silent finalization |
| Ask Nolie | **Defer** | No backend/product/compliance specification |
| Themes | **Refine/complete** | Preserve three styles and scheme support; systematize |
| Motion | **Refine** | Preserve repaired sequencing; unify language/reduced motion |
| Accessibility | **Redesign specifications; preserve strengths** | Good code foundation, incomplete systemic coverage |
| Copy | **Refine** | Coaching voice strong; taxonomy and claims inconsistent |
| Calculations/data behaviour | **Preserve** | Explicit owner direction and tested contracts |
| Dormant AskLulu premium teaser | **Remove from current IA/defer code decision** | Not operational and legacy branded |

---

## 18. Design 5 gap analysis

| Desired direction | Current evidence/gap | Specific Design 5 implication |
|---|---|---|
| Calm and premium | Semantic palette, shadows/glows and strong heroes exist; long screens and many card accents create competition | One dominant stage per screen; fewer simultaneous coloured surfaces; measured whitespace |
| Ambient and floaty | Floating dock/FAB/tray and translucent hero tiles support direction | Specify depth layers, scrims and platform elevation consistently; avoid floating every card |
| Strong, restrained colour | Three style palettes exist; green/navy/market/gold/semantic colours also compete | Define brand-style scope and colour budget per screen |
| Clear hierarchy | Today/Grow and Wealth mix many equal-weight modules | Establish priority tiers, section sequencing and progressive disclosure |
| Stable workspaces | Add catalogue has fixed-height, persistent task layers | Make it canonical across direct/local entry points; preserve drafts and atomic Save |
| Fewer stacked layers | Native tray race fixed; pickers, Alerts and varied sheets remain | Publish overlay hierarchy and maximum nesting rules |
| Consistent surfaces | SectionCard/Screen/Button exist, but heroes/rows/fields are local | Deliver component library and migration map |
| Coherent floating nav | Shared geometry and selected pill exist | Define dock on root pushes, forms, keyboard, tablet and accessibility sizes |
| Complete theme support | Six palette combinations resolve | Provide component state matrices and remove unexplained hardcoding |
| Accessible motion | Several reduced-motion paths/tests exist | Audit all Animated consumers; specify replacements, not just shorter duration |
| Consistent completion/return | Root pushes preserve origin; quick-origin Back does not | Make origin a first-class navigation contract and prototype every Add path |

---

## 19. Decisions required before visual design

### 1. Canonical Add architecture

- **A: Keep tray and catalogue as two independent menus.** Lowest code change; preserves duplication and taxonomy risk.
- **B: Small shortcut tray + canonical catalogue + shared workspaces.** Clear speed vs breadth; requires origin metadata. **Recommended.**
- **C: Catalogue only.** Simplest IA; loses approved quick-action direction.

### 2. Centre quick action

- “Add anything”: current but vague and duplicates sheet title.
- “More”: clearly signals remaining options. **Recommended while Ask is unavailable.**
- “All ways to add”: explicit but long for a compact tile.

### 3. Ask Nolie location

- Reserve centre now: implies unavailable capability and wastes prime space.
- Add later as a separate global/product area after specification. **Recommended.**
- Replace More later: potentially disruptive; only decide with actual Ask use cases.

### 4. Quick-action selection and limit

- Current nine: broad but not quick.
- Four to six fixed actions based on frequency and clarity. **Recommended starting point:** Expense, Income received, Bill, Move money, Goal, More; validate account/debt frequency with evidence.
- User-customizable: flexible but adds settings/learning complexity; defer until usage data exists.

### 5. Back/Cancel by origin

- Same behaviour everywhere: simpler implementation but loses context.
- Origin-aware: quick/local Back and Cancel return to origin; catalogue task Back returns to catalogue; Save always returns to origin. **Recommended and matches owner direction.** Decide separately whether Cancel in catalogue-origin task returns to catalogue or closes; recommendation: Back returns catalogue, Cancel closes journey.

### 6. Floating navigation during forms/details

- Always visible: global access but competes and enables parallel journeys.
- Hide on all root pushes/tasks: cleaner but weakens global-nav promise.
- **Recommended:** visible on four tab roots and passive detail screens only; hidden whenever keyboard/task sheet/destructive confirmation is active. Decide case-by-case for pushed calculators/settings.

### 7. Surface and overlay hierarchy

- Preserve varied native/custom sheets: least effort, persistent inconsistency.
- **Recommended:** screen push for deep/long review; one canonical task sheet/workspace for create/edit; info sheet for short explanation; platform picker for atomic selection; alert only for irreversible confirmation.

### 8. Theme behaviour

- Three styles affect only featured Nolie surfaces (current approximate model). **Recommended**, with explicit scope.
- Three full-app skins: stronger identity but semantic/contrast explosion.
- Reduce to one brand theme: simpler, contradicts current capability/owner request for complete support unless separately approved.

### 9. Score

- Restyle current Score as final: **not acceptable** without Score v2 approval.
- Keep current functionality with visibly restrained presentation and factual “based on recorded data” copy. **Recommended interim.**
- Remove entirely pending v2: clearest compliance posture but breaks existing journeys; requires explicit product approval.

### 10. Incomplete/future features

- Show disabled teasers: communicates roadmap but creates dead ends.
- **Recommended:** omit Ask Nolie and unverified premium concepts from primary IA; use clearly labelled educational preview only when owner-approved and truthful.

---

## 20. Required Nolie Design 5 deliverables

Claude Design must deliver an engineering-ready package, not only hero mockups:

1. Updated IA and route/origin map for Today, Money, Wealth, Grow, settings and all task flows.
2. Complete designs for every routed screen and overlay in Section 6.
3. Default, empty, setup, partial, loading, success, error, invalid, disabled, stale and destructive-confirmation states as applicable.
4. Ocean Blue, Purple and Sunrise/Ambient Orange in light and dark, including system-behaviour notes.
5. Semantic tokens: colour, typography, spacing, radius, border, shadow/elevation, blur/translucency, icon and motion.
6. Component library: screen shell, headers, floating nav, buttons, fields, pickers, rows, cards, heroes, figures, tabs, chips, badges, progress, charts, empty/error states, sheets and alerts.
7. Floating navigation specification for root tabs, pushed screens, keyboards, sheets, small screens, tablets and accessibility sizes.
8. Add-flow prototype demonstrating origin-aware direct shortcut, More/catalogue, task Back/Cancel/Save, nested Bill→Liability→Card, dirty drafts and discard.
9. Motion specification with duration/easing/staging rationale and explicit reduced-motion equivalents.
10. Accessibility annotations: roles, names, values, hints, order, focus movement/restoration, touch targets, contrast, Dynamic Type/reflow and spoken financial strings.
11. Responsive rules for smallest phones, common phones and supported tablets, including max content/dock widths.
12. Copy deck and compliance annotations identifying wording requiring review.
13. Engineering measurements and layout rules, including safe areas and bottom-dock clearance.
14. Preserve-versus-change annotations that reference the invariants in Section 14.
15. Recommended implementation waves and checkpoint acceptance criteria.

---

## 21. Recommended implementation sequence

### Wave 1 — foundations and tokens

Define semantic token model, typography, spacing/grid, surfaces, fields, numbers and six-theme matrix. Build a visual regression catalogue before screen changes.

**Checkpoint gate:** token contrast; six theme samples; Dynamic Type layouts; no calculation/state changes.

### Wave 2 — navigation and global surfaces

Implement screen shell, headers, floating dock/FAB visibility rules and overlay hierarchy while retaining current routes.

**Checkpoint gate:** four tabs, repeat-tap scroll, safe areas, keyboard, pushed routes, Android Back, VoiceOver/TalkBack focus and no blank-scene animations.

### Wave 3 — Add architecture

Introduce origin metadata and approved quick-action set/More; preserve current phase repair, catalogue, forms, validation and atomic saves.

**Checkpoint gate:** exhaustive journey matrix, no overlapping native modals, Back/Cancel/Save by origin, dirty-draft tests, physical iOS/Android stress test.

### Wave 4 — shared components

Migrate fields, pickers, buttons, rows, cards, progress, empty/error/success and disclosure components before core screens.

**Checkpoint gate:** component state coverage, accessibility semantics and all six themes.

### Wave 5 — core tabs

Implement Today hierarchy first, then Money (protect financial measure distinctions), Wealth, and Grow last after Score decision.

**Checkpoint gate per tab:** source-of-truth reconciliation against existing calculations; contextual destination focus; empty/partial/full datasets; small-device and theme recordings.

### Wave 6 — secondary flows and settings

Goals, Cards, Transactions, calculators, comparisons, language, profile, reset and contextual sheets.

**Checkpoint gate:** edit/delete/reversal, persistence failure, disclosure and localization review.

### Wave 7 — motion and polish

Apply only approved hierarchy/state motion after layouts stabilize. Tune celebrations and haptics.

**Checkpoint gate:** no task-blocking animation, reduced-motion parity, 60fps/device review and no replay on unrelated state updates.

### Wave 8 — accessibility and device verification

Treat accessibility as a final integrated verification wave in addition to annotations/checks in every earlier wave.

**Checkpoint gate:** VoiceOver/TalkBack, keyboard, Dynamic Type, contrast, touch targets, tablet/small-phone, light/dark/style matrix, persistence interruption and full financial regression suite.

Do not combine Add navigation changes with calculation refactors. Do not redesign Score in the Grow wave without a separately approved Score v2 specification.

---

## 22. Claude Design handoff brief

> Create **Nolie Design 5**, a holistic, engineering-ready redesign of the current Nolie mobile product. Nolie is an Australian, manual-entry personal-finance and wealth companion that should feel like a calm, intelligent coach—not a conventional transaction tracker. Its top-level areas are Today, Money, Wealth and Grow.
>
> The current baseline is a functioning Expo/React Native app with local persistence, rich manual financial data, contextual daily guidance, available-until-payday and money-flow logic, wealth/net-worth tracking, goals, cards/debt/repayment flows, educational calculators, three colour styles in light/dark, and a newly stabilised floating four-tab dock with detached `+`. Treat this audit—not Design 4—as current product truth.
>
> Preserve all working customer data logic, calculations, validation, recurrence/date behaviour, repayment accounting, balance-effect reversals, persistence semantics, task atomicity and compliance constraints. Reorganize and restyle their presentation only. Do not imply bank connectivity, regulated financial advice, credit assistance, debt-management services, product recommendations, guaranteed outcomes or an operational AI assistant.
>
> The desired visual direction is premium but approachable: calm, floaty, ambient and polished; strong hierarchy; thoughtful restrained colour; not sterile; accessible in every supported light/dark theme. The floating dock and detached `+` are moving in the right direction.
>
> Focus on: a clear hierarchy within each of the four areas; one coherent surface/overlay system; stable task workspaces; a complete six-theme system; accessible motion; responsive small-screen/tablet rules; and consistent origin-aware task completion.
>
> Resolve the Add duplication explicitly. Recommend a small quick-action set, with a centre **More**/all-options action while Ask Nolie is unavailable. Direct quick actions should open the task workspace directly and Back/Cancel should return to the initiating screen. More opens the complete Add catalogue. Only tasks initiated from the catalogue should Back to it. Preserve the repaired invariant that the quick tray is not a native modal and fully closes before the single native Add sheet opens.
>
> Known problems to solve include: the nine-action tray versus fourteen-option catalogue; conflicting income/debt/asset terminology; quick-origin Back exposing the catalogue; “Add asset” currently opening an investment/ETF form; dense Today and Grow pages; ambiguous Wealth “Total Wealth” naming; mixed sheet/modal/field systems; hardcoded colour risks; incomplete Dynamic Type/responsive specifications; and legacy Lulu/Navilo/AI language.
>
> Make explicit proposals—not silent assumptions—for: canonical Add architecture; quick-action count/content; centre label; future Ask Nolie location; Back/Cancel/Save rules; floating nav visibility on details/forms/keyboards; overlay hierarchy; theme scope; Score treatment; stale/manual-data freshness; and incomplete/future features.
>
> Score v2 is a separate workstream. Do not present the current Nolie Score as the final Design 5 Score. Ask Nolie has no operational backend and is a non-goal. Authentication, bank feeds, financial product selection, new financial calculations and implementation code are also non-goals.
>
> Deliver: updated IA; all current screens/overlays and states; six theme variants; tokens; full component library; floating-nav spec; Add-flow prototype; motion and reduced-motion specs; accessibility annotations; responsive rules; copy/compliance notes; engineering measurements; preserve/change notes; and phased implementation recommendations.
>
> Inputs supplied separately: this audit report; Nolie Design 4 PDF; Nolie Design 4 Motion Addendum PDF; and relevant device recordings/screenshots. Use Design 4 only for visual/motion inspiration because it may contain stale Navilo branding, older navigation/Add architecture and outdated concepts.

---

## 23. Evidence appendix

### Complete route index

| Navigator | Routes |
|---|---|
| Root conditional | WelcomeFlow or RootStack depending on persistence/`hasSeenIntro` |
| RootStack | Main, Settings, Language, Goals, Cards, Transactions, MoneyDetail, GrowDetail, SavingsComparison, CompoundCalculator, EmergencyFund, HomeLoanCalculator, ResetLulu |
| Main tabs | Today, Money, Wealth, Grow |
| Non-route overlays | QuickActionsTray, AddAnythingSheet, AskLuluSheet dormant, all add/edit modals, reminder/detail/info/options/date/allocation/debt/score/celebration/persistence surfaces |

### Screen-to-file index

| Screen | Source |
|---|---|
| App shell | `App.tsx` |
| Root/tab navigation | `src/navigation/RootNavigator.tsx`, `MainTabNavigator.tsx` |
| Welcome | `src/screens/welcome/WelcomeFlow.tsx` |
| Today | `src/screens/today/TodayScreen.tsx` |
| Money | `src/screens/money/MoneyScreen.tsx` |
| Wealth | `src/screens/wealth/WealthScreen.tsx` |
| Grow | `src/screens/discover/DiscoverScreen.tsx` |
| Goals | `src/screens/goals/GoalsScreen.tsx` |
| Cards | `src/screens/cards/CardsScreen.tsx` |
| Transactions | `src/screens/transactions/TransactionsScreen.tsx` |
| Settings/language/reset | `src/screens/settings/SettingsScreen.tsx`, `LanguageScreen.tsx`, `ResetLuluScreen.tsx` |
| Calculators/detail utilities | `src/screens/discover/SavingsComparisonScreen.tsx`, `CompoundCalculatorScreen.tsx`, `EmergencyFundScreen.tsx`, `HomeLoanCalculatorScreen.tsx` |

### Key component index

| Domain | Sources |
|---|---|
| Floating navigation/Add | `src/components/navigation/FloatingNavBar.tsx`, `FloatingAddButton.tsx`, `QuickActionsTray.tsx`, `quickActions.ts`, `AddAnythingSheet.tsx`, `floatingAddTransition.ts`, `addWorkspaceTransitionController.ts`, `src/navigation/floatingNavGeometry.ts` |
| Shared UI | `src/components/shared/Screen.tsx`, `SectionCard.tsx`, `Button.tsx`, `KeyboardSheet.tsx`, `OptionsSheet.tsx`, `InfoSheet.tsx`, `EmptyState.tsx`, `ProgressBar.tsx` |
| Money | `src/components/money/*`, `src/components/dashboard/QuickAddModal.tsx`, `src/components/income/*` |
| Wealth/debt/cards | `src/components/wealth/*`, `src/components/credit/*`, `src/components/debt/*` |
| Goals | `src/components/goals/*` |
| Today/reminders | `src/components/today/*` |
| Grow/health/learning | `src/components/discover/*`, `src/components/health/*`, `src/components/unlock/*` |
| Celebrations/persistence | `src/components/celebrations/*`, `UnsavedChangesBanner.tsx`, `ResetPendingOverlay.tsx` |

### Theme/token source index

- Core colours, spacing, radii, typography and minimum target: `src/theme/tokens.ts`.
- Three-style semantic palette: `src/theme/palettes.ts`.
- Scheme/style selection, shadows/glows and exposed theme context: `src/theme/ThemeContext.tsx`.
- Targeted contrast corrections: `src/theme/contrastOverrides.ts`.
- Shared floating geometry/safe-area clearance: `src/navigation/floatingNavGeometry.ts`.

### Data/calculation source index

- Models and documented relationships: `src/types/models.ts`.
- State transitions, persistence orchestration and public actions: `src/state/AppStateContext.tsx`.
- Persistence/migrations: `src/lib/storage.ts`, `src/lib/persistenceState.ts`.
- Money availability/plan/timeline/monthly flow: `src/lib/calculations/safeToSpend.ts`, `moneyPlan.ts`, `moneyTimeline.ts`, `monthlySummary.ts`, `moneyFlowBreakdown.ts`, `repaymentAccounting.ts`.
- Wealth: `wealthDefinitions.ts`, `wealthProjection.ts`, `propertyEquity.ts`, `portfolioInsight.ts`, `assetGroups.ts`.
- Goals/savings: `goalAllocation.ts`, `savingsAllocation.ts`, `emergencyFund.ts`.
- Recurrence/reminders/repayments: `recurringSchedule.ts`, `reminders.ts`, `reminderInteractionLifecycle.ts`, `bnpl.ts`, `bnplHandoff.ts`.
- Score/journey/opportunities: `luluScore.ts`, `scoreExplanation.ts`, `scoreChipPresentation.ts`, `wealthJourney.ts`, `opportunities.ts`, `moneyOpportunities.ts`.

### Relevant test index

- Test evidence classes and limitations: `tests/README.md`.
- Floating dock/tray/phase/rendering: `tests/floating-navigation.test.ts`, `floating-add-transition.test.ts`, `rendered/floating-navigation.render.test.tsx`.
- Add workspaces/drafts/transitions: `tests/add-anything-sheet-*.test.ts`, `add-workspace-*.test.ts`, `add-asset-*.test.ts`, nested/parked-draft tests.
- Financial integrity: money parsing, Safe to Spend, Everyday account, move money, income destination, goal allocation, BNPL, repayment and deletion tests.
- Today/Grow/accessibility/motion/contrast: Pass 2B–2E suites and all `tests/rendered/*`.
- Current audit run: legacy suite passed; rendered **15/15 suites, 112/112 tests**; console warnings noted in Section 1.

### Relevant product/document index

- `AGENTS.md`: Expo-version instruction.
- `CLAUDE.md`: repository working protocol, product/financial/compliance/testing principles and statement that legacy product naming exists.
- `tests/README.md`: test execution and evidence-class caveats.
- `app.json`, `package.json`: platform and stack.
- Git checkpoints from `f467b11` through `6f304e9`, especially Add workspace, Everyday accounts, Today/Grow passes, Nolie rebrand, Worth Knowing and floating navigation.
- Exact Design 4 PDFs: **absent from repository; supply separately**.

### Evidence gaps requiring manual testing or confirmation

1. Product-owner confirmation of onboarding disclosure/Skip behaviour.
2. Compliance review of Score, AI, credit/debt, savings comparison, market and home wording.
3. Usage evidence to choose the quick-action subset.
4. Device recordings for current visual hierarchy across six themes.
5. iOS and Android tray→sheet stress testing, including rapid taps, Back and interruptions.
6. VoiceOver/TalkBack, keyboard, Dynamic Type and focus restoration.
7. Small-phone and tablet composition, especially tray/catalogue/onboarding.
8. Source/freshness status of market/savings comparison data.
9. Thai translation completeness and layout expansion.
10. Formal Score v2 product specification and any future Ask Nolie specification.

---

**End of audit.** Recommendations in this document are design proposals. Repository facts and owner direction remain distinct, and no recommendation authorizes changes to financial behaviour, compliance constraints or implementation.
