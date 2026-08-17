import { AccessibilityInfo, findNodeHandle, Platform } from 'react-native';

/**
 * Moves native accessibility focus to a mounted element. iOS VoiceOver and
 * Android TalkBack need genuinely different native calls (there is no
 * single RN API that moves focus correctly on both):
 * AccessibilityInfo.setAccessibilityFocus posts a real UIAccessibility
 * focus notification but is iOS-only and needs a legacy numeric node
 * handle (findNodeHandle); AccessibilityInfo.sendAccessibilityEvent(handle,
 * 'focus') is the modern, correctly-typed way to dispatch a native
 * TalkBack focus event on Android, taking the host instance directly.
 * Deliberately not using accessibilityLiveRegion for either platform — that
 * alone does not reliably move iOS focus.
 *
 * Originally written for AddAnythingSheet.tsx's own destination-switch
 * focus movement; extracted here so QuickActionsTray.tsx (floating
 * navigation design pass) can reuse the exact same logic rather than a
 * second, duplicate implementation.
 */
export function focusElement(node: React.Component<unknown> | React.ElementRef<any> | null) {
  if (!node) return;
  if (Platform.OS === 'ios') {
    const tag = findNodeHandle(node as never);
    if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
  } else {
    AccessibilityInfo.sendAccessibilityEvent(node as never, 'focus');
  }
}
