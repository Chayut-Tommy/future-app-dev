import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Reminder focus/announcements task — announces `message` via
 * AccessibilityInfo.announceForAccessibility exactly once per distinct
 * message. Never re-announces the same message on an ordinary re-render
 * while it persists (e.g. the customer retyping without changing the
 * underlying validation error), and never moves focus itself — the field
 * being edited keeps it, satisfying "announced once per distinct error
 * without moving focus away from the field." Passing null/undefined only
 * clears the dedupe key; it never announces anything.
 */
export function useAnnounceOnce(message: string | null | undefined, options?: { silent?: boolean }) {
  const lastAnnouncedRef = useRef<string | null>(null);
  // Pass D — `silent` records a new message as already announced WITHOUT speaking it,
  // for a host that is announcing the same change in its own single sentence (the
  // Look Ahead's "Estimate updated"). Omitted, the hook behaves exactly as before.
  const silent = options?.silent === true;
  useEffect(() => {
    const next = message ?? null;
    if (next === lastAnnouncedRef.current) return;
    lastAnnouncedRef.current = next;
    if (next && !silent) AccessibilityInfo.announceForAccessibility(next);
    // `silent` is read for the render that changed the message; it is not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);
}
