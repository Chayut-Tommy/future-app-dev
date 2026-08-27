import { AccessibilityInfo } from 'react-native';
import type { RefObject } from 'react';

/**
 * Wave 11 — the ONE focus-helper authority (consolidates the former
 * a11yFocus.ts and accessibilityFocus.ts pair, per the Design 5.1 Motion
 * and Accessibility source's focus map note).
 *
 * One mechanism on both platforms: React Native 0.81's supported
 * AccessibilityInfo.sendAccessibilityEvent(host, 'focus') — never the
 * deprecated iOS-only setAccessibilityFocus and never findNodeHandle,
 * whose dev-mode throw on an unmounted/replaced node was a real crash
 * class (reproduced from the checklist's focus restoration). Presentation
 * only: no navigation, no timers, no global state, no elapsed-time
 * deduplication, nothing scheduled — a call either dispatches immediately
 * against a live node or silently does nothing, so there is no listener or
 * pending work to clean up and no state write after unmount. Reduced
 * Motion never alters this behaviour (focus is not motion).
 */
export function focusElement(node: unknown): void {
  // Null-checked immediately before the native call (safeguard: every
  // focus target is re-checked at use, not at capture).
  if (!node) return;
  try {
    AccessibilityInfo.sendAccessibilityEvent(node as never, 'focus');
  } catch {
    // The target was replaced or unmounted between capture and dispatch —
    // a focus move is a courtesy, never a failure path.
  }
}

/** Ref-shaped convenience over the same single mechanism — kept because
 * half the consumers hold refs, not nodes. No behavioural difference. */
export function sendFocusEvent(ref: RefObject<unknown> | null | undefined): void {
  focusElement(ref?.current ?? null);
}
