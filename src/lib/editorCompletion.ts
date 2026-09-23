/**
 * Pass D0 — Durable Editor Completion Foundation: the ONE structured outcome the
 * four shared editors (income, bill, credit card, asset/liability) report.
 *
 * An editor closing proves nothing. A host learns what happened only from this
 * value, emitted exactly once per presentation:
 *   - `saved` / `deleted` — emitted ONLY after the change is durably stored;
 *   - `dismissed`         — Cancel, Back, swipe or backdrop: nothing was written.
 * A failed write emits NOTHING: the editor stays open with the draft intact.
 *
 * It carries identity only. It never carries a balance, a forecast, an
 * Available-until-payday amount or any other derived figure: hosts re-read the
 * authoritative selectors instead. Pure — no React, no storage.
 */
export type EditorEntity = 'income' | 'bill' | 'credit_card' | 'asset' | 'liability';

export type EditorOutcome =
  | { outcome: 'saved'; operation: 'add' | 'update'; entity: EditorEntity; id: string }
  | { outcome: 'deleted'; operation: 'delete'; entity: EditorEntity; id: string }
  | { outcome: 'dismissed' };

export type EditorPendingKind = 'saving' | 'deleting';

export const EDITOR_SAVING_LABEL = 'Saving…';
export const EDITOR_DELETING_LABEL = 'Deleting…';

/** "Nothing was changed" is literally true: the state layer is write-first, so a
 * rejected write leaves memory and storage exactly as they were (proven in
 * tests/rendered/d0-*.render.test.tsx, including after a later unrelated write,
 * a restart and a retry). */
export const EDITOR_SAVE_FAILED_COPY = 'We couldn’t save this change. Nothing was changed. Your details are still here — try again.';
export const EDITOR_DELETE_FAILED_COPY = 'We couldn’t delete this item. Nothing was changed. Try again.';

/** Pass D0.1 — the write did not settle in time. Its outcome is genuinely unknown, so this
 * copy makes NO claim that nothing changed; it asks the customer to check before retrying
 * (a retry is safe either way: every durable mutation is idempotent). */
export const EDITOR_UNCONFIRMED_COPY = 'This is taking longer than expected, so we couldn’t confirm it. Check whether it went through before trying again.';

/** Pass D0 §8 — a loan that a live repayment still points at is not deleted. */
export function linkedRepaymentDeletionCopy(liabilityWord: string, billName: string): string {
  return `This ${liabilityWord} is linked to ${billName}. Review the linked bill before deleting the ${liabilityWord}.`;
}

export function pendingLabel(kind: EditorPendingKind): string {
  return kind === 'saving' ? EDITOR_SAVING_LABEL : EDITOR_DELETING_LABEL;
}

/** Structural check (no import of the state layer, which would be circular here). */
export function isDurableTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'DurableWriteTimeout';
}
