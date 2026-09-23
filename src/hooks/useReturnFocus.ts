import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { sendFocusEvent } from '../lib/a11yFocus';

/**
 * Pass D.5 — returning screen-reader focus to the control that opened a sheet.
 *
 * `arm()` is called when the control opens the sheet; `fire()` is called once the
 * sheet's dismissal has actually completed (the host's own completion hook). `fire`
 * is idempotent per open/close cycle, so a host that reports completion twice — or a
 * platform where both the native `onDismiss` and a visibility fallback run — moves
 * focus exactly once. Nothing is scheduled and no timer is used: a call either
 * dispatches against a live node or silently does nothing, exactly as the shared
 * focus helper already guarantees.
 *
 * When the origin has genuinely unmounted (a state change removed it), `fallbackRef`
 * receives focus instead, so focus is never left stranded on a dismissed sheet.
 */
export function useReturnFocus(fallbackRef?: React.RefObject<View | null>) {
  const ref = useRef<View | null>(null);
  const armed = useRef(false);

  const arm = useCallback(() => {
    armed.current = true;
  }, []);

  const fire = useCallback(() => {
    if (!armed.current) return;
    armed.current = false;
    const origin = ref.current;
    sendFocusEvent({ current: origin ?? fallbackRef?.current ?? null });
  }, [fallbackRef]);

  return { ref, arm, fire };
}
