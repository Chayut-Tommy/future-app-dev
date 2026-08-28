import React, { useMemo } from 'react';
import { OptionsSheet, SheetOption } from '../shared/OptionsSheet';
import { useAppState } from '../../state/AppStateContext';
import type { Transaction } from '../../types/models';
import {
  ClassificationChoice,
  LinkCandidate,
  buildClassificationOptions,
  interpretClassificationSelection,
} from '../../lib/calculations/occurrenceResolution';

/**
 * A1 — the manual-transaction classification / correction sheet.
 *
 * Presents an EXPLICIT choice for a manual income/expense that may correspond
 * to a scheduled item: one "This is …" row per candidate occurrence, then a
 * single "Keep separate" row. There is deliberately NO preselected/default
 * option — candidate ORDERING (done by the caller via `orderLinkCandidates`)
 * only orders/explains; the customer establishes the relationship by tapping.
 * Cancelling (swipe / backdrop / Close) invokes no transition, so it writes
 * nothing. Uses the existing Design 5.1 `OptionsSheet` authority (native modal
 * boundary, Reduce Motion, focus, dismissal) — no new dependency or one-off
 * design system, and no technical terms in customer copy.
 */
export function OccurrenceClassificationSheet({
  visible,
  transaction,
  candidates,
  onClose,
  onResolved,
  onConflict,
  onChoose,
  onDismissWithoutChoice,
  variant,
  title,
}: {
  visible: boolean;
  /** The existing transaction to classify (correction mode). Omit/null in
   * creation mode, where `onChoose` receives the choice and the caller creates
   * the transaction with the resolution. */
  transaction: Pick<Transaction, 'id'> | null;
  /** Candidate occurrences, already ordered by the caller. */
  candidates: LinkCandidate[];
  onClose: () => void;
  /** Called after a classification is written (linked or kept separate). */
  onResolved?: () => void;
  /** Called when a link is rejected because another record already covers the
   * occurrence — the caller shows a calm correction message. */
  onConflict?: () => void;
  /** CREATION mode — when provided, the choice is handed to the caller instead
   * of writing an existing transaction, so the transaction is created exactly
   * once with the chosen relationship. */
  onChoose?: (choice: ClassificationChoice) => void;
  /** Fired once AFTER native dismissal completes when the sheet was dismissed
   * WITHOUT a selection (cancel / backdrop / swipe / back). Lets the caller
   * restore its draft and reset its pending state deterministically — the
   * counterpart to `onChoose`/`onResolved` on the selection path. A real
   * selection never fires this. */
  onDismissWithoutChoice?: () => void;
  /** Whether this is classifying an expense (against bills) or income (against
   * income schedules) — drives the customer-facing wording. */
  variant?: 'income' | 'expense';
  title?: string;
}) {
  const { linkTransactionToOccurrence, markTransactionIndependent } = useAppState();

  const options = useMemo(() => buildClassificationOptions(candidates, variant), [candidates, variant]);

  const sheetOptions: SheetOption[] = useMemo(
    () =>
      options.map((o) => ({
        key: o.key,
        icon: o.kind === 'link' ? 'calendar-outline' : 'remove-circle-outline',
        label: o.label,
        description: o.description,
      })),
    [options]
  );

  function handleSelect(key: string) {
    const choice = interpretClassificationSelection(key, options);
    if (!choice) return; // unknown key — no write
    // Creation mode — hand the choice to the caller (it creates the txn once).
    if (onChoose) {
      onChoose(choice);
      onResolved?.();
      return;
    }
    // Correction mode — classify the existing transaction.
    if (!transaction) return;
    if (choice.kind === 'independent') {
      markTransactionIndependent(transaction.id);
      onResolved?.();
      return;
    }
    const result = linkTransactionToOccurrence(transaction.id, choice.occurrenceId, choice.isRepayment);
    if (!result.applied && result.reason === 'conflict') {
      onConflict?.();
      return;
    }
    onResolved?.();
  }

  return (
    <OptionsSheet
      visible={visible}
      onClose={onClose}
      title={title ?? (variant === 'expense' ? 'Is this payment for a scheduled bill?' : variant === 'income' ? 'Is this one of your scheduled income payments?' : 'Does this record belong to one of your scheduled items?')}
      subtitle={
        variant === 'expense'
          ? 'Choose a bill, or save this as a separate expense.'
          : variant === 'income'
          ? 'Choose the income this covers, or keep it separate.'
          : 'Choose the scheduled item this record covers, or keep it separate. Nothing is saved until you choose.'
      }
      options={sheetOptions}
      onSelect={handleSelect}
      onClosed={(selectedKey) => {
        // A choice-less dismissal (cancel / backdrop / swipe / back) reports a
        // null key at the true completion boundary — the selection path fires
        // onSelect→onChoose instead and never reaches here with a key.
        if (selectedKey === null) onDismissWithoutChoice?.();
      }}
    />
  );
}
