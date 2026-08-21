// Nolie Design 5.1 Wave 5 — Today's visual composition, as pure decisions.
//
// The first Wave 5 pass got the ORDER right but left every card looking
// like its pre-5.1 self. Correcting that means a lot of responsive and
// anatomical decisions (how many columns the month card gets, whether a
// priority row's amount fits beside its date, where the goal percentage
// goes at 200% text). Every one of those decisions lives here rather than
// inside a component, for two reasons:
//
//   1. The rendered harness stops mounting new roots from the third
//      render() in a file, so a decision that only exists inside a
//      component can be proven at exactly one width. Here the whole matrix
//      is provable.
//   2. A component that decides its own layout from a raw width tends to
//      grow a second, slightly-different copy of the same rule. One source
//      of truth means the hero, the month card and the goal row can never
//      disagree about what "compact" means.
//
// Pure and RN-free — no colours, no engines, no money arithmetic. Every
// figure this module touches has already been decided by an engine; this
// file only decides SHAPE.

import { designLayout } from '../../theme/semanticTokens';

// ---------------------------------------------------------------------------
// Screen margins
// ---------------------------------------------------------------------------

/** Design 5.1: 20pt screen margins, 16pt at compact width (<=360pt). */
export function todayScreenMargin(windowWidth: number): number {
  return windowWidth <= designLayout.breakpoints.compactMax
    ? designLayout.screenMarginCompact
    : designLayout.screenMargin;
}

// ---------------------------------------------------------------------------
// Dynamic Type
// ---------------------------------------------------------------------------

/** Above this font scale, side-by-side arrangements stop being honest —
 * a label and its figure start competing for the same 40pt. Everything
 * that can stack, stacks. 1.3 is the same threshold briefingTiles.ts
 * already uses for its own column decision (LARGE_TEXT_THRESHOLD), reused
 * deliberately so the page reflows as one piece rather than card by card. */
export const ACCESSIBILITY_TEXT_THRESHOLD = 1.3;

export function isAccessibilityText(fontScale: number): boolean {
  return fontScale >= ACCESSIBILITY_TEXT_THRESHOLD;
}

// ---------------------------------------------------------------------------
// The current-month card's three measures
// ---------------------------------------------------------------------------

export type MonthMeasureLayout = 'threeColumn' | 'twoPlusOne' | 'stacked';

/**
 * Three labelled measures across, dropping to two-plus-one and then to a
 * plain vertical list as space runs out.
 *
 * THE DEFECT THIS FIXES. The previous rule asked only whether a column was
 * wide enough for a LABEL (88pt). It never asked whether the column could
 * hold the AMOUNT. At 390pt each column is ~98pt, which clears 88 — but
 * "+$15,000" set in figureLarge needs roughly 130pt, so the value wrapped,
 * and the only break opportunity in that string is immediately after the
 * sign. The customer saw a lone "+" above "$15,000" and read the figure as
 * broken.
 *
 * The rule now takes the WIDEST FORMATTED VALUE actually being rendered and
 * requires the column to fit it on one line. Three columns are chosen only
 * when every value genuinely fits; otherwise the layout gives up a column
 * and reflows complete metric blocks. Overflow is never resolved by
 * splitting a currency value, and never by shrinking type alone.
 */
export function resolveMonthMeasureLayout(
  windowWidth: number,
  fontScale: number,
  margin: number,
  /** Every formatted value about to be rendered. Omitted only by callers
   * that have none yet, which fall back to the label-width rule alone. */
  values: readonly string[] = []
): MonthMeasureLayout {
  if (isAccessibilityText(fontScale)) return 'stacked';
  const contentWidth = windowWidth - margin * 2 - designLayout.cardPadding * 2;
  const perColumn = (contentWidth - designLayout.inCardStack * 2) / 3;
  const needed = requiredMeasureColumnWidth(values, fontScale);
  if (perColumn >= needed) return 'threeColumn';
  const perHalf = (contentWidth - designLayout.inCardStack) / 2;
  if (perHalf >= needed) return 'twoPlusOne';
  return 'stacked';
}

/** A labelled money measure needs room for "Spending recorded" on one line
 * and an amount beneath it. This is the LABEL floor; the value may demand
 * more, which requiredMeasureColumnWidth accounts for. */
export const MIN_MEASURE_COLUMN_WIDTH = 88;

/**
 * The metric figure's size ladder, largest first.
 *
 * Design 5.1 asks for three metric columns at standard phone width with
 * every value on ONE line, and for a supporting figure well below the
 * hero's 46pt. Those two asks meet a hard physical limit: "+$15,000" set at
 * 28pt needs ~126pt, and a 390pt phone only affords ~98pt per column. No
 * single size satisfies every device.
 *
 * So the size is a DISCRETE, TESTED layout decision, not a constant and not
 * automatic shrink-to-fit: the largest rung at which the widest value
 * genuinely fits the available column. The top rung is `figureLarge` (28)
 * and the bottom is `figureRow` (17) — both real type roles — so the figure
 * never drops below the established readable floor, and never rises above
 * the role Design 5.1 gives a large supporting figure.
 *
 * Every rung uses figureLarge's family, weight and tabular numerals; only
 * the point size steps.
 */
export const MONTH_MEASURE_FIGURE_SIZES: readonly number[] = [22, 20, 17];

/** Wave 6 closure — the top rung is now 22pt, not `figureLarge`'s own 28.
 * A device review found 28pt beside a 14pt label read as the figure
 * shouting over its own name, and it competed with the page's hero. One
 * restrained step down keeps the figure clearly dominant without that.
 * The ROLE is unchanged — family, weight and tabular numerals still come
 * from figureLarge; only the point size steps. */
export const MONTH_MEASURE_FIGURE_SIZE = MONTH_MEASURE_FIGURE_SIZES[0];

/** The bottom of the ladder — `figureRow`. A value is never set smaller
 * than this; the layout gives up a column instead. */
export const MONTH_MEASURE_FIGURE_MIN_SIZE = MONTH_MEASURE_FIGURE_SIZES[MONTH_MEASURE_FIGURE_SIZES.length - 1];

/** The smallest rung a layout may be CHOSEN for. A column count that would
 * force the figure below this is not offered at all — the layout drops a
 * column instead, which reads far better than three cramped numbers. */
export const MONTH_MEASURE_COMFORTABLE_SIZE = 20;

/**
 * The largest ladder rung at which every one of `values` fits `columnWidth`
 * on one line. Falls back to the smallest rung when even that will not fit
 * — at which point `resolveMonthMeasureLayout` has already given up a
 * column, so this only ever runs against a width that can hold it.
 */
export function resolveMonthMeasureFigureSize(columnWidth: number, values: readonly string[]): number {
  for (const size of MONTH_MEASURE_FIGURE_SIZES) {
    if (values.every((v) => estimateFigureWidth(v, size) <= columnWidth)) return size;
  }
  return MONTH_MEASURE_FIGURE_MIN_SIZE;
}

/**
 * How wide a metric column must be for the widest of `values` to render on
 * ONE line at this font scale.
 *
 * The per-character advances below are a deliberately CONSERVATIVE estimate
 * for a semibold tabular figure — tabular digits share one advance by
 * definition, so a digit's width is the only figure that has to be close,
 * and erring high costs at most one column of layout while erring low
 * costs a split currency value. This measures text; it performs no
 * financial arithmetic and never inspects an amount's meaning.
 */
export function requiredMeasureColumnWidth(values: readonly string[], fontScale: number = 1): number {
  // Measured at the COMFORTABLE rung, not the floor. Qualifying a column
  // merely because a value would fit at 17pt buys a third column by making
  // every figure small — and produced a genuinely wrong outcome: a 430pt
  // screen took three columns at 17pt while a 390pt screen took two at
  // 24pt, so the wider device showed the smaller figure. A layout is only
  // offered a column count it can carry at a readable size; the ladder then
  // takes the largest rung that column actually affords.
  let widest = 0;
  for (const v of values) widest = Math.max(widest, estimateFigureWidth(v, MONTH_MEASURE_COMFORTABLE_SIZE * fontScale));
  return Math.max(MIN_MEASURE_COLUMN_WIDTH, Math.ceil(widest));
}

/** The column width three metrics get inside the card at this window
 * width — the same arithmetic resolveMonthMeasureLayout uses, exposed so
 * the component can size its figures from the identical number. */
export function measureColumnWidth(windowWidth: number, margin: number, columns: 1 | 2 | 3): number {
  const contentWidth = windowWidth - margin * 2 - designLayout.cardPadding * 2;
  if (columns === 1) return Math.max(contentWidth, 0);
  const gaps = designLayout.inCardStack * (columns - 1);
  return Math.max((contentWidth - gaps) / columns, 0);
}

/** Advance width as a fraction of the point size, per character class. */
const FIGURE_ADVANCE = {
  digit: 0.6,
  currency: 0.6,
  sign: 0.6,
  separator: 0.3,
  other: 0.55,
} as const;

export function estimateFigureWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') units += FIGURE_ADVANCE.digit;
    else if (ch === ',' || ch === '.' || ch === ' ') units += FIGURE_ADVANCE.separator;
    else if (ch === '+' || ch === MINUS_SIGN || ch === '-') units += FIGURE_ADVANCE.sign;
    else if (ch === '$' || ch === '\u00A3' || ch === '\u20AC') units += FIGURE_ADVANCE.currency;
    else units += FIGURE_ADVANCE.other;
  }
  return units * fontSize;
}

// ---------------------------------------------------------------------------
// Priority rows
// ---------------------------------------------------------------------------

/**
 * Whether a priority row can carry its amount on the same line as its
 * date, or must drop the amount to its own line beneath. Never truncates
 * either — that is the whole point of asking.
 */
export function priorityRowAmountFitsInline(windowWidth: number, fontScale: number): boolean {
  return !isAccessibilityText(fontScale) && windowWidth > designLayout.breakpoints.compactMax;
}

/** Minimum visual height of a priority row, per Design 5.1 p.7 — taller
 * than the 44pt touch minimum because the row carries three lines of
 * content, not one. */
export const PRIORITY_ROW_MIN_HEIGHT = 52;

/** The leading marker tile on a priority row, journey row and goal row —
 * one size across all three so the page has a single left rhythm. */
export const ROW_ICON_TILE_SIZE = 28;

// ---------------------------------------------------------------------------
// Goal row
// ---------------------------------------------------------------------------

/** At ordinary text sizes the percentage sits at the trailing edge of the
 * goal row; at accessibility sizes it moves below the amounts rather than
 * colliding with them. */
export function goalPercentageIsTrailing(fontScale: number): boolean {
  return !isAccessibilityText(fontScale);
}

// ---------------------------------------------------------------------------
// The ambient field
// ---------------------------------------------------------------------------

/**
 * How far the ambient field reaches before it has fully become the canvas.
 * Design 5.1 states 220pt, measured from the top of the screen — so the
 * layer must also cover whatever safe-area inset sits above the content,
 * or on a notched device the fade would finish early and leave a visible
 * seam partway down the hero.
 */
export const AMBIENT_FADE_DISTANCE = 220;

export function ambientFieldHeight(topInset: number): number {
  return AMBIENT_FADE_DISTANCE + Math.max(topInset, 0);
}

/** The gradient's own stops. The ambient role supplies ordered colours
 * light-to-canvas; these positions place the final canvas stop exactly at
 * the fade distance so nothing beyond it is tinted at all. */
export function ambientGradientLocations(stopCount: number): number[] {
  if (stopCount <= 1) return [0];
  // Front-loaded: the tint is strongest at the very top and has mostly
  // resolved by two-thirds of the way down, so the field reads as light
  // falling on the page rather than as a coloured band with an edge.
  return Array.from({ length: stopCount }, (_, i) => {
    const t = i / (stopCount - 1);
    return Number((t * t).toFixed(4));
  });
}

// ---------------------------------------------------------------------------
// The current-month card's three measures, as view models
// ---------------------------------------------------------------------------

export type MonthMeasureTone = 'positive' | 'neutral' | 'caution';

export interface MonthMeasure {
  key: 'moneyIn' | 'spendingRecorded' | 'netRecorded';
  label: string;
  /** ONE already-formatted string — sign and amount together, never two
   * pieces for a caller to join. A sign rendered as its own text node (or
   * its own flex child) is exactly what produced the reported defect: at
   * three columns the only line-break opportunity in "+$15,000" sits right
   * after the sign, so the value split across two lines and read as broken.
   * Keeping it one string means there is nothing to split at that level,
   * and `numberOfLines={1}` at the render site makes it impossible at any
   * level. */
  value: string;
  /** The same measure said aloud, with the sign as a WORD. A screen reader
   * must never stop on a bare "plus", and "−" is not reliably announced. */
  spoken: string;
  tone: MonthMeasureTone;
}

/**
 * Design 5.1 p.7 asks for three labelled recorded measures, preferring
 * "Money in / Spending recorded / Moved to savings".
 *
 * VARIANCE, DELIBERATE AND DOCUMENTED: there is no canonical selector for
 * money moved to savings. `monthlySummary.ts` exposes income, aggregate
 * spending and its three payment-source buckets, and nothing else;
 * `PaymentSource` has no 'savings' value at all (see
 * computeThisMonthRecordedSummary's own note that savings is explicitly
 * deferred scope). Inventing the measure would mean an engine change,
 * which is a stop condition for this pass and is forbidden by Wave 5's own
 * read-only engine list. So the third measure is the factual one the
 * canonical selector already exposes and this card has always displayed:
 * recorded income minus recorded spending.
 *
 * That subtraction is the card's own existing, already-shipped "Net this
 * month" figure — not a new calculation. It is lifted out of the component
 * (which Design 5.1 forbids from doing arithmetic) into this pure,
 * testable function, and its VALUE is byte-identical to what the card
 * showed before this pass.
 *
 * Colour rules: green only for positive money in or a genuinely positive
 * net; spending is neutral ink, never urgent red — a customer's ordinary
 * spending is not an emergency. A negative net is caution, never urgent,
 * for the same reason.
 */
export function selectMonthMeasures(income: number, spend: number): MonthMeasure[] {
  const net = income - spend;
  const measure = (
    key: MonthMeasure['key'],
    label: string,
    amount: number,
    tone: MonthMeasureTone,
    signPositive: boolean
  ): MonthMeasure => {
    const value = formatMonthMeasure(amount, signPositive);
    return { key, label, value, spoken: `${label}, ${spokenMonthMeasure(amount, signPositive)}`, tone };
  };
  return [
    // Money in keeps its established explicit positive sign. Spending is a
    // magnitude under its own explicit label — the previous "-$800" read as
    // a correction rather than as an amount spent, and a minus sign under
    // the words "Spending recorded" adds nothing.
    measure('moneyIn', 'Money in', income, income > 0 ? 'positive' : 'neutral', true),
    // Wave 6 final refinement — "Spent" rather than "Spending recorded".
    // Shorter, and the card's own definition already says these are
    // recorded figures, so the word was doing no work in a narrow column.
    measure('spendingRecorded', 'Spent', spend, 'neutral', false),
    measure('netRecorded', 'Net recorded', net, net > 0 ? 'positive' : net < 0 ? 'caution' : 'neutral', true),
  ];
}

/** The typographic minus (U+2212), not a hyphen. It shares the tabular
 * advance width of the digits beside it, so a column of amounts stays
 * aligned whether or not any of them is negative. */
export const MINUS_SIGN = '\u2212';

/** The same value said aloud, with the sign as a word — never a bare
 * symbol, and never its own accessibility stop. */
export function spokenMonthMeasure(value: number, signPositive: boolean = false): string {
  if (!Number.isFinite(value)) return 'not available';
  const rounded = Math.round(value);
  const amount = `${Math.abs(rounded).toLocaleString()} dollars`;
  if (rounded < 0) return `negative ${amount}`;
  if (rounded > 0 && signPositive) return `positive ${amount}`;
  return amount;
}

/** Whole dollars. A negative value always reads with a minus; a positive
 * one carries a plus only where the established convention already showed
 * one (money in, and a positive net). */
export function formatMonthMeasure(value: number, signPositive: boolean = false): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  // Exactly zero is never signed: "+$0" and "−$0" both assert a direction
  // that the number itself denies.
  const sign = rounded < 0 ? MINUS_SIGN : rounded > 0 && signPositive ? '+' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// The header's date eyebrow
// ---------------------------------------------------------------------------

/**
 * "MONDAY 17 AUG" — Design 5.1 p.7's local date eyebrow.
 *
 * Locale-aware via toLocaleDateString and derived entirely from the
 * customer's own live local-calendar date, never a hard-coded month. The
 * uppercasing is NOT applied here: it belongs to the `eyebrow` type role,
 * which suppresses the transform for Thai. Doing it in the string would
 * force-uppercase Thai text, which Design 5.1 explicitly bars.
 */
export function formatTodayDateEyebrow(today: Date): string {
  return today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Whether Today shows a current-month section at all
// ---------------------------------------------------------------------------

/**
 * Wave 5 closure — the duplicate-setup-guidance correction.
 *
 * Today previously rendered the month heading and card unconditionally, so
 * an incomplete customer saw the money-picture checklist AND a second,
 * differently-worded prompt beneath it ("Not enough information yet. Add
 * your income and spending to unlock your monthly snapshot."). Two setup
 * asks for the same thing, in two registers, on one screen.
 *
 * The checklist is the single setup checklist. When there is no recorded
 * monthly activity the whole section — heading and card together — is not
 * rendered, so nothing is left behind: no unlock copy, no empty card, no
 * orphaned "August so far" heading and no spacer where they would have sat.
 *
 * This is the SAME eligibility rule the card itself already applied to
 * choose between its populated and empty states (`income > 0 || spend > 0`)
 * — lifted out so the heading can be gated by it too, rather than a second
 * rule that could disagree with the first. It reads already-computed
 * totals; it does not compute, threshold or round anything.
 */
export function isMonthSectionEligible(activity: { income: number; spend: number }): boolean {
  return activity.income > 0 || activity.spend > 0;
}

// ---------------------------------------------------------------------------
// The Briefing hero's colour emphasis
// ---------------------------------------------------------------------------

export type HeroEmphasis =
  /** A real, showable amount — the Ocean Blue anchor. */
  | 'measure'
  /** Money is genuinely short: recorded spending has run ahead of the plan,
   * commitments exceed cash, or goals cannot be funded. Warrants the
   * accessible warning role. */
  | 'shortfall'
  /** An input is missing or a figure cannot be trusted. A gap, NOT a money
   * problem — so it stays neutral ink. Colouring it would tell a customer
   * who simply hasn't finished setting up that something is wrong. */
  | 'incomplete';

/**
 * Wave 5 closure — restrained semantic colour in the hero.
 *
 * `presentation.tone` alone cannot drive this: it is 'warning' for BOTH a
 * genuine shortfall and a plain missing input, and those two deserve very
 * different treatment. `heroState` already distinguishes them, so this
 * reads that existing structured field rather than parsing anything out of
 * a formatted sentence. No amount is recomputed, re-rounded or re-derived
 * here — this decides emphasis only.
 */
export function resolveHeroEmphasis(heroState: string, amountVisible: boolean): HeroEmphasis {
  if (amountVisible) return 'measure';
  switch (heroState) {
    case 'recorded_overspend':
    case 'commitments_exceed_cash':
    case 'goals_underfunded':
      return 'shortfall';
    default:
      return 'incomplete';
  }
}
