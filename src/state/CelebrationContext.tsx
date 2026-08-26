import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CelebrationEvent, SaveConfirmationCopy } from '../lib/celebrations';
import { hapticSoftSuccess } from '../lib/haptics';
import { SmallCelebrationToast } from '../components/celebrations/SmallCelebrationToast';
import { MediumCelebrationSheet } from '../components/celebrations/MediumCelebrationSheet';
import { BigCelebrationOverlay } from '../components/celebrations/BigCelebrationOverlay';

interface CelebrationContextValue {
  /** Fire a celebration. If one is already showing, the new one queues
   * behind it — Lulu celebrates one thing at a time, never stacks. */
  celebrate: (event: CelebrationEvent) => void;
  /** Wave 10 closure — the ONE action-scoped successful-Save boundary.
   * Call exactly once per successfully persisted customer Save, from the
   * action's own post-success point. Every call fires the save's single
   * softSuccess haptic — action identity, never queue state, so a second
   * Save while an earlier queue is still presenting earns its own haptic.
   * The optional confirmation is the save's calm factual toast: it stays
   * pending for the remainder of this commit, and any richer celebration
   * the SAME save unlocks (evaluated in descendant effects of the same
   * batched commit — child effects run before this provider's own flush
   * effect) claims and replaces it, so a milestone save never shows a
   * duplicate factual toast. Omit the confirmation for actions whose
   * feedback is already carried elsewhere (e.g. a navigation change). */
  confirmSaveSuccess: (confirmation?: SaveConfirmationCopy) => void;
  /** True whenever a medium/big (native-Modal) celebration is showing or
   * mid-dismissal — i.e. it is not yet safe to present another native
   * Modal. Toasts (small tier) never set this, since they carry no
   * backdrop and don't block anything. */
  isModalCelebrationActive: boolean;
}

const CelebrationContext = createContext<CelebrationContextValue | undefined>(undefined);

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<CelebrationEvent[]>([]);
  const active = queue[0] ?? null;
  // Wave 10 closure — haptic OWNERSHIP belongs to the customer ACTION.
  // The one softSuccess dispatcher is confirmSaveSuccess below, invoked
  // once per successfully persisted Save from the action's own
  // post-success boundary. celebrate() is haptically SILENT: celebrations
  // are presentation, and a queue is not an action (queue-emptiness as
  // identity silenced a second Save landing while an earlier Save's
  // toasts were still visible — the confirmed follow-up defect; and
  // renderer-mount dispatch before that fired once per queued event).
  // The pending-confirmation handshake is lifecycle-scoped only: a ref
  // plus one state serial, no timers, no windows, no Date.now, no
  // module-global flags.
  const confirmSerialRef = useRef(0);
  const pendingConfirmationRef = useRef<CelebrationEvent | null>(null);
  const [pendingFlushSerial, setPendingFlushSerial] = useState(0);

  const celebrate = useCallback((event: CelebrationEvent) => {
    // A celebration arriving while its own save's factual confirmation is
    // still pending IS that save's richer feedback — it claims (replaces)
    // the plain toast. Pending state never outlives the save's commit, so
    // an unrelated later celebration can never claim anything.
    pendingConfirmationRef.current = null;
    setQueue((prev) => [...prev, event]);
  }, []);

  const confirmSaveSuccess = useCallback((confirmation?: SaveConfirmationCopy) => {
    // Action-scoped: every distinct successful Save fires exactly one
    // softSuccess, whatever the queue is currently showing.
    hapticSoftSuccess();
    confirmSerialRef.current += 1;
    pendingConfirmationRef.current = confirmation
      ? { id: `save-confirmation-${confirmSerialRef.current}`, tier: 'small', ...confirmation }
      : null;
    setPendingFlushSerial(confirmSerialRef.current);
  }, []);

  // Flushes the factual confirmation AFTER every descendant effect of the
  // save's own batched commit has run (React runs child effects before a
  // parent's): if the save unlocked a celebration, that unlock's
  // celebrate() already claimed the pending toast and this is a no-op.
  useEffect(() => {
    if (pendingFlushSerial === 0) return;
    const pending = pendingConfirmationRef.current;
    if (!pending) return;
    pendingConfirmationRef.current = null;
    setQueue((prev) => [...prev, pending]);
  }, [pendingFlushSerial]);

  // Only called after the native Modal has actually finished dismissing
  // (Medium/BigCelebration's onDismissed, fired from RN Modal's onDismiss) —
  // never on button press directly. Advancing the queue changes `active`,
  // which can present the next Modal; doing that before the previous one's
  // native dismissal completes is the exact iOS two-Modals-in-one-tick race
  // this app has hit twice already (PRD bug report).
  function advance() {
    setQueue((prev) => prev.slice(1));
  }

  return (
    <CelebrationContext.Provider value={{ celebrate, confirmSaveSuccess, isModalCelebrationActive: active?.tier === 'medium' || active?.tier === 'big' }}>
      {children}
      {active?.tier === 'small' ? <SmallCelebrationToast key={active.id} event={active} onDone={advance} /> : null}
      {active?.tier === 'medium' ? <MediumCelebrationSheet key={active.id} event={active} onDismissed={advance} /> : null}
      {active?.tier === 'big' ? <BigCelebrationOverlay key={active.id} event={active} onDismissed={advance} /> : null}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error('useCelebration must be used within CelebrationProvider');
  return ctx;
}
