import { AccessibilityInfo } from 'react-native';
import type { RefObject } from 'react';

/**
 * Reminder focus/announcements task — moves VoiceOver/TalkBack focus to a
 * real, currently-mounted accessible host using React Native 0.81's
 * supported, cross-platform mechanism
 * (AccessibilityInfo.sendAccessibilityEvent(hostRef, 'focus')) — never the
 * deprecated iOS-only setAccessibilityFocus. Silently no-ops when the ref
 * isn't attached to anything (not yet mounted, already unmounted, or the
 * target was conditionally never rendered) — every call site is free of its
 * own null-check boilerplate, but the check itself still happens
 * immediately before the native call, per the safeguard that every focus
 * target must be null-checked right before use.
 */
export function sendFocusEvent(ref: RefObject<any> | null | undefined) {
  const node = ref?.current;
  if (!node) return;
  AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
}
