import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useAppState } from '../state/AppStateContext';
import { useCelebration } from '../state/CelebrationContext';
import { buildSaveConfirmation } from '../lib/celebrations';
import { EDITOR_SAVE_FAILED_COPY, EDITOR_SAVING_LABEL, EDITOR_UNCONFIRMED_COPY, isDurableTimeout } from '../lib/editorCompletion';

/**
 * Pass D0.1 — the ONE Main-payday selection lifecycle, shared by the Money
 * chooser and the Wealth (Income sources) chooser so neither has a timing fix
 * of its own. It owns no persistence: `setMainPaydayIncome` is the provider's
 * durable, write-first action (the same owner the income editor's "Use as my
 * main payday" option rides).
 *
 *   choose(current main) → deterministic no-op: no write, no success message;
 *   choose(another)      → one pending state (duplicate taps refused by a ref),
 *                          `Saving…` announced once, and ONLY after the choice is
 *                          stored: one confirmation, then `onDone('saved')`;
 *   rejected write       → nothing emitted, the previous Main payday stands, the
 *                          chooser stays open with the calm retryable error.
 */
export function useMainPaydaySelection({ visible, onDone }: { visible: boolean; onDone: (result: 'saved' | 'unchanged') => void }) {
  const { data, setMainPaydayIncome } = useAppState();
  const { confirmSaveSuccess } = useCelebration();
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const currentMainRef = useRef(data.user.mainPaydayIncomeId);
  currentMainRef.current = data.user.mainPaydayIncomeId;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!visible) return;
    pendingRef.current = false;
    setPending(false);
    setErrorText(null);
  }, [visible]);

  const choose = useCallback(
    async (incomeId: string) => {
      if (pendingRef.current) return;
      if (incomeId === currentMainRef.current) {
        onDoneRef.current('unchanged');
        return;
      }
      pendingRef.current = true;
      setErrorText(null);
      setPending(true);
      AccessibilityInfo.announceForAccessibility(EDITOR_SAVING_LABEL);
      try {
        await setMainPaydayIncome(incomeId);
      } catch (error) {
        pendingRef.current = false;
        if (!mountedRef.current) return;
        const text = isDurableTimeout(error) ? EDITOR_UNCONFIRMED_COPY : EDITOR_SAVE_FAILED_COPY;
        setPending(false);
        setErrorText(text);
        AccessibilityInfo.announceForAccessibility(text);
        return;
      }
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
      confirmSaveSuccess(buildSaveConfirmation('Main payday', 'updated'));
      onDoneRef.current('saved');
    },
    [setMainPaydayIncome, confirmSaveSuccess]
  );

  const clearError = useCallback(() => setErrorText(null), []);
  return { pending, errorText, choose, clearError };
}
