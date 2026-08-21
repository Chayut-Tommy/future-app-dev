/**
 * Nolie Design 5.1 Wave 4 device correction — ONE icon language for the
 * whole Add experience.
 *
 * The owner's recording showed the Add catalogue, the category picker and
 * the Goal form rendering platform emoji as functional UI icons. Emoji are
 * multicoloured, styled by the operating system rather than by Nolie, and
 * change shape between iOS versions and between iOS and Android — so the
 * same screen reads differently on two devices and never reads as one
 * designed system.
 *
 * Every Add surface now resolves its icon here instead of carrying its own
 * emoji string. This module is deliberately:
 *
 * - PURE and RN-free, so `tests/design5-add-iconography.test.ts` can load it
 *   under plain tsx and check every single mapped name against Ionicons' own
 *   shipped glyph map. A name that does not exist would otherwise render as
 *   an invisible box only a device could reveal.
 * - NAMES ONLY. No colour, no size, no container. Those belong to
 *   `components/shared/AddIcon.tsx`, which is the single renderer.
 *
 * Icon family: Ionicons `-outline`, already a dependency. Wave 4 adds no
 * icon package (no Lucide), per the standing constraint.
 */

/** An Ionicons glyph name. Kept as a plain string here so this module stays
 * importable without React Native; `AddIcon` performs the one cast, and the
 * iconography test proves every name below is real. */
export type AddIconName = string;

/**
 * The six restrained tone families (Wave 4 closure). Domain identity, never
 * financial status — see `ADD_ICON_TONES` in src/theme/semanticTokens.ts for
 * why `coral` is not the error red and `mint` is not the success green.
 *
 *   ocean   everyday money and transactions
 *   teal    transfers and accounts
 *   mint    income and savings
 *   amber   bills and recurring commitments
 *   violet  wealth, investments, property, retirement and goals
 *   coral   debt and credit
 *
 * Assignment is by DOMAIN and is stable: the same conceptual item resolves
 * to the same tone in the tray, the catalogue, a picker row and a card.
 */
export type AddIconTone = 'ocean' | 'teal' | 'mint' | 'amber' | 'violet' | 'coral';

export interface AddIconSpec {
  name: AddIconName;
  tone: AddIconTone;
}

export const ADD_ICON_TONES_LIST: readonly AddIconTone[] = ['ocean', 'teal', 'mint', 'amber', 'violet', 'coral'];

/** The fallback for any id this map has not been taught. Deliberately a
 * neutral shape rather than a "missing" glyph — a category Nolie has not
 * seen should look ordinary, not broken. */
export const FALLBACK_ICON: AddIconName = 'pricetag-outline';
export const FALLBACK_TONE: AddIconTone = 'ocean';
export const FALLBACK_SPEC: AddIconSpec = { name: FALLBACK_ICON, tone: FALLBACK_TONE };

// ---------------------------------------------------------------------------
// 1. The six quick actions (the tray)
// ---------------------------------------------------------------------------
export const QUICK_ACTION_ICONS: Record<string, AddIconSpec> = {
  record_spending: { name: 'cart-outline', tone: 'ocean' },
  income_received: { name: 'cash-outline', tone: 'mint' },
  add_bill: { name: 'calendar-outline', tone: 'amber' },
  move_money: { name: 'swap-horizontal-outline', tone: 'teal' },
  add_goal: { name: 'flag-outline', tone: 'violet' },
  more: { name: 'ellipsis-horizontal', tone: 'ocean' },
};

// ---------------------------------------------------------------------------
// 2. The fourteen Add catalogue tasks (AddAnythingKind)
// ---------------------------------------------------------------------------
export const ADD_TASK_ICONS: Record<string, AddIconSpec> = {
  expense: { name: 'cart-outline', tone: 'ocean' },
  income: { name: 'briefcase-outline', tone: 'mint' },
  income_received: { name: 'cash-outline', tone: 'mint' },
  bill: { name: 'calendar-outline', tone: 'amber' },
  transfer: { name: 'swap-horizontal-outline', tone: 'teal' },
  cash: { name: 'wallet-outline', tone: 'teal' },
  savings: { name: 'business-outline', tone: 'mint' },
  everyday: { name: 'card-outline', tone: 'teal' },
  investment: { name: 'trending-up-outline', tone: 'violet' },
  property: { name: 'home-outline', tone: 'violet' },
  retirement: { name: 'shield-checkmark-outline', tone: 'violet' },
  liability: { name: 'document-text-outline', tone: 'coral' },
  creditCard: { name: 'card', tone: 'coral' },
  goal: { name: 'flag-outline', tone: 'violet' },
};

// ---------------------------------------------------------------------------
// 3. Transaction categories (the seeded category ids)
// ---------------------------------------------------------------------------
export const CATEGORY_ICONS: Record<string, AddIconSpec> = {
  'cat-salary': { name: 'briefcase-outline', tone: 'mint' },
  'cat-side-hustle': { name: 'laptop-outline', tone: 'mint' },
  'cat-investment-income': { name: 'trending-up-outline', tone: 'violet' },
  'cat-rental-income': { name: 'home-outline', tone: 'violet' },
  'cat-gift': { name: 'gift-outline', tone: 'mint' },
  'cat-bonus': { name: 'gift-outline', tone: 'mint' },
  'cat-other-income': { name: 'add-circle-outline', tone: 'mint' },
  'cat-rent': { name: 'home-outline', tone: 'amber' },
  'cat-mortgage': { name: 'home-outline', tone: 'amber' },
  'cat-groceries': { name: 'cart-outline', tone: 'ocean' },
  'cat-dining': { name: 'restaurant-outline', tone: 'ocean' },
  'cat-transport': { name: 'car-outline', tone: 'ocean' },
  'cat-shopping': { name: 'bag-handle-outline', tone: 'ocean' },
  'cat-travel': { name: 'airplane-outline', tone: 'ocean' },
  'cat-subscriptions': { name: 'play-circle-outline', tone: 'amber' },
  'cat-health': { name: 'fitness-outline', tone: 'ocean' },
  'cat-entertainment': { name: 'film-outline', tone: 'ocean' },
  'cat-utilities': { name: 'flash-outline', tone: 'amber' },
  'cat-insurance': { name: 'shield-checkmark-outline', tone: 'amber' },
  'cat-debt': { name: 'card-outline', tone: 'coral' },
  'cat-other-expense': { name: 'add-circle-outline', tone: 'ocean' },
};

// ---------------------------------------------------------------------------
// 4. Bill types (keyed by the preset's own label, which is its identity)
// ---------------------------------------------------------------------------
export const BILL_TYPE_ICONS: Record<string, AddIconSpec> = {
  Rent: { name: 'home-outline', tone: 'amber' },
  Mortgage: { name: 'business-outline', tone: 'amber' },
  Utilities: { name: 'flash-outline', tone: 'amber' },
  Phone: { name: 'phone-portrait-outline', tone: 'amber' },
  Internet: { name: 'wifi-outline', tone: 'amber' },
  Gym: { name: 'barbell-outline', tone: 'amber' },
  Subscription: { name: 'play-circle-outline', tone: 'amber' },
  Car: { name: 'car-outline', tone: 'amber' },
  'Car Loan': { name: 'car-sport-outline', tone: 'coral' },
  'Personal Loan': { name: 'document-text-outline', tone: 'coral' },
  Insurance: { name: 'shield-checkmark-outline', tone: 'amber' },
  Other: { name: 'ellipse-outline', tone: 'amber' },
};

// ---------------------------------------------------------------------------
// 5. Income sources (the same category ids the income form offers)
// ---------------------------------------------------------------------------
export const INCOME_SOURCE_ICONS: Record<string, AddIconSpec> = {
  'cat-salary': { name: 'briefcase-outline', tone: 'mint' },
  'cat-side-hustle': { name: 'laptop-outline', tone: 'mint' },
  'cat-investment-income': { name: 'trending-up-outline', tone: 'violet' },
  'cat-rental-income': { name: 'home-outline', tone: 'violet' },
  'cat-gift': { name: 'gift-outline', tone: 'mint' },
  'cat-other-income': { name: 'add-circle-outline', tone: 'mint' },
};

// ---------------------------------------------------------------------------
// 6. Asset and debt types
// ---------------------------------------------------------------------------
export const ASSET_TYPE_ICONS: Record<string, AddIconSpec> = {
  cash: { name: 'wallet-outline', tone: 'teal' },
  savings: { name: 'business-outline', tone: 'mint' },
  everyday: { name: 'card-outline', tone: 'teal' },
  etf: { name: 'trending-up-outline', tone: 'violet' },
  shares: { name: 'trending-up-outline', tone: 'violet' },
  super: { name: 'shield-checkmark-outline', tone: 'violet' },
  crypto: { name: 'logo-bitcoin', tone: 'violet' },
  property: { name: 'home-outline', tone: 'violet' },
  business: { name: 'briefcase-outline', tone: 'violet' },
  car: { name: 'car-outline', tone: 'violet' },
  furniture: { name: 'bed-outline', tone: 'violet' },
  collectibles: { name: 'diamond-outline', tone: 'violet' },
  other: { name: 'cube-outline', tone: 'violet' },
};

export const LIABILITY_TYPE_ICONS: Record<string, AddIconSpec> = {
  mortgage: { name: 'business-outline', tone: 'coral' },
  credit_card: { name: 'card', tone: 'coral' },
  car_loan: { name: 'car-sport-outline', tone: 'coral' },
  personal_loan: { name: 'document-text-outline', tone: 'coral' },
  bnpl: { name: 'bag-handle-outline', tone: 'coral' },
  other: { name: 'ellipse-outline', tone: 'coral' },
};

// ---------------------------------------------------------------------------
// 7. Account / funding-source rows
// ---------------------------------------------------------------------------
export const ACCOUNT_SOURCE_ICONS: Record<string, AddIconSpec> = {
  cash: { name: 'wallet-outline', tone: 'teal' },
  everyday: { name: 'card-outline', tone: 'teal' },
  savings: { name: 'business-outline', tone: 'mint' },
  credit_card: { name: 'card', tone: 'coral' },
  loan: { name: 'document-text-outline', tone: 'coral' },
  other: { name: 'ellipse-outline', tone: 'ocean' },
};

// ---------------------------------------------------------------------------
// 8. Goal purposes (LifeGoalType)
// ---------------------------------------------------------------------------
export const GOAL_PURPOSE_ICONS: Record<string, AddIconSpec> = {
  emergency_fund: { name: 'umbrella-outline', tone: 'violet' },
  house_deposit: { name: 'home-outline', tone: 'violet' },
  holiday: { name: 'airplane-outline', tone: 'violet' },
  investment_target: { name: 'trending-up-outline', tone: 'violet' },
  debt_payoff: { name: 'card-outline', tone: 'coral' },
  car: { name: 'car-outline', tone: 'violet' },
  business: { name: 'briefcase-outline', tone: 'violet' },
  retire_early: { name: 'sunny-outline', tone: 'violet' },
  financial_freedom: { name: 'rocket-outline', tone: 'violet' },
  custom: { name: 'star-outline', tone: 'violet' },
};

/** Every map above, so the iconography gate can walk all of them without
 * having to be told about a new one. */
export const ALL_ADD_ICON_MAPS: Readonly<Record<string, Record<string, AddIconSpec>>> = {
  QUICK_ACTION_ICONS,
  ADD_TASK_ICONS,
  CATEGORY_ICONS,
  BILL_TYPE_ICONS,
  INCOME_SOURCE_ICONS,
  ASSET_TYPE_ICONS,
  LIABILITY_TYPE_ICONS,
  ACCOUNT_SOURCE_ICONS,
  GOAL_PURPOSE_ICONS,
};

/** Resolve a full icon spec — name AND tone — never throwing. */
export function resolveAddIcon(map: Record<string, AddIconSpec>, key: string | null | undefined): AddIconSpec {
  if (!key) return FALLBACK_SPEC;
  return map[key] ?? FALLBACK_SPEC;
}

/** Convenience resolvers, so call sites never index a map directly. Each
 * returns the whole spec, so a call site can never take the glyph without
 * its tone and reintroduce the uniformly-pale look. */
export const categoryIcon = (categoryId: string) => resolveAddIcon(CATEGORY_ICONS, categoryId);
export const addTaskIcon = (kind: string) => resolveAddIcon(ADD_TASK_ICONS, kind);
export const billTypeIcon = (label: string) => resolveAddIcon(BILL_TYPE_ICONS, label);
export const incomeSourceIcon = (categoryId: string) => resolveAddIcon(INCOME_SOURCE_ICONS, categoryId);
export const assetTypeIcon = (type: string) => resolveAddIcon(ASSET_TYPE_ICONS, type);
/** Wave 7 correction — the debt-type resolver. LIABILITY_TYPE_ICONS already
 * existed and was already covered by the iconography gate; only this
 * convenience accessor was missing, because nothing had yet rendered debt
 * types as a picker. */
export const liabilityTypeIcon = (type: string) => resolveAddIcon(LIABILITY_TYPE_ICONS, type);
export const accountSourceIcon = (type: string) => resolveAddIcon(ACCOUNT_SOURCE_ICONS, type);
export const goalPurposeIcon = (purpose: string) => resolveAddIcon(GOAL_PURPOSE_ICONS, purpose);

/** A one-off spec for a glyph that has no domain of its own (a chevron, a
 * tick, a calendar affordance). Tone is explicit at the call site. */
export const iconSpec = (name: AddIconName, tone: AddIconTone = FALLBACK_TONE): AddIconSpec => ({ name, tone });
