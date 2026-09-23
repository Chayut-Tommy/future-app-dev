/**
 * Pass D — Source Correction: the ONE pure resolver from a Look Ahead source row
 * to the EXISTING authoritative editor for that source.
 *
 * It creates no editor, no write path and no calculation. It answers one
 * question — "which existing editor owns this source?" — from STABLE identity
 * only: the canonical A3 event's `sourceKind` + `sourceId` (a recurring-item id
 * or a card id, the same identity the engine's own `editDestination` carries)
 * and, for BNPL, the structured `linkedLiabilityId`. A source is NEVER located by
 * its label, amount, date, category or position in a list. If the identity no
 * longer resolves to a record of the expected kind, the answer is `unavailable`
 * (fail closed): no "probable match" is ever opened.
 *
 * The destinations mirror Money's accepted What Happens Next routing exactly, so
 * the same source opens the same editor from either surface:
 *   income            → the Income editor            (recurring item id)
 *   bill, loan        → the Bill editor              (recurring item id; a loan or
 *                        mortgage REPAYMENT SCHEDULE is that linked bill — the
 *                        recorded repayments themselves stay view-only, P0)
 *   BNPL              → the liability editor         (liability id via the link)
 *   card              → the Card editor              (card id)
 * Pure: no React, no storage.
 */
import type { AppData } from '../../types/models';
import type { OccurrenceSourceKind } from './occurrenceIdentity';

export interface SourceReviewRequest {
  sourceKind: OccurrenceSourceKind;
  sourceId: string;
  /** Carried for focus return and stale-detail clearing only — never for routing. */
  occurrenceId?: string;
}

export type SourceReviewDestination =
  | { status: 'available'; editor: 'income'; recurringItemId: string; sourceName: string; actionLabel: 'Review income' }
  | { status: 'available'; editor: 'bill'; recurringItemId: string; sourceName: string; actionLabel: 'Review bill' | 'Review repayment' }
  | { status: 'available'; editor: 'liability'; liabilityId: string; sourceName: string; actionLabel: 'Review repayment' }
  | { status: 'available'; editor: 'card'; creditCardId: string; sourceName: string; actionLabel: 'Review card' }
  | { status: 'unavailable'; reason: 'source_missing' | 'link_unresolved' | 'unsupported_kind' };

export const SOURCE_REVIEW_UNAVAILABLE_COPY = 'This item is no longer available. Your estimate has been refreshed.';
export const ESTIMATE_UPDATED_COPY = 'Estimate updated';
export const SOURCE_REVIEW_HINT = 'Opens this source so you can review or change it. Changing a repeating source changes every future occurrence.';

export function resolveSourceReview(data: Pick<AppData, 'recurringItems' | 'creditCards' | 'liabilities'>, request: SourceReviewRequest): SourceReviewDestination {
  const { sourceKind, sourceId } = request;
  if (sourceKind === 'card') {
    const card = data.creditCards.find((c) => c.id === sourceId);
    return card ? { status: 'available', editor: 'card', creditCardId: card.id, sourceName: card.label, actionLabel: 'Review card' } : { status: 'unavailable', reason: 'source_missing' };
  }
  if (sourceKind !== 'income' && sourceKind !== 'bill' && sourceKind !== 'loan' && sourceKind !== 'bnpl') {
    return { status: 'unavailable', reason: 'unsupported_kind' };
  }
  const item = data.recurringItems.find((r) => r.id === sourceId);
  if (!item) return { status: 'unavailable', reason: 'source_missing' };
  if (sourceKind === 'income') {
    return item.type === 'income' ? { status: 'available', editor: 'income', recurringItemId: item.id, sourceName: item.label, actionLabel: 'Review income' } : { status: 'unavailable', reason: 'source_missing' };
  }
  if (item.type !== 'expense') return { status: 'unavailable', reason: 'source_missing' };
  if (sourceKind === 'bnpl') {
    const liability = item.linkedLiabilityId ? data.liabilities.find((l) => l.id === item.linkedLiabilityId) : undefined;
    return liability && liability.type === 'bnpl'
      ? { status: 'available', editor: 'liability', liabilityId: liability.id, sourceName: liability.label, actionLabel: 'Review repayment' }
      : { status: 'unavailable', reason: 'link_unresolved' };
  }
  if (sourceKind === 'loan') {
    // The schedule is the linked bill; a broken link fails closed (C.5.2.1).
    const liability = item.linkedLiabilityId ? data.liabilities.find((l) => l.id === item.linkedLiabilityId) : undefined;
    return liability
      ? { status: 'available', editor: 'bill', recurringItemId: item.id, sourceName: item.label, actionLabel: 'Review repayment' }
      : { status: 'unavailable', reason: 'link_unresolved' };
  }
  return { status: 'available', editor: 'bill', recurringItemId: item.id, sourceName: item.label, actionLabel: 'Review bill' };
}

/** "Review bill: Rent, 28 Sep" — name, type and date, for assistive technology. */
export function sourceReviewAccessibilityLabel(destination: Extract<SourceReviewDestination, { status: 'available' }>, dateLabel: string | null): string {
  return `${destination.actionLabel}: ${destination.sourceName}${dateLabel ? `, ${dateLabel}` : ''}`;
}
