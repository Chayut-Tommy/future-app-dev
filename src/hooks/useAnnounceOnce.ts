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
export function useAnnounceOnce(message: string | null | undefined) {
  const lastAnnouncedRef = useRef<string | null>(null);
  useEffect(() => {
    const next = message ?? null;
    if (next === lastAnnouncedRef.current) return;
    lastAnnouncedRef.current = next;
    if (next) AccessibilityInfo.announceForAccessibility(next);
  }, [message]);
}
