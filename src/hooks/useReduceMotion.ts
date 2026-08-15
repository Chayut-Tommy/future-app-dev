import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The OS Reduce Motion preference, kept live via reduceMotionChanged.
 * Defaults to `true` (no animation) until the async initial check resolves
 * — the safe default for a customer who has Reduce Motion on must never
 * see even one animated frame while this is still resolving. This is the
 * inverse of the existing AddAnythingSheet.tsx/ThisMonthCard.tsx precedent
 * (both default to `false`, an acceptable brief animated flash for their
 * own already-shipped, narrower surfaces) — Pass 2E's own explicit
 * requirement for new motion surfaces is the more conservative default, so
 * this is a new shared hook rather than changing those two call sites'
 * already-accepted behaviour.
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
