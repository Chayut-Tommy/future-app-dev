import React, { createContext, useCallback, useContext, useState } from 'react';
import { CelebrationEvent } from '../lib/celebrations';
import { SmallCelebrationToast } from '../components/celebrations/SmallCelebrationToast';
import { MediumCelebrationSheet } from '../components/celebrations/MediumCelebrationSheet';
import { BigCelebrationOverlay } from '../components/celebrations/BigCelebrationOverlay';

interface CelebrationContextValue {
  /** Fire a celebration. If one is already showing, the new one queues
   * behind it — Lulu celebrates one thing at a time, never stacks. */
  celebrate: (event: CelebrationEvent) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | undefined>(undefined);

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<CelebrationEvent[]>([]);
  const active = queue[0] ?? null;

  const celebrate = useCallback((event: CelebrationEvent) => {
    setQueue((prev) => [...prev, event]);
  }, []);

  function advance() {
    setQueue((prev) => prev.slice(1));
  }

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      {active?.tier === 'small' ? <SmallCelebrationToast key={active.id + queue.length} event={active} onDone={advance} /> : null}
      {active?.tier === 'medium' ? <MediumCelebrationSheet key={active.id + queue.length} event={active} onClose={advance} /> : null}
      {active?.tier === 'big' ? <BigCelebrationOverlay key={active.id + queue.length} event={active} onClose={advance} /> : null}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error('useCelebration must be used within CelebrationProvider');
  return ctx;
}
