import { CreditCard } from '../../types/models';
import { brand } from '../brand';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral';

// A typical Australian card rate sits around 18-21% p.a. — used only when
// the user hasn't entered their own rate, so Lulu can still show a useful
// interest estimate instead of nothing (PRD ask), always labelled as an
// assumption rather than presented as the user's real rate.
export const ASSUMED_CREDIT_CARD_APR = 0.195;

export function effectiveApr(card: CreditCard): { rate: number; isAssumed: boolean } {
  return typeof card.apr === 'number' && card.apr > 0 ? { rate: card.apr, isAssumed: false } : { rate: ASSUMED_CREDIT_CARD_APR, isAssumed: true };
}

// Utilisation is a behavioural/status metric, not a time-sensitive one — per
// the coaching-not-shaming rule (PRD §0.1), even "high" utilisation stays in
// the amber "worth your attention" tone, never red.
export function utilisationStatus(utilisation: number): { tone: Tone; label: string } {
  if (utilisation < 0.3) return { tone: 'success', label: 'Healthy' };
  if (utilisation < 0.7) return { tone: 'warning', label: 'Getting high' };
  return { tone: 'warning', label: 'High utilisation' };
}

// Due dates ARE genuinely time-sensitive, so red is appropriate here per the
// PRD's explicit exception to the no-red rule.
export function dueDateStatus(days: number): { tone: Tone; label: string } {
  if (days <= 1) return { tone: 'danger', label: days <= 0 ? 'Due today' : 'Due tomorrow' };
  if (days <= 3) return { tone: 'danger', label: `Due in ${days} days` };
  if (days <= 7) return { tone: 'warning', label: `Due in ${days} days` };
  return { tone: 'neutral', label: `Due in ${days} days` };
}

export interface CreditAggregate {
  totalLimit: number;
  totalUsed: number;
  utilisation: number;
  availableCredit: number;
}

export function computeCreditAggregate(cards: CreditCard[]): CreditAggregate {
  const totalLimit = cards.reduce((sum, c) => sum + c.creditLimit, 0);
  const totalUsed = cards.reduce((sum, c) => sum + c.currentBalance, 0);
  const utilisation = totalLimit > 0 ? totalUsed / totalLimit : 0;
  return { totalLimit, totalUsed, utilisation, availableCredit: totalLimit - totalUsed };
}

/**
 * Basic Phase-1 credit health score: utilisation only. The full 5-component
 * formula (PRD §13 — payment history, debt trend, cash available,
 * repayment behaviour) needs real history over time and lands in Phase 2.
 */
export function computeBasicCreditHealthScore(cards: CreditCard[]): number {
  const { utilisation } = computeCreditAggregate(cards);
  return Math.round(100 * clamp(1 - utilisation / 0.9, 0, 1));
}

/**
 * One real, computed line for the Money tab's Credit Cards & Debt nav card
 * — the benefit should be obvious before asking users to enter anything
 * (PRD ask), and once cards exist, this becomes an actual noticed insight
 * instead of generic copy.
 */
export function computeCardHeadline(cards: CreditCard[]): string | null {
  if (cards.length === 0) return null;
  const { utilisation } = computeCreditAggregate(cards);
  const withApr = cards.filter((c) => typeof c.apr === 'number');
  if (withApr.length > 1) {
    const highest = withApr.reduce((max, c) => ((c.apr ?? 0) > (max.apr ?? 0) ? c : max), withApr[0]);
    return `${highest.label} has your highest rate — reducing this balance first could save the most.`;
  }
  if (utilisation > 0.3) {
    return `Your credit utilisation is ${Math.round(utilisation * 100)}% — reducing your balance may help your credit health.`;
  }
  return `Your cards look healthy — ${Math.round(utilisation * 100)}% utilisation.`;
}

// Standard amortisation months-to-payoff formula — real math, only ever
// shown when the card has a real APR the user entered (never a guessed rate).
function monthsToPayOffBalance(balance: number, annualRate: number, monthlyPayment: number): number | null {
  if (balance <= 0) return 0;
  if (monthlyPayment <= 0) return null;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return Math.ceil(balance / monthlyPayment);
  if (monthlyPayment <= balance * monthlyRate) return null; // payment never outpaces interest
  const months = -Math.log(1 - (balance * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
  return Math.ceil(months);
}

/**
 * "You can clear this card N sooner by paying another $X/month" — a real
 * payoff-acceleration insight (PRD ask: don't just collect balance/limit,
 * explain why it matters). Uses the card's own APR, or Lulu's assumed
 * market-average estimate when none is set.
 */
export function computeCardPayoffInsight(card: CreditCard, extraMonthly: number = 200): string | null {
  if (card.currentBalance <= 0 || card.minimumPayment <= 0) return null;
  const { rate } = effectiveApr(card);
  const monthsAtMin = monthsToPayOffBalance(card.currentBalance, rate, card.minimumPayment);
  const monthsWithExtra = monthsToPayOffBalance(card.currentBalance, rate, card.minimumPayment + extraMonthly);
  if (monthsAtMin === null || monthsWithExtra === null) return null;
  const monthsSaved = monthsAtMin - monthsWithExtra;
  if (monthsSaved < 1) return null;
  const label = monthsSaved >= 12 ? `${Math.round((monthsSaved / 12) * 10) / 10} years` : `${monthsSaved} month${monthsSaved === 1 ? '' : 's'}`;
  return `Paying an extra $${extraMonthly}/month could clear this card ${label} sooner.`;
}

/** "{brand.name} noticed your utilisation is X%" — per-card coaching line,
 * only shown when it's actually worth surfacing (>30%). */
export function computeCardUtilisationInsight(card: CreditCard): string | null {
  if (card.creditLimit <= 0) return null;
  const util = card.currentBalance / card.creditLimit;
  if (util <= 0.3) return null;
  return `${brand.name} noticed your utilisation is ${Math.round(util * 100)}%. Many people aim to keep it below around 30%.`;
}

export interface CreditCardInsight {
  text: string;
  tone: Tone;
  usingAssumedApr: boolean;
}

export interface CreditCardInterestEstimateInput {
  balance: number;
  /** Statement balance, when known — banks generally charge interest on
   * the statement balance if unpaid, not necessarily today's running
   * balance. Falls back to `balance` when absent. */
  statementBalance?: number;
  annualRate?: number;
  fallbackAnnualRate?: number;
  daysUntilDue: number;
  /** Length of a full billing cycle, for the cycle-interest estimate.
   * Defaults to 30 — a card's real cycle length isn't tracked yet. */
  cycleDays?: number;
}

export interface CreditCardInterestEstimate {
  rateUsed: number;
  isAssumedRate: boolean;
  balanceUsed: number;
  balanceSource: 'statement' | 'current';
  /** Full precision — round only for display (PRD ask). */
  dailyInterest: number;
  /** Interest that would accrue between now and the due date — NOT the
   * same as a full cycle's interest (PRD bug report: a 4-day estimate was
   * previously mislabelled "interest next cycle"). */
  interestUntilDue: number;
  /** A full billing cycle's worth of interest at the daily rate — the
   * figure that actually belongs on a "next cycle" label. */
  estimatedCycleInterest: number;
  cycleDays: number;
  disclaimer: string;
}

/**
 * The one shared credit-card interest calculation (PRD ask, §B8) — every
 * screen that shows an interest estimate (Wealth liability row, card
 * detail, Today reminder, Debt Coach, Lulu Score) must call this so they
 * can never disagree. Deliberately separates "interest until due" from "a
 * full cycle's interest" — conflating the two was the exact bug reported
 * (a 4-day, ~$21 estimate mislabelled as "next cycle" interest, when a
 * real 30-day cycle at the same rate is closer to $150-160).
 */
export function computeCreditCardInterestEstimate(input: CreditCardInterestEstimateInput): CreditCardInterestEstimate {
  const fallbackAnnualRate = input.fallbackAnnualRate ?? ASSUMED_CREDIT_CARD_APR;
  const isAssumedRate = !(typeof input.annualRate === 'number' && input.annualRate > 0);
  const rateUsed = isAssumedRate ? fallbackAnnualRate : (input.annualRate as number);
  const balanceSource: 'statement' | 'current' = typeof input.statementBalance === 'number' && input.statementBalance > 0 ? 'statement' : 'current';
  const balanceUsed = balanceSource === 'statement' ? (input.statementBalance as number) : input.balance;
  const cycleDays = input.cycleDays ?? 30;
  const dailyInterest = balanceUsed * (rateUsed / 365);
  const interestUntilDue = dailyInterest * Math.max(0, input.daysUntilDue);
  const estimatedCycleInterest = dailyInterest * cycleDays;
  const disclaimer = isAssumedRate
    ? `Estimate uses an assumed purchase rate of ${(fallbackAnnualRate * 100).toFixed(1)}% p.a. Add your actual rate for a more accurate estimate.`
    : `Estimate based on your entered purchase rate of ${(rateUsed * 100).toFixed(1)}% p.a. Banks may calculate interest differently (average daily balance, grace periods) — treat this as a guide, not a bill.`;
  return { rateUsed, isAssumedRate, balanceUsed, balanceSource, dailyInterest, interestUntilDue, estimatedCycleInterest, cycleDays, disclaimer };
}

/** Convenience wrapper for a real CreditCard record. */
export function computeCreditCardInterestEstimateForCard(card: CreditCard, today: Date = new Date()): CreditCardInterestEstimate {
  return computeCreditCardInterestEstimate({
    balance: card.currentBalance,
    annualRate: card.apr,
    daysUntilDue: daysUntilDue(card.dueDay, today),
  });
}

/**
 * A single, most-relevant insight line for a credit card shown inline in
 * the Liabilities list (PRD ask: credit cards live in Liabilities now, not
 * a separate section — but should still surface "Your card is due on X" /
 * utilisation / interest-if-unpaid). Priority: an upcoming due date is
 * genuinely time-sensitive so it wins, and pairs the due date with a real
 * 30-day cycle interest estimate (never the smaller days-to-due figure
 * mislabelled as a cycle estimate); otherwise falls back to utilisation.
 */
export function creditCardLiabilityInsight(card: CreditCard, today: Date = new Date()): CreditCardInsight | null {
  const days = daysUntilDue(card.dueDay, today);
  if (days <= 7 && card.currentBalance > 0) {
    const due = dueDateStatus(days);
    const est = computeCreditCardInterestEstimateForCard(card, today);
    const interestText =
      est.estimatedCycleInterest >= 1 ? ` ~$${Math.round(est.estimatedCycleInterest).toLocaleString()} interest over 30 days if unpaid.` : '';
    return { text: `${due.label}.${interestText}`, tone: due.tone, usingAssumedApr: est.isAssumedRate && est.estimatedCycleInterest >= 1 };
  }
  if (card.creditLimit > 0) {
    const util = card.currentBalance / card.creditLimit;
    if (util > 0.3) {
      const status = utilisationStatus(util);
      return { text: `${Math.round(util * 100)}% used`, tone: status.tone, usingAssumedApr: false };
    }
  }
  return null;
}

export function daysUntilDue(dueDay: number, today: Date = new Date()): number {
  const year = today.getFullYear();
  const month = today.getMonth();
  let due = new Date(year, month, dueDay);
  if (due < today) {
    due = new Date(year, month + 1, dueDay);
  }
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}
