/**
 * A1 — the ONE mapping from an authoritative source (a RecurringItem or a
 * CreditCard) to its canonical occurrence identity, source kind, cadence and
 * (for repayments) expected cycle cents. Pure. Used by both the confirmation
 * transitions (to stamp canonical evidence at creation) and candidate discovery
 * (to offer link choices) so the two can never disagree about a source's kind.
 *
 * Loans map to the ONE canonical `loan` source kind regardless of subtype; an
 * ordinary bill has no linked liability. Income and ordinary bills are
 * non-repayment; cards, BNPL and loans are repayments (partial/satisfied cents
 * apply). The liability subtype (mortgage / car loan / personal / other) stays
 * metadata on the liability and is deliberately NOT encoded in identity.
 */

import type { AppData, CreditCard, LiabilityType, RecurringItem } from '../../types/models';
import { OccurrenceCadence, OccurrenceId, OccurrenceSourceKind, cadenceForFrequency, tryBuildOccurrenceId } from './occurrenceIdentity';
import { resolveExpectedMonthlyRepayment } from './creditHealth';

/** Every supported loan subtype resolves to the SINGLE canonical `loan` kind;
 * BNPL is its own kind. The loan's stable RecurringItem id is the disambiguator
 * within `loan`, so subtypes never collide and a subtype is never an identity. */
const LIABILITY_SOURCE_KIND: Record<LiabilityType, OccurrenceSourceKind | undefined> = {
  bnpl: 'bnpl',
  mortgage: 'loan',
  car_loan: 'loan',
  personal_loan: 'loan',
  other: 'loan',
  // A mirrored credit-card liability is never a recurring-item source — card
  // repayment occurrences are keyed via the CreditCard itself (sourceKind
  // 'card'), so a recurring item linked to a credit_card liability fails closed.
  credit_card: undefined,
};

/** The liability subtype an occurrence carries as METADATA (never identity).
 * Undefined for non-liability sources (income / ordinary bill / card). */
export type OccurrenceLiabilitySubtype = LiabilityType;

export interface RecurringSourceInfo {
  sourceKind: OccurrenceSourceKind;
  cadence: OccurrenceCadence;
  isRepayment: boolean;
  /** Present only for a repayment source backed by a liability — the exact
   * subtype (mortgage / car_loan / personal_loan / other / bnpl). Metadata for
   * candidate filtering and repayment accounting; never part of the occurrence id. */
  liabilitySubtype?: OccurrenceLiabilitySubtype;
}

/** Classify a RecurringItem into its occurrence source kind. Returns undefined
 * for an item whose linked liability is missing/unknown — the caller fails
 * closed rather than guessing. */
export function sourceInfoForRecurringItem(data: AppData, item: RecurringItem): RecurringSourceInfo | undefined {
  const cadence = cadenceForFrequency(item.frequency);
  if (item.type === 'income') return { sourceKind: 'income', cadence, isRepayment: false };
  // expense
  if (!item.linkedLiabilityId) return { sourceKind: 'bill', cadence, isRepayment: false };
  const liability = data.liabilities.find((l) => l.id === item.linkedLiabilityId);
  if (!liability) return undefined; // dangling link — fail closed
  const sourceKind = LIABILITY_SOURCE_KIND[liability.type];
  if (!sourceKind) return undefined;
  return { sourceKind, cadence, isRepayment: true, liabilitySubtype: liability.type };
}

/** Canonical occurrence id for a specific occurrence of a RecurringItem. */
export function occurrenceIdForRecurringItem(data: AppData, item: RecurringItem, occurrenceDate: Date): OccurrenceId | undefined {
  const info = sourceInfoForRecurringItem(data, item);
  if (!info) return undefined;
  return tryBuildOccurrenceId({ sourceKind: info.sourceKind, sourceId: item.id, occurrenceDate, cadence: info.cadence });
}

/** Canonical occurrence id for a credit-card cycle (always monthly, keyed by
 * the billing month of the due date; the mutable due day is not identity). */
export function occurrenceIdForCard(card: Pick<CreditCard, 'id'>, dueDate: Date): OccurrenceId | undefined {
  return tryBuildOccurrenceId({ sourceKind: 'card', sourceId: card.id, occurrenceDate: dueDate, cadence: 'monthly' });
}

/** Authoritative expected cycle cents for a repayment source, or undefined when
 * the model does not authoritatively supply one (never a guess). Card = the
 * resolved expected monthly repayment; BNPL/loan = the scheduled item amount. */
export function expectedRepaymentCentsForItem(item: RecurringItem): number | undefined {
  if (!Number.isFinite(item.amount) || item.amount <= 0) return undefined;
  const cents = Math.round(item.amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined;
}

export function expectedRepaymentCentsForCard(card: CreditCard): number | undefined {
  const dollars = resolveExpectedMonthlyRepayment(card);
  if (!Number.isFinite(dollars) || dollars <= 0) return undefined;
  const cents = Math.round(dollars * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined;
}
