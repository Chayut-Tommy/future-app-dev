import { Ionicons } from '@expo/vector-icons';
import { AppData, Liability, LiabilityType, RecurringItem } from '../../types/models';
import { toMonthlyAmount } from './incomeEngine';

export type DebtKind = LiabilityType | 'credit_card';

export interface DebtEntry {
  id: string;
  kind: DebtKind;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  balance: number;
  interestRate?: number;
  /** The real recurring repayment linked to this debt, if Lulu knows it —
   * a credit card's minimum payment, or a liability's linked bill. Never
   * fabricated when absent. */
  monthlyRepayment?: number;
  linkedRecurringItem?: RecurringItem;
  liability?: Liability;
}

export interface PayoffAcceleration {
  debt: DebtEntry;
  extraMonthly: number;
  monthsSaved: number;
}

export interface DebtCoachSummary {
  debts: DebtEntry[];
  totalDebt: number;
  totalMonthlyRepayment: number;
  /** Real monthly-repayment ÷ income — null when income isn't known. */
  debtToIncomeRatio: number | null;
  highestInterestDebt: DebtEntry | null;
  payoffAcceleration: PayoffAcceleration | null;
}

const DEBT_ICON: Record<DebtKind, keyof typeof Ionicons.glyphMap> = {
  mortgage: 'home',
  car_loan: 'car',
  personal_loan: 'document-text',
  credit_card: 'card',
  other: 'ellipse',
};

const DEBT_LABEL: Record<DebtKind, string> = {
  mortgage: 'Mortgage',
  car_loan: 'Car loan',
  personal_loan: 'Personal loan',
  credit_card: 'Credit card',
  other: 'Other debt',
};

/** Months to pay off a fixed-payment loan — real amortisation math, not a
 * canned "X years" string. Returns null when the payment doesn't even
 * cover the interest (never converges), so callers never show a bogus
 * number. */
function monthsToPayoff(balance: number, monthlyRate: number, payment: number): number | null {
  if (balance <= 0) return 0;
  if (payment <= 0) return null;
  if (monthlyRate <= 0) return balance / payment;
  const interestOnly = balance * monthlyRate;
  if (payment <= interestOnly) return null;
  return Math.log(payment / (payment - interestOnly)) / Math.log(1 + monthlyRate);
}

export function computeDebtCoachSummary(data: AppData): DebtCoachSummary {
  const debts: DebtEntry[] = [];

  // Every credit card is already mirrored into a linked Liability (see
  // upsertCreditCardLiability in AppStateContext) so it counts toward net
  // worth. That mirror is the same real-world debt as the CreditCard
  // record it points to — iterating data.creditCards separately here as
  // well doubled it up in Debt Overview (PRD bug report: the same card
  // appeared twice with an identical balance). data.liabilities is the
  // single pass; a creditCardId link just means "look up the card for its
  // APR/minimum payment," never a second entry.
  for (const l of data.liabilities) {
    if (l.currentBalance <= 0) continue;
    const linkedCard = l.creditCardId ? data.creditCards.find((c) => c.id === l.creditCardId) : undefined;
    const linkedRecurringItem = linkedCard ? undefined : data.recurringItems.find((r) => r.linkedLiabilityId === l.id && r.active);
    // Normalised to a true monthly figure via the shared income engine —
    // a weekly or fortnightly repayment bill was previously summed at its
    // raw per-payment amount, understating debt-to-income and repayment
    // totals here versus every other screen that already normalises (PRD
    // bug report, §D7: figures must reconcile across every screen).
    const monthlyRepayment = linkedCard
      ? linkedCard.minimumPayment > 0
        ? linkedCard.minimumPayment
        : undefined
      : linkedRecurringItem
      ? toMonthlyAmount(linkedRecurringItem.amount, linkedRecurringItem.frequency)
      : undefined;
    debts.push({
      id: l.id,
      kind: linkedCard ? 'credit_card' : l.type,
      icon: DEBT_ICON[linkedCard ? 'credit_card' : l.type],
      label: l.label || DEBT_LABEL[linkedCard ? 'credit_card' : l.type],
      balance: l.currentBalance,
      interestRate: linkedCard ? linkedCard.apr : l.interestRate,
      monthlyRepayment,
      linkedRecurringItem,
      liability: l,
    });
  }

  debts.sort((a, b) => b.balance - a.balance);

  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMonthlyRepayment = debts.reduce((sum, d) => sum + (d.monthlyRepayment ?? 0), 0);
  const debtToIncomeRatio = data.user.monthlyIncome > 0 && totalMonthlyRepayment > 0 ? totalMonthlyRepayment / data.user.monthlyIncome : null;

  const ratedDebts = debts.filter((d) => typeof d.interestRate === 'number' && d.interestRate > 0);
  const highestInterestDebt = ratedDebts.length > 1 ? ratedDebts.reduce((a, b) => ((b.interestRate ?? 0) > (a.interestRate ?? 0) ? b : a)) : null;

  // Real payoff-acceleration math for the largest debt that has both a
  // known rate and a known repayment — skipped entirely (not guessed) when
  // Lulu doesn't have enough real numbers to compute it.
  const extraMonthly = 200;
  let payoffAcceleration: PayoffAcceleration | null = null;
  for (const d of debts) {
    if (!d.interestRate || !d.monthlyRepayment) continue;
    const monthlyRate = d.interestRate / 12;
    const current = monthsToPayoff(d.balance, monthlyRate, d.monthlyRepayment);
    const accelerated = monthsToPayoff(d.balance, monthlyRate, d.monthlyRepayment + extraMonthly);
    if (current === null || accelerated === null) continue;
    const monthsSaved = Math.round(current - accelerated);
    if (monthsSaved > 0) {
      payoffAcceleration = { debt: d, extraMonthly, monthsSaved };
      break;
    }
  }

  return { debts, totalDebt, totalMonthlyRepayment, debtToIncomeRatio, highestInterestDebt, payoffAcceleration };
}

export function computeHasAnyDebt(data: AppData): boolean {
  return data.liabilities.some((l) => l.currentBalance > 0) || data.creditCards.some((c) => c.currentBalance > 0);
}
