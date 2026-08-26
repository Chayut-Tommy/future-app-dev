import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The OS Reduce Motion preference, kept live via reduceMotionChanged.
 * Defaults to `true` (no animation) until the async initial check resolves
 * — the safe default for a customer who has Reduce Motion on must never
 * see even one animated frame while this is still resolving.
 *
 * Wave 10 — this hook is THE single application authority for Reduced
 * Motion. The former local patterns (AddAnythingSheet's own listener,
 * shared/Toast's own listener; ThisMonthCard's died with the flip
 * removal) are consolidated here: one subscription per consumer, correct
 * cleanup, live updates on the OS setting change, and the conservative
 * pre-resolution default everywhere. Reduced Motion is a PARALLEL BUILD,
 * never merely faster motion — every consumer commits the identical final
 * state whether or not any animation ran (motion hard rule 5).
 */
export function useReduceMotion(): boolean {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceMotionEnabled;
}
