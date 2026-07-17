import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useCelebration } from './CelebrationContext';
import { SavingsAllocationPromptSheet } from '../components/income/SavingsAllocationPromptSheet';

interface SavingsAllocationPromptContextValue {
  /** Ask the coordinator to show the one-time post-first-income prompt.
   * Fire-and-forget, safe to call from any component regardless of
   * whether that component survives afterward — the coordinator itself
   * decides when it's actually safe to present (PRD ask: "request
   * recorded synchronously before recurring-income state mutation"). A
   * no-op if a request is already pending or the prompt is already
   * showing — structurally enforced here, not left to callers to dedupe. */
  requestPrompt: () => void;
}

const SavingsAllocationPromptContext = createContext<SavingsAllocationPromptContextValue | undefined>(undefined);

type Status = 'idle' | 'pending' | 'active';

/**
 * Stable, always-mounted owner of the post-first-income Savings Allocation
 * prompt (PRD ask: mirrors the proven CelebrationContext pattern — a
 * provider mounted above the whole navigation tree, so it survives
 * regardless of which screen or card triggered the request, or whether
 * that originator unmounts afterward — see MoneyPictureChecklistCard's
 * self-unmount-on-checklist-completion case, the reason this exists as a
 * separate component from AddIncomeModal at all).
 *
 * `status` is the single structural guard against duplicate prompts:
 * `requestPrompt` only ever transitions 'idle' -> 'pending', so a second
 * call while already 'pending' or 'active' is a no-op, regardless of how
 * many qualifying saves fire in quick succession.
 *
 * On receiving a pending request, this deliberately does not present
 * immediately — the request can arrive while the originating income sheet
 * is still visually closing (its own dismiss animation, or in the
 * checklist case, being torn down abruptly). `InteractionManager
 * .runAfterInteractions` defers until the JS thread's queued
 * interactions/animations have actually drained, and `isModalCelebrationActive`
 * (from CelebrationContext) is also checked so this never races a
 * celebration Modal that might be queued for the same moment (e.g.
 * completing the last checklist step can also unlock an achievement).
 */
export function SavingsAllocationPromptProvider({ children }: { children: React.ReactNode }) {
  const { isModalCelebrationActive } = useCelebration();
  const [status, setStatus] = useState<Status>('idle');

  const requestPrompt = useCallback(() => {
    setStatus((prev) => (prev === 'idle' ? 'pending' : prev));
  }, []);

  useEffect(() => {
    if (status !== 'pending') return;
    if (isModalCelebrationActive) return; // re-evaluated when this flips false
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setStatus('active');
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [status, isModalCelebrationActive]);

  const handleDone = useCallback(() => {
    setStatus('idle');
  }, []);

  return (
    <SavingsAllocationPromptContext.Provider value={{ requestPrompt }}>
      {children}
      {status === 'active' ? <SavingsAllocationPromptSheet visible onDone={handleDone} /> : null}
    </SavingsAllocationPromptContext.Provider>
  );
}

export function useSavingsAllocationPrompt(): SavingsAllocationPromptContextValue {
  const ctx = useContext(SavingsAllocationPromptContext);
  if (!ctx) throw new Error('useSavingsAllocationPrompt must be used within SavingsAllocationPromptProvider');
  return ctx;
}
