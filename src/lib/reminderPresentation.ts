// Nolie Design 5.1 Wave 6 closure — how a reminder is PRESENTED.
//
// Pure, RN-free and financial-arithmetic-free. It decides wording, queue
// copy, status tone and accessibility descriptions; it never selects,
// ranks, excludes, mutates or calculates. Every reminder this describes was
// already chosen by reminders.ts, and every action it labels was already
// wired to its own existing handler.
//
// WHY IT EXISTS. The reminder surface had a generic "Reminder" title with
// no queue context, an acknowledgement labelled "Noted" that gave no hint
// another reminder followed, a Close floating below the content, and one
// branch (the card reminder) formatted completely unlike the others. Those
// are presentation decisions scattered across a component with eight kind
// branches, which is exactly how they drifted apart. Centralising them here
// means a wording change cannot silently become a behaviour change.

import { SmartReminderKind } from './calculations/reminders';

// ---------------------------------------------------------------------------
// Queue position
// ---------------------------------------------------------------------------

/**
 * "Reminder 1 of 3" when several are waiting; plain "Reminder" when one is.
 *
 * A bare count would be worse than nothing when there is only one item — it
 * would imply a queue that does not exist.
 */
export function reminderQueueTitle(position: number, total: number): string {
  if (!Number.isFinite(position) || !Number.isFinite(total) || total <= 1 || position < 1) return 'Reminder';
  return `Reminder ${Math.min(position, total)} of ${total}`;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ReminderStatusTone = 'informational' | 'caution' | 'urgent' | 'positive';

export interface ReminderStatus {
  label: string;
  tone: ReminderStatusTone;
}

/**
 * The reminder's own timing state, taken from the DOMAIN kind and the
 * engine's own day count — never by parsing a formatted date string.
 *
 * `bill_overdue` is the one kind that genuinely covers two states:
 * reminders.ts reuses it for a bill due exactly today, and its own header
 * comment is explicit that calling that "overdue" would be inaccurate. So
 * the urgent tone is reserved for a day count that is actually in the past.
 */
export function resolveReminderStatus(kind: SmartReminderKind, daysUntil: number | null): ReminderStatus {
  if (kind === 'salary_check') return { label: 'Expected', tone: 'informational' };

  if (daysUntil === null || !Number.isFinite(daysUntil)) {
    return { label: 'Upcoming', tone: 'informational' };
  }
  if (daysUntil < 0) return { label: 'Overdue', tone: 'urgent' };
  if (daysUntil === 0) return { label: 'Due today', tone: 'caution' };
  if (daysUntil === 1) return { label: 'Due tomorrow', tone: 'caution' };
  if (daysUntil <= 3) return { label: `Due in ${daysUntil} days`, tone: 'caution' };
  return { label: `Due in ${daysUntil} days`, tone: 'informational' };
}

// ---------------------------------------------------------------------------
// The acknowledgement action
// ---------------------------------------------------------------------------

/* Wave 6 final — `AcknowledgeAction` / `resolveAcknowledgeAction` were
 * removed here. They gave a bare acknowledgement control queue-aware
 * wording ("Next reminder" / "Done"), and that control no longer exists:
 * the three-intent model replaced it with Snooze (not now, ask me on this
 * day) and Dismiss (never for this one), both of which say strictly more
 * than an acknowledgement could. Keeping an unused exported helper would
 * imply a surface still offers it. */

export function composeReminderAnnouncement(input: {
  position: number;
  total: number;
  status: string;
  title: string;
  amountLabel?: string | null;
  dateLabel?: string | null;
}): string {
  const parts: string[] = [];
  if (input.total > 1) parts.push(`Reminder ${Math.min(input.position, input.total)} of ${input.total}`);
  parts.push(input.status);
  parts.push(input.title);
  if (input.amountLabel) parts.push(input.amountLabel);
  if (input.dateLabel) parts.push(input.dateLabel);
  return `${parts.join('. ')}.`;
}

// ---------------------------------------------------------------------------
// Which kinds are acknowledgement-only
// ---------------------------------------------------------------------------

/**
 * Only these use the Next reminder / Done contract. Every other kind keeps
 * its own real domain action — a salary reminder still confirms receipt, a
 * repayment reminder still records a repayment — because forcing them into
 * an acknowledgement would be telling the customer their money moved when
 * it did not.
 */
export const ACKNOWLEDGEMENT_ONLY_KINDS: readonly SmartReminderKind[] = ['bill_due_soon'];

export function isAcknowledgementOnly(kind: SmartReminderKind): boolean {
  return ACKNOWLEDGEMENT_ONLY_KINDS.includes(kind);
}

/** Design 5.1 Wave 6 closure — action targets. The primary and secondary
 * actions resolve real money, so they take a comfortable 48pt; the header
 * Close takes the 44pt floor. */
export const REMINDER_ACTION_MIN_HEIGHT = 48;
export const REMINDER_CLOSE_MIN_HEIGHT = 44;

/**
 * Wave 6 closure — the card reminder's supporting facts, as label/value
 * pairs rather than one run-on sentence.
 *
 * PRESENTATION ONLY. Every number arrives already computed by the shared
 * engines this app already uses everywhere else — `computeCreditCard-
 * InterestEstimate` and `resolveExpectedMonthlyRepayment` in
 * creditHealth.ts — so this reminder can never disagree with the card
 * detail screen, the Wealth row or the Debt Coach about the same card. No
 * arithmetic beyond rounding a figure for display happens here.
 *
 * The labels matter as much as the numbers. The expected repayment is NOT
 * an "amount due": it is what the customer told Nolie they normally repay,
 * and calling it "due" would state a contractual obligation Nolie has no
 * knowledge of. Likewise the balance is what Nolie has RECORDED, not what
 * the bank says today.
 */
export interface CardReminderFact {
  label: string;
  value: string;
  /** True for the interest row, which is an estimate rather than a
   * recorded fact and is rendered in the caution role. */
  estimated?: boolean;
}

function displayAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded % 1 === 0
    ? `$${rounded.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function composeCardReminderFacts(input: {
  expectedMonthlyRepayment: number;
  recordedBalance: number;
  estimatedCycleInterest: number;
  cycleDays: number;
}): CardReminderFact[] {
  const facts: CardReminderFact[] = [];
  if (input.expectedMonthlyRepayment > 0) {
    facts.push({ label: 'Expected monthly repayment', value: displayAmount(input.expectedMonthlyRepayment) });
  }
  if (input.recordedBalance > 0) {
    facts.push({ label: 'Current recorded balance', value: displayAmount(input.recordedBalance) });
  }
  // Suppressed below $1 rather than shown as "$0" — a rounded-to-nothing
  // estimate reads as "this costs nothing", which is the opposite of what
  // a sub-dollar-but-nonzero figure means. Mirrors the >= 1 gate the card
  // insight already applies to the same figure.
  if (input.estimatedCycleInterest >= 1) {
    facts.push({
      label: 'Estimated interest if unpaid',
      value: `approximately ${displayAmount(Math.round(input.estimatedCycleInterest))} over ${input.cycleDays} days`,
      estimated: true,
    });
  }
  return facts;
}

/** The provenance line under the facts — states which rate produced the
 * estimate and whether the customer supplied it. Never presented as a
 * bill. */
export function cardReminderRateProvenance(rateUsed: number, isAssumedRate: boolean): string {
  const rate = `${(rateUsed * 100).toFixed(1)}% p.a.`;
  return isAssumedRate
    ? `Estimated using an assumed rate of ${rate}. Add your card's rate for a closer figure.`
    : `Estimated using your card's rate of ${rate}.`;
}

/** The caution note. Deliberately explains the MECHANISM (interest accrues
 * on what is left) rather than warning the customer about themselves — the
 * coaching-not-shaming line this product holds. */
export const CARD_REMINDER_CAUTION =
  'Interest is charged on whatever is left unpaid. Paying more than the expected amount reduces it.';

/**
 * How many whole days from `today` until an occurrence — negative when it
 * has already passed.
 *
 * CLASSIFICATION: Class B (mirrored). reminders.ts keeps `startOfDay` and
 * `daysBetween` module-private, and that file is a financial engine this
 * pass is not authorised to edit — not even to add an `export` keyword. The
 * convention is mirrored here VERBATIM (local-midnight normalisation, then
 * a rounded 86,400,000ms division), and
 * tests/design5-wave6-reminder-actions.test.ts asserts the two agree at
 * every tier boundary the engine classifies on, so a future divergence
 * fails a test rather than silently mislabelling a reminder.
 *
 * Used for presentation only: it decides which words and which semantic
 * tone the status pill carries. No money is computed from it.
 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function reminderDaysUntil(occurrenceISO: string | undefined, today: Date): number | null {
  if (!occurrenceISO) return null;
  const occurrence = new Date(occurrenceISO);
  if (Number.isNaN(occurrence.getTime())) return null;
  return Math.round((startOfDay(occurrence).getTime() - startOfDay(today).getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// The three-intent action model (Wave 6 final)
// ---------------------------------------------------------------------------

/**
 * Every reminder now offers up to three intentions: complete the financial
 * action, see it again later, or hide this occurrence. This section decides
 * only what those controls are CALLED and how they are ranked. Which
 * handler each one reaches, and what that handler does to money, lives in
 * SmartReminderCard and the existing transitions — never here.
 *
 * The primary verb is context-specific on purpose. "Confirm" told the
 * customer nothing about what was being confirmed, and a single generic
 * verb across bills, cards, loans and salary invites exactly the misreading
 * this product cannot afford: that acknowledging a reminder moved money.
 */
export type ReminderPrimaryIntent =
  | { kind: 'financial'; label: string; hint: string }
  | { kind: 'none' };

const PRIMARY_BY_KIND: Record<SmartReminderKind, { label: string; hint: string } | null> = {
  // An ordinary bill and an overdue bill are the same act — the customer
  // paid it — so they share a verb. "Mark as paid" is the plainest true
  // description: Nolie is recording what already happened in the bank.
  bill_due_soon: { label: 'Mark as paid', hint: 'Opens a form to confirm the amount and which account paid it. Nothing is recorded until you confirm.' },
  bill_overdue: { label: 'Mark as paid', hint: 'Opens a form to confirm the amount and which account paid it. Nothing is recorded until you confirm.' },
  card_due_soon: { label: 'Record payment', hint: 'Opens a form to record a payment towards this card. Nothing is recorded until you confirm.' },
  loan_repayment_due: { label: 'Record repayment', hint: 'Opens a form to record this repayment. Nothing is recorded until you confirm.' },
  bnpl_repayment_due: { label: 'Record repayment', hint: 'Opens a form to record this repayment. Nothing is recorded until you confirm.' },
  // The accepted, already-tested salary wording is "Yes, it arrived". It
  // means exactly "Yes, received" and this pass was told to PRESERVE the
  // income journey, so the established string wins over a synonym.
  salary_check: { label: 'Yes, it arrived', hint: 'Confirms this income arrived. You choose which balance it is added to next.' },
};

/**
 * The primary action for a kind, or `none`.
 *
 * `none` is not a fallback for "unknown kind" — it is the correct answer
 * for any reminder that is not about money. Offering a fabricated
 * "Mark as paid" on such a reminder would invite the customer to record a
 * transaction that never happened.
 */
export function resolvePrimaryIntent(kind: SmartReminderKind): ReminderPrimaryIntent {
  const entry = PRIMARY_BY_KIND[kind];
  return entry ? { kind: 'financial', label: entry.label, hint: entry.hint } : { kind: 'none' };
}

/** True when this kind has a real financial action behind it. */
export function hasFinancialAction(kind: SmartReminderKind): boolean {
  return resolvePrimaryIntent(kind).kind === 'financial';
}

export const SNOOZE_ACTION = {
  label: 'Snooze',
  support: 'Show this again later',
  hint: 'Choose a date to see this reminder again. Nothing is paid or changed.',
} as const;

export const DISMISS_ACTION = {
  label: 'Dismiss',
  support: 'Hide this occurrence',
  hint: 'Hides this one reminder. It does not mark anything paid, and future reminders still appear.',
} as const;

/**
 * The snooze step's own copy.
 *
 * The promise is deliberately narrow: the reminder reappears IN NOLIE.
 * This app schedules no push notifications, and copy implying a phone alert
 * would be a promise the product cannot keep — the customer would stop
 * opening the app expecting to be told.
 */
export const SNOOZE_SHEET = {
  title: 'Show this again',
  body: 'This reminder will reappear in Nolie on the date you choose.',
  customLabel: 'Choose a date',
  backLabel: 'Back',
} as const;

/**
 * The dismiss confirmation's own copy. Every clause exists to close a
 * specific misreading: that dismissing pays the bill, that it edits the
 * customer's records, or that it turns this reminder off forever.
 */
export const DISMISS_CONFIRM = {
  title: 'Dismiss this reminder?',
  body: "This hides this reminder only. It won't mark the bill as paid or change your records. Future reminders will still appear.",
  keepLabel: 'Keep reminder',
  confirmLabel: 'Dismiss reminder',
} as const;

/** What a completed suppression announces, once. Says what happened and
 * what did NOT happen, because "Dismissed" alone leaves the customer
 * wondering whether their bill just disappeared. */
export function suppressionAnnouncement(kind: 'snoozed' | 'dismissed', returnOn?: string | null): string {
  if (kind === 'snoozed') {
    return returnOn
      ? `Snoozed. This reminder returns on ${returnOn}. Nothing was paid or changed.`
      : 'Snoozed. Nothing was paid or changed.';
  }
  return 'Reminder dismissed. Nothing was paid or changed, and future reminders will still appear.';
}

/**
 * The 2×2 facts grid's layout for a given width and text scale.
 *
 * Four narrow columns across a phone was the failure this replaces: at
 * 320pt each column had roughly 70pt for a label and a currency figure, so
 * every one of them truncated. Two columns is the default; one column is
 * the honest answer once the text is large enough that two cannot hold a
 * label and its value on one line each.
 */
export function resolveFactGridColumns(width: number, fontScale: number): 1 | 2 {
  if (fontScale >= 1.3) return 1;
  if (width < 340) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// The reminder's identity: status, title, one supporting line
// ---------------------------------------------------------------------------

/**
 * Wave 6 final — the reminder's own words, derived from its structured
 * fields rather than from the engine's prose title.
 *
 * WHY NOT THE ENGINE'S TITLE. reminders.ts composes sentences like
 * "Did you pay your Rent?" and "Did your dividends arrive? 🎉". Both are
 * defects the owner reported: the first prepends "your" to an already-named
 * item and reads as an interrogation, the second lower-cases a name the
 * customer typed and carries an emoji. Both also repeat timing information
 * that the status pill and the supporting line already carry, so the same
 * fact arrived three times.
 *
 * reminders.ts is a financial-adjacent engine this pass does not edit — its
 * tier order, day-count boundaries and eligibility gates stay byte-
 * identical — so the correction lives here, where wording belongs. The
 * engine's `title` remains the reminder's stable identity for logs and
 * tests; it is simply no longer what the customer reads.
 *
 * The whole hierarchy is: STATUS says when, TITLE says what, SUPPORT says
 * how much and by when. Each fact appears exactly once.
 */
export interface ReminderIdentity {
  status: ReminderStatus;
  /** The item's own name, exactly as the customer entered it. */
  title: string;
  /** One line. "$250 due today · 21 Aug". */
  supportLine: string | null;
}

function shortDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function wholeMoney(amount: number | undefined): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return `$${Math.round(amount).toLocaleString()}`;
}

/**
 * The timing clause for the supporting line. Deliberately a DIFFERENT
 * phrasing from the status pill's own words: "OVERDUE" above and "was due
 * 21 Aug" below tells the customer two things, whereas "OVERDUE" above and
 * "overdue" below tells them one thing twice.
 */
function timingClause(daysUntil: number | null): string {
  if (daysUntil === null || !Number.isFinite(daysUntil)) return 'due';
  if (daysUntil < 0) return 'was due';
  if (daysUntil === 0) return 'due today';
  if (daysUntil === 1) return 'due tomorrow';
  return `due in ${daysUntil} days`;
}

export function resolveReminderIdentity(input: {
  kind: SmartReminderKind;
  /** The linked item's own name — RecurringItem.label or CreditCard.label.
   * Never re-cased and never wrapped in a template. */
  name: string | null;
  amount?: number;
  occurrenceISO?: string;
  daysUntil: number | null;
}): ReminderIdentity {
  const status = resolveReminderStatus(input.kind, input.daysUntil);
  const title = input.name && input.name.trim().length > 0 ? input.name.trim() : 'Reminder';
  const amount = wholeMoney(input.amount);
  const day = shortDay(input.occurrenceISO);

  if (input.kind === 'salary_check') {
    // Income is expected, not owed — "due" would be wrong in both
    // directions: nobody owes Nolie, and Nolie cannot confirm it arrived.
    const parts = [amount, day ? `expected ${day}` : 'expected'].filter(Boolean);
    return { status, title, supportLine: parts.length > 0 ? parts.join(' ') : null };
  }

  const timing = timingClause(input.daysUntil);
  const head = amount ? `${amount} ${timing}` : timing.charAt(0).toUpperCase() + timing.slice(1);
  // An overdue item's date IS the timing, so it is not repeated after a
  // separator; an upcoming one needs both the relative and the exact day.
  const supportLine =
    input.daysUntil !== null && input.daysUntil < 0
      ? day
        ? `${head} ${day}`
        : head
      : day
      ? `${head} · ${day}`
      : head;
  return { status, title, supportLine };
}

// ---------------------------------------------------------------------------
// Select-then-confirm: the account step's own copy
// ---------------------------------------------------------------------------

/**
 * Wave 6 final — every account step now has a title, a one-line
 * explanation and a SEPARATE confirm button. The explanation is the short
 * form the owner asked for: what Nolie does, and what it does not.
 */
export const BILL_SOURCE_STEP = {
  title: 'Where was this paid from?',
  body: 'This records the payment in Nolie. It does not move money at your bank.',
  backLabel: 'Back',
} as const;

export const INCOME_DESTINATION_STEP = {
  body: 'Choose the account Nolie should add this income to.',
  backLabel: 'Back',
} as const;

/** "Where did the $100 arrive?" — the figure belongs in the question, so
 * the customer is never choosing an account for an amount they cannot see. */
export function incomeDestinationTitle(amount: number | undefined): string {
  const money = wholeMoney(amount);
  return money ? `Where did the ${money} arrive?` : 'Where did this arrive?';
}

/**
 * The confirm button's label.
 *
 * The amount-specific form ("Record $250 payment") is the clearest thing a
 * customer can read before committing. It is dropped for a generic label
 * when the text would no longer fit its own button — a truncated amount on
 * a confirmation control is worse than no amount at all.
 */
export function billConfirmLabel(amount: number | undefined, fontScale: number): string {
  const money = wholeMoney(amount);
  if (!money || fontScale >= 1.3 || money.length > 8) return 'Record payment';
  return `Record ${money} payment`;
}

export const INCOME_CONFIRM_LABEL = 'Record income';

/** The income reminder's factual notice. States the destination is the
 * customer's choice and that nothing moves at their bank. */
export function incomeRecordingNotice(amount: number | undefined): string | null {
  const money = wholeMoney(amount);
  if (!money) return null;
  return `Recording this adds ${money} to the account you choose in Nolie. It does not move money at your bank.`;
}

/** The confirmation summary shown once an account is chosen, so the
 * customer confirms against facts rather than memory. */
export function confirmationSummary(input: { amount: number | undefined; accountName: string | null; dateISO?: string }): string | null {
  const money = wholeMoney(input.amount);
  if (!money || !input.accountName) return null;
  const day = shortDay(input.dateISO);
  return day ? `${money} from ${input.accountName} · ${day}` : `${money} from ${input.accountName}`;
}

/** Minimum height for the one full-width primary action. Taller than the
 * secondary row: it is the control that moves money. */
export const PRIMARY_ACTION_MIN_HEIGHT = 52;
/** Minimum height for a snooze quick-choice row. */
export const SNOOZE_ROW_MIN_HEIGHT = 52;

/** The snooze quick choices, with their real dates resolved. "Tomorrow"
 * showing only the word left the customer guessing which day that was. */
export function snoozeChoiceDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
