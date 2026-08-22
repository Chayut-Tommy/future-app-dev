/**
 * Nolie Design 5.1 Wave 8 — Grow composition.
 *
 * PRESENTATION ONLY. This module owns the page's hierarchy, the Score's
 * display state, its containment wording and the disposition of every
 * surface Wave 8 retired. It performs no financial arithmetic, reproduces
 * no selector, parses no displayed value, holds no state and imports no
 * engine in order to recreate its result.
 *
 * The Score's own numbers and states arrive already resolved by
 * `selectScoreChipPresentation` / `toScoreGaugePresentation`, exactly as
 * before; this module only decides what the page does with them.
 */

// ---------------------------------------------------------------------------
// The canonical hierarchy
// ---------------------------------------------------------------------------

/**
 * The owner's locked Wave 8 order. Score leads, because Grow's purpose is
 * long-term progress and the page previously opened with a disclaimer and
 * buried its lead below a competing Journey hero.
 *
 * This supersedes the implementation plan's Journey-first ordering and its
 * Score-footnote placement. Today's own quiet Score footnote is unaffected.
 */
export const GROW_SECTIONS = ['score', 'goals', 'journey', 'tools', 'learn', 'disclaimer'] as const;
export type GrowSection = (typeof GROW_SECTIONS)[number];

/** Score is the single hero. Journey is a highlighted SUPPORTING surface —
 * a second hero directly beneath the first is what made the old page read
 * as two competing openings. */
export type SectionEmphasis = 'hero' | 'highlighted' | 'standard' | 'footer';

const EMPHASIS: Record<GrowSection, SectionEmphasis> = {
  score: 'hero',
  goals: 'standard',
  journey: 'highlighted',
  tools: 'standard',
  learn: 'standard',
  disclaimer: 'footer',
};

export function sectionEmphasis(section: GrowSection): SectionEmphasis {
  return EMPHASIS[section];
}

/** Exactly one hero on the page. */
export function heroSections(): GrowSection[] {
  return GROW_SECTIONS.filter((s) => EMPHASIS[s] === 'hero');
}

export const GROW_SECTION_TITLE: Record<Exclude<GrowSection, 'disclaimer' | 'score'>, string> = {
  goals: 'Your goals',
  journey: 'Your journey',
  tools: 'Tools',
  learn: 'Learn',
};

// ---------------------------------------------------------------------------
// Score display state and containment
// ---------------------------------------------------------------------------

/**
 * The three words a valid Score must carry, visibly, without opening the
 * explanation sheet. This is the EXISTING production string from
 * scoreChipPresentation.ts — reproduced here as a constant the tests can
 * assert against, never re-authored. No new compliance-sensitive wording is
 * introduced by this wave.
 */
export const SCORE_CONTAINMENT = 'Interim · Based on what you’ve recorded · Not a credit score';

/** The three clauses, so a test can prove each is visible rather than
 * matching one long string that could silently lose a clause. */
export const SCORE_CONTAINMENT_CLAUSES: readonly string[] = ['Interim', 'Based on what you’ve recorded', 'Not a credit score'];

/** The one wording every non-valid state uses. Also existing production
 * copy. From the customer's point of view "locked" and "unavailable" are
 * the same fact: Nolie does not have enough yet. */
export const SCORE_UNAVAILABLE_TEXT = 'Not enough recorded yet';

/**
 * Whether a resolved presentation state may show a number at all.
 *
 * Deliberately a whitelist of ONE. A locked, incomplete, invalid,
 * out-of-range, error or unavailable state all fall through to false, so a
 * new state added later cannot accidentally start rendering a figure — and
 * an invalid Score can never be clamped into range or shown as a zero.
 */
export function scoreMayShowNumber(state: string): boolean {
  return state === 'available';
}

/**
 * The number to render, or null. Takes the already-resolved presentation
 * union so the caller never reaches for `.value` on a state that does not
 * carry one — the type system enforces what `scoreMayShowNumber` states.
 */
export function scoreNumberOrNull(presentation: { state: 'available'; value: number } | { state: string }): number | null {
  return presentation.state === 'available' && typeof (presentation as { value?: unknown }).value === 'number'
    ? (presentation as { value: number }).value
    : null;
}

export function scoreSupportingText(state: string): string {
  return scoreMayShowNumber(state) ? SCORE_CONTAINMENT : SCORE_UNAVAILABLE_TEXT;
}

// ---------------------------------------------------------------------------
// Disposition of every surface Wave 8 retired
// ---------------------------------------------------------------------------

/**
 * `unwired` means: removed from Grow's default composition, component file
 * RETAINED and unchanged. Nothing is deleted, and no logic or
 * customer-facing copy in a retained file is touched — the opportunity and
 * debt-coach work is deferred to the future AI-agent specification, not
 * cancelled.
 */
export type SurfaceDisposition = 'kept' | 'unwired' | 'moved';

export const GROW_SURFACE_DISPOSITION: Readonly<Record<string, SurfaceDisposition>> = {
  ScoreRadialGauge: 'kept',
  ScoreExplanationSheet: 'kept',
  JourneyTimeline: 'kept',
  WealthJourneyCard: 'kept',
  LearningCardItem: 'kept',
  LearningPathCard: 'kept',
  // Moved rather than changed: the disclaimer led the page and now closes
  // it; Goals and Journey swapped so Score's supporting content follows it.
  StandingDisclaimer: 'moved',
  Goals: 'moved',
  Journey: 'moved',
  // Deferred to the future AI-agent workstream. Files retained unchanged.
  MoneyOpportunitiesHero: 'unwired',
  OpportunityCard: 'unwired',
  DebtCoachSheet: 'unwired',
  // Deferred pending the live-data source decision. File retained.
  MarketPulsePreview: 'unwired',
  // Superseded by the flat Tools and Learn sections.
  ExploreCategorySection: 'unwired',
  // Duplicated Journey's forward-looking content. File retained.
  FutureYouCard: 'unwired',
  SavingsCoachCard: 'unwired',
  SavingStrategyCalculator: 'unwired',
  SavingFactsCard: 'unwired',
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * Exactly four tiles, on the EXISTING routes. No fifth tile, no AI tile.
 * The Home loan label carries the already-approved wording: "Can I buy a
 * home?" implied an eligibility answer the app cannot give.
 */
export interface GrowTool {
  key: string;
  label: string;
  supporting: string;
  route: string;
  icon: string;
}

export const GROW_TOOLS: readonly GrowTool[] = [
  { key: 'savings', label: 'Savings comparison', supporting: 'Compare accounts and rates', route: 'SavingsComparison', icon: 'wallet-outline' },
  { key: 'compound', label: 'Compound growth', supporting: 'See how contributions could grow', route: 'CompoundCalculator', icon: 'trending-up-outline' },
  { key: 'emergency', label: 'Emergency fund', supporting: 'How many months your cash covers', route: 'EmergencyFund', icon: 'shield-outline' },
  { key: 'homeloan', label: 'Home loan repayments', supporting: 'Estimate repayments and total interest', route: 'HomeLoanCalculator', icon: 'home-outline' },
];

/** Two columns at ordinary widths; one at 320pt or large text, where two
 * tiles cannot hold a wrapped label without clipping. */
export function toolGridColumns(width: number, fontScale: number): 1 | 2 {
  if (fontScale >= 1.3) return 1;
  if (width < 340) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Wave 8 correction — vector iconography, keyed on STRUCTURED ids
// ---------------------------------------------------------------------------

/**
 * Journey stage and milestone icons.
 *
 * Keyed on the engines' own structured ids — never by parsing a
 * customer-facing string, which would break the moment wording changed and
 * would silently mis-icon a translated label. `wealthJourney.ts` and
 * `achievements.ts` are untouched: they still carry their own `emoji`
 * field, and this mapping simply supersedes it at the presentation layer.
 *
 * An id this map has not been taught resolves to the neutral fallback, so a
 * milestone added later renders ordinary rather than broken.
 */
export const JOURNEY_ICON_FALLBACK = 'ellipse-outline';

export const JOURNEY_STAGE_ICONS: Readonly<Record<string, string>> = {
  start: 'flag-outline',
  income: 'briefcase-outline',
  cash: 'wallet-outline',
  bills: 'calendar-outline',
  goal: 'flag-outline',
  debt_picture: 'card-outline',
  card_reduced: 'trending-down-outline',
  non_mortgage_debt_free: 'checkmark-circle-outline',
  liability_repaid: 'checkmark-done-outline',
  first_investment: 'trending-up-outline',
  first_property: 'home-outline',
  positive_net_worth: 'layers-outline',
  retirement_added: 'shield-checkmark-outline',
  retirement_one_year: 'shield-checkmark-outline',
};

export const MILESTONE_ICONS: Readonly<Record<string, string>> = {
  started_lulu: 'flag-outline',
  added_income: 'briefcase-outline',
  added_savings: 'wallet-outline',
  added_first_asset: 'cube-outline',
  created_first_goal: 'flag-outline',
  completed_first_goal: 'trophy-outline',
  emergency_fund: 'umbrella-outline',
  first_investment: 'trending-up-outline',
  diversified_portfolio: 'grid-outline',
  home_deposit: 'home-outline',
  paid_off_card: 'card-outline',
  paid_off_car_loan: 'car-outline',
  paid_off_mortgage: 'business-outline',
  started_super: 'shield-checkmark-outline',
  super_one_year_income: 'shield-checkmark-outline',
  financial_freedom: 'star-outline',
};

export function journeyStageIcon(id: string): string {
  return JOURNEY_STAGE_ICONS[id] ?? JOURNEY_ICON_FALLBACK;
}

export function milestoneIcon(id: string): string {
  return MILESTONE_ICONS[id] ?? JOURNEY_ICON_FALLBACK;
}

/**
 * A milestone's state, and the NON-COLOUR cue that must accompany its tint.
 * Colour alone can never carry completed/current/locked.
 */
export type MilestoneState = 'completed' | 'current' | 'locked';

export function milestoneStateIcon(state: MilestoneState, id: string): string {
  if (state === 'completed') return 'checkmark-circle';
  if (state === 'locked') return 'lock-closed-outline';
  return milestoneIcon(id);
}

export function milestoneStateLabel(state: MilestoneState): string {
  return state === 'completed' ? 'Completed' : state === 'locked' ? 'Locked' : 'Next up';
}

// ---------------------------------------------------------------------------
// Learn — the three pruned rows
// ---------------------------------------------------------------------------

/**
 * Wave 8 correction D — three standalone Learn rows the owner removed from
 * Grow. Unwired by ID, not deleted: `learningCards.ts` keeps all three
 * definitions, so nothing that reads that catalogue elsewhere is affected,
 * and restoring them is a one-line change.
 *
 * Keyed on id rather than title so a copy edit cannot silently un-prune a
 * row, and a translated title cannot fail to match.
 */
export const GROW_PRUNED_LEARNING_CARD_IDS: readonly string[] = ['how-super-works', 'why-contribute-early', 'deductible-records'];

export function isPrunedFromGrow(cardId: string): boolean {
  return GROW_PRUNED_LEARNING_CARD_IDS.includes(cardId);
}

// ---------------------------------------------------------------------------
// Score hero fact rows
// ---------------------------------------------------------------------------

/**
 * Wave 8 correction A — "Strongest area" and "Next opportunity" were two
 * lines of equally weighted grey text. They are now two visually distinct
 * fact rows, each with its own restrained icon and its own semantic role.
 *
 * `positive` is used ONLY for a genuine strength; `caution` is NOT used for
 * an ordinary opportunity to improve — an opportunity is informational, and
 * amber would read as a warning about the customer.
 */
export type ScoreFactKind = 'strength' | 'opportunity';

export function scoreFactIcon(kind: ScoreFactKind): string {
  return kind === 'strength' ? 'ribbon-outline' : 'arrow-up-circle-outline';
}

export function scoreFactLabel(kind: ScoreFactKind): string {
  return kind === 'strength' ? 'Strongest area' : 'Next opportunity';
}
