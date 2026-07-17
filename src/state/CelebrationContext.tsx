import React, { createContext, useCallback, useContext, useState } from 'react';
import { CelebrationEvent } from '../lib/celebrations';
import { SmallCelebrationToast } from '../components/celebrations/SmallCelebrationToast';
import { MediumCelebrationSheet } from '../components/celebrations/MediumCelebrationSheet';
import { BigCelebrationOverlay } from '../components/celebrations/BigCelebrationOverlay';

interface CelebrationContextValue {
  /** Fire a celebration. If one is already showing, the new one queues
   * behind it — Lulu celebrates one thing at a time, never stacks. */
  celebrate: (event: CelebrationEvent) => void;
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

  const celebrate = useCallback((event: CelebrationEvent) => {
    setQueue((prev) => [...prev, event]);
  }, []);

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
    <CelebrationContext.Provider value={{ celebrate, isModalCelebrationActive: active?.tier === 'medium' || active?.tier === 'big' }}>
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
