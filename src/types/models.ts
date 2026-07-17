export type LifeGoalType =
  | 'emergency_fund'
  | 'house_deposit'
  | 'holiday'
  | 'investment_target'
  | 'debt_payoff'
  | 'car'
  | 'business'
  | 'retire_early'
  | 'financial_freedom'
  | 'custom';

// 'cash' = everyday spending money (also what transactions auto-flow into);
// 'savings' = a distinct interest-bearing account (emergency fund, goal
// savings) — kept separate because they behave, and get coached,
// differently (PRD ask). See computeLiquidCash for calculations that
// genuinely need both combined (e.g. emergency-fund coverage).
export type AssetType = 'cash' | 'savings' | 'etf' | 'shares' | 'super' | 'crypto' | 'property' | 'business' | 'car' | 'furniture' | 'collectibles' | 'other';
export type LiabilityType = 'mortgage' | 'credit_card' | 'car_loan' | 'personal_loan' | 'other';
export type PayFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'irregular';
export type ThemePreference = 'light' | 'dark' | 'system';
export type MoneyGoal = 'save_more' | 'buy_home' | 'build_investments' | 'pay_debt' | 'understand_spending' | 'build_wealth';
export type ConfidenceLevel = 'beginner' | 'learning' | 'confident';

/** One shared, user-selected savings-allocation model (PRD ask: "one shared
 * user-selected Savings allocation model rather than separate defaults
 * across different screens"). `'off'` (or the field being absent) always
 * means $0 — never an implied default percentage. `percent` is a fraction
 * (0.1 = 10%) applied to expected recurring income only; `amount` is a
 * fixed monthly dollar figure, prorated per pay cycle the same way a
 * percentage is. This is a forecasting preference the user opted into, not
 * evidence of actual saved money — see resolveSavingsAllocationMonthly and
 * luluScore.ts's Recorded Cashflow/Emergency Buffer/Wealth Assets Recorded
 * factors, none of which read this setting. */
export interface SavingsAllocationSetting {
  mode: 'off' | 'percent' | 'fixed';
  /** Fraction of expected recurring income, e.g. 0.1 for 10%. Only applies
   * when the user has recurring income — see resolveSavingsAllocationMonthly. */
  percent?: number;
  /** A fixed monthly dollar amount, prorated per cycle like percent mode. */
  amount?: number;
}

export interface RecurringItem {
  id: string;
  type: 'income' | 'expense';
  label: string;
  amount: number;
  frequency: PayFrequency;
  nextDueDate: string; // ISO date
  isFixed: boolean;
  active: boolean;
  /** Ionicons name, chosen from a small bill-type preset — purely visual. */
  icon?: string;
  /** Present when this bill was auto-created by the smart loan flow (a
   * mortgage/car/personal loan repayment) — the foundation for future Lulu
   * intelligence that understands this expense also reduces a liability
   * over time, unlike a pure expense such as rent. Not currently used to
   * auto-adjust the balance (no real amortisation schedule is tracked). */
  linkedLiabilityId?: string;
  /** Income items only — true when the user genuinely doesn't know their
   * next payment date (irregular freelance/casual work). `nextDueDate`
   * still holds a placeholder value so it can stay a required field
   * everywhere else, but scheduling/reminder/timeline logic must check this
   * flag rather than trusting that date at face value (PRD ask: Navilo
   * never guesses a payday for irregular income). */
  nextDueDateUnknown?: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
}

export type PaymentSource = 'cash' | 'credit_card' | 'loan' | 'other';

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  categoryId: string;
  date: string; // ISO date
  note?: string;
  /** Expense only. Absent = 'cash' (backward compatible with pre-existing
   * transactions, which always reduced Cash). Determines which part of the
   * Wealth picture this expense actually affects — an expense is not always
   * a cash outflow. */
  paymentSource?: PaymentSource;
  /** Set when paymentSource === 'credit_card' — the card whose balance this
   * expense increased. */
  creditCardId?: string;
  /** Set when paymentSource === 'loan' — the liability whose balance this
   * expense increased. */
  liabilityId?: string;
  /** Absent/'manual' today (every transaction is user-entered). Reserved so a
   * future bank-feed integration can flow through the same addTransaction
   * path and be distinguished in the UI without a schema change. */
  source?: 'manual' | 'bank_feed';
  /** Set only when this transaction was auto-created by confirming a
   * recurring item was paid/received (SmartReminderCard) — distinguishes it
   * from a genuinely ad-hoc transaction (a bonus, gift, refund) the user
   * logged directly. Recurring income already drives every future-looking
   * calculation via the recurring item itself; without this flag, a
   * confirmed payday would get double-counted as "ad-hoc" income too (PRD
   * ask, §5: keep recurring income and one-off income transactions
   * completely separate). */
  recurringItemId?: string;
}

export type GoalPriority = 'high' | 'medium' | 'flexible';

export interface Goal {
  id: string;
  name: string;
  lifeGoalType: LifeGoalType;
  targetAmount: number | null;
  currentAmount: number;
  targetDate: string | null;
  /** Lulu's calculated required monthly contribution (targetAmount/targetDate
   * driven) — kept in sync automatically, not hand-typed. Powers both the
   * projected completion date here and the Safe to Spend goal reservation. */
  estimatedMonthlyContribution?: number;
  /** Determines funding order when multiple goals compete for the same
   * available money — absent = 'medium'. */
  priority?: GoalPriority;
  status: 'active' | 'completed' | 'archived';
}

export interface Asset {
  id: string;
  type: AssetType;
  label: string;
  currentValue: number;
  tickerSymbol?: string;
  /** Only meaningful for cash-type assets used as a savings account (Savings Optimiser). */
  interestRate?: number;
  /** Only meaningful for `cash`/`savings` — whether this balance counts
   * toward short-term Money calculations (Available Until Payday, Money
   * Flow), as distinct from wealth reporting (Net Wealth, Wealth Map,
   * Emergency Fund coverage), which always includes every cash/savings
   * asset regardless of this flag (PRD ask: a balance can correctly count
   * as recorded wealth without being available for everyday bills — e.g. a
   * house deposit or reserved savings). Absent means "use the default for
   * this asset's type" — see `resolveIncludeInMoneyCalculations` in
   * `liquidAssets.ts`, never re-derive the default inline. Defaults: cash
   * = included, savings = excluded until the user opts in (PRD ask: never
   * silently pool all savings into short-term spending estimates). */
  includeInMoneyCalculations?: boolean;
}

export interface Liability {
  id: string;
  type: LiabilityType;
  label: string;
  currentBalance: number;
  interestRate?: number;
  /** Present only for liabilities auto-synced from a CreditCard — see
   * AppStateContext's credit card actions. Never set by the generic
   * add/edit-liability form. */
  creditCardId?: string;
  /** Set when a mortgage is added through the smart flow, which also
   * creates a matching recurring "Home Loan Repayment" bill — lets Lulu
   * nudge for a balance update a few months in, since the balance drifts
   * from the recurring repayment amount alone. */
  createdAt?: string;
  balanceReminderDismissed?: boolean;
  /** Links a mortgage to the Property asset it's secured against (PRD ask:
   * someone with a $1M property and $500k mortgage has a very different
   * picture than $500k of unsecured debt — Lulu should be able to show
   * home equity, not just treat it as debt). Only meaningful for
   * type === 'mortgage'; references an Asset with type === 'property'. */
  linkedPropertyAssetId?: string;
}

export interface CreditCard {
  id: string;
  issuer: string;
  label: string;
  creditLimit: number;
  currentBalance: number;
  dueDay: number; // day of month
  minimumPayment: number;
  apr?: number;
}

export interface UserProfile {
  name: string;
  currency: string;
  theme: ThemePreference;
  hasSeenIntro: boolean;
  /** Always normalized to a true monthly equivalent via toMonthlyAmount —
   * every calculation in the app reads this directly and can assume it's
   * already monthly (PRD bug report: previously the raw entered amount was
   * stored here unconverted, so "$1,000 weekly" was treated as
   * "$1,000/month" everywhere). */
  monthlyIncome: number;
  /** The raw amount the user actually typed, at payFrequency — kept
   * separately so the edit form can show back exactly what they entered
   * (not a reverse-engineered monthly value) and Money Engine can show a
   * "$1,000 paid weekly" caption. Absent on data saved before this field
   * existed. */
  incomeAmount?: number;
  /** Which income category the user picked when setting this up (a
   * Category id, e.g. 'cat-salary') — purely presentational context for
   * Money Engine's income row; doesn't affect any calculation. */
  incomeSource?: string;
  payFrequency: PayFrequency;
  nextPayday: string | null; // ISO date
  /** Highest Score milestone (10/20/.../100) already celebrated — prevents
   * re-firing the same celebration on every re-render, and lets a score
   * that jumps past several bands at once still only celebrate the highest
   * one reached (PRD ask, §6: celebrate every major milestone, once each). */
  highestScoreMilestoneCelebrated?: number;
  /** Set once, the first time `moneyPictureChecklistDismissed` becomes
   * true — marks that `highestScoreMilestoneCelebrated` has been silently
   * snapshotted to whatever band the score was already in, so building the
   * initial money picture (which can jump the score several bands in
   * minutes) is never misread as a genuine improvement worth celebrating.
   * Score-milestone celebrations are gated on this being true (PRD ask,
   * §4/§5) — only crossings *above* that baseline celebrate. */
  scoreMilestoneBaselineSet?: boolean;
  /** Optional — powers "Your Future" multi-age projection. Never asked at onboarding. */
  age?: number;
  /** Collected once at onboarding — powers early personalisation before enough real data exists. */
  moneyGoal?: MoneyGoal;
  confidenceLevel?: ConfidenceLevel;
  /** Set once the user dismisses the "complete your profile" nudge — never shown again. */
  profileNudgeDismissed?: boolean;
  /** Set once the "Lulu understands you better now" celebration has fired,
   * so it only ever shows the first time the profile becomes complete. */
  profileCompletionCelebrated?: boolean;
  /** 'system' = follow the device locale (§ resolveDeviceLanguage). Defaults
   * to 'system' so a fresh install already speaks the phone's language. */
  language?: 'en' | 'th' | 'system';
  /** Lulu Check-in card gradient — absent/'purple' = the default "AI
   * companion" feel, 'blue' = an alternate "premium wealth assistant"
   * treatment, kept as a Settings toggle so the two can be compared. */
  luluCardTheme?: 'purple' | 'blue';
  /** Set the moment onboarding completes (hasSeenIntro becomes true) — the
   * real signal Lulu's greeting uses to tell "brand new" from "returning"
   * users apart, so it never claims to have "checked overnight" before it
   * has actually seen any data (PRD bug report). */
  firstOpenedAt?: string;
  /** Set once the user tells Debt Coach they have no debt — lets the
   * "build your money picture" checklist mark that step complete without
   * requiring a liability to exist. */
  confirmedNoDebt?: boolean;
  /** Set once the user acknowledges the "Lulu now understands your money
   * picture" completion state, so the guided checklist stops showing. */
  moneyPictureChecklistDismissed?: boolean;
  /** Same "tell Lulu instead of forcing a fake entry" pattern as
   * confirmedNoDebt — not every user has income (e.g. a student) or
   * non-cash assets yet, so the checklist offers an honest "I don't have
   * this yet" alternative for each. */
  confirmedNoIncome?: boolean;
  confirmedCashOnly?: boolean;
  /** Same pattern — the first-run checklist's bills step can be explicitly
   * deferred rather than forcing entry before the user has bills handy
   * (PRD ask, §3B). */
  confirmedBillsLater?: boolean;
  /** The user's optional, explicitly-chosen savings allocation — feeds
   * Available Until Payday, Money Allocation, and Your Future as a
   * forward-looking estimate input only (PRD ask: "one shared user-selected
   * Savings allocation model"). Absent, or `mode: 'off'`, means $0 — Navilo
   * never assumes a percentage on the user's behalf (PRD bug report: a
   * silent 10%-of-income default read as though Navilo had decided how much
   * the user should save). Resolve through `resolveSavingsAllocationMonthly`
   * — never re-derive a percentage or fallback inline. */
  savingsAllocation?: SavingsAllocationSetting;
  /** True once the one-time post-first-income "Plan around your income?"
   * prompt has been shown and handled (allocation saved, "no savings
   * allocation" chosen, "Not now", or any dismissal route) — sticky
   * forever after, never reset by deleting/re-adding income (PRD ask). See
   * `SavingsAllocationPromptContext.tsx` for the presentation coordinator
   * and `storage.ts`'s `migrateSavingsAllocationPromptFlag` for how
   * pre-existing profiles are backfilled to `true` on first load so they
   * are never unexpectedly interrupted. Absent = eligible (new profile, or
   * a profile the migration couldn't confidently classify as
   * pre-existing). */
  savingsAllocationPromptHandled?: boolean;
  /** Set when the user acknowledges the onboarding educational-information
   * disclosure — required before onboarding can finish (PRD ask, §6A:
   * layered disclosure system). ISO date of acknowledgement, not just a
   * boolean, so it can be re-shown if the disclosure copy materially
   * changes in future. */
  disclosureAcknowledgedAt?: string;
  /** Presentation-only preference for how the Money tab's hero frames the
   * same underlying Safe-to-Spend/cash-runway numbers — an employee's
   * "payday" framing doesn't fit a retiree or freelancer (PRD ask, §3/§12:
   * "one shared engine, different presentation"). Absent = inferred from
   * payFrequency (irregular → freelancer, else → employee); never used to
   * change any calculation, only labels. */
  moneyPersona?: 'employee' | 'freelancer' | 'retiree' | 'investor' | 'business_owner';
}

export interface NetWorthHistoryEntry {
  date: string; // ISO date, one entry per calendar day at most
  netWorth: number;
}

export interface LuluScoreHistoryEntry {
  date: string; // ISO date, one entry per calendar day at most
  score: number;
  /** Per-category points at the time of this snapshot — lets Lulu Score
   * v2 explain WHY the score moved (e.g. "+2 Emergency buffer improved")
   * by diffing two real, previously-computed snapshots, never a fabricated
   * explanation. Absent on history saved before v2 (movement explanations
   * simply aren't shown for that gap). */
  categories?: { key: string; points: number }[];
}

/** A savings account rate the user found elsewhere and wants to compare
 * against their own — never a Lulu-asserted "current best rate" (PRD honesty
 * constraint: no fabricated real-world financial product data). */
export interface SavingsComparisonEntry {
  id: string;
  bankName: string;
  rate: number;
  notes?: string;
}

export interface AppData {
  user: UserProfile;
  categories: Category[];
  recurringItems: RecurringItem[];
  transactions: Transaction[];
  goals: Goal[];
  assets: Asset[];
  liabilities: Liability[];
  creditCards: CreditCard[];
  netWorthHistory: NetWorthHistoryEntry[];
  luluScoreHistory: LuluScoreHistoryEntry[];
  savingsComparisons: SavingsComparisonEntry[];
  /** Achievement ids the celebration sheet has already shown — prevents
   * re-celebrating the same milestone on every app open. */
  seenAchievementIds: string[];
  /** LearningCard ids the user has actually opened — powers real "X/Y
   * lessons completed" progress on Discover's Learning Paths (PRD ask: no
   * fabricated progress, only genuine usage). */
  completedLearningCardIds: string[];
}
