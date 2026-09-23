import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { EDITOR_DELETE_FAILED_COPY, EDITOR_SAVE_FAILED_COPY, EDITOR_UNCONFIRMED_COPY, EditorOutcome, EditorPendingKind, isDurableTimeout, pendingLabel } from '../lib/editorCompletion';

/**
 * Pass D0 — the ONE editor-side lifecycle for a durable Save or Delete, shared by
 * the four editors so none of them re-implements it.
 *
 * It owns NO persistence. `mutate` is the provider's own durable action (which
 * resolves only after the write-first owner has stored the change); this hook
 * only sequences the editor around that promise:
 *   pending  → duplicate submissions refused synchronously (a ref, not state),
 *              `Saving…` / `Deleting…` announced once, dismissal refused;
 *   success  → the structured outcome emitted exactly once, THEN the editor closes;
 *   failure  → nothing emitted, the editor stays open, the draft is untouched, a
 *              calm retryable error is shown and announced once.
 * `dismiss` is the only other exit: it emits `dismissed` once and closes, and is
 * refused while a write is pending so the customer is never left unsure whether
 * the operation completed. The state layer bounds how long a write may stay
 * pending, so that refusal can never trap them.
 */
export function useDurableEditorCompletion({ visible, onOutcome }: { visible: boolean; onOutcome?: (outcome: EditorOutcome) => void }) {
  const [pending, setPending] = useState<EditorPendingKind | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const emittedRef = useRef(false);
  const mountedRef = useRef(true);
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A new presentation starts clean and may emit its own single outcome.
  useEffect(() => {
    if (!visible) return;
    emittedRef.current = false;
    pendingRef.current = false;
    setPending(null);
    setErrorText(null);
  }, [visible]);

  const emit = useCallback((outcome: EditorOutcome) => {
    if (emittedRef.current) return;
    emittedRef.current = true;
    onOutcomeRef.current?.(outcome);
  }, []);

  const run = useCallback(
    async (
      kind: EditorPendingKind,
      mutate: () => Promise<void>,
      success: Extract<EditorOutcome, { outcome: 'saved' | 'deleted' }>,
      onSuccess: () => void,
      /** An editor-specific refusal (a validation the state layer reports) keeps its own words. */
      messageFor?: (error: unknown) => string | null
    ): Promise<void> => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setErrorText(null);
      setPending(kind);
      AccessibilityInfo.announceForAccessibility(pendingLabel(kind));
      try {
        await mutate();
      } catch (error) {
        pendingRef.current = false;
        if (!mountedRef.current) return;
        // A timeout is NOT a rejection: never claim "Nothing was changed" for it.
        const text = messageFor?.(error) ?? (isDurableTimeout(error) ? EDITOR_UNCONFIRMED_COPY : kind === 'saving' ? EDITOR_SAVE_FAILED_COPY : EDITOR_DELETE_FAILED_COPY);
        setPending(null);
        setErrorText(text);
        AccessibilityInfo.announceForAccessibility(text);
        return;
      }
      pendingRef.current = false;
      // The change IS stored, so the outcome is reported and the success work runs
      // even if a host unmounted this editor as a side effect of the new data (the
      // setup checklist does exactly that). Only the local state write is skipped.
      if (mountedRef.current) setPending(null);
      emit(success);
      onSuccess();
    },
    [emit]
  );

  /** Cancel / Back / swipe / backdrop. Returns false (and does nothing) while a write is pending. */
  const dismiss = useCallback(
    (close: () => void): boolean => {
      if (pendingRef.current) return false;
      emit({ outcome: 'dismissed' });
      close();
      return true;
    },
    [emit]
  );

  const showError = useCallback((text: string | null) => setErrorText(text), []);

  return { pending, isPending: pending !== null, isPendingRef: pendingRef, errorText, showError, run, dismiss };
}

export type DurableEditorCompletion = ReturnType<typeof useDurableEditorCompletion>;
