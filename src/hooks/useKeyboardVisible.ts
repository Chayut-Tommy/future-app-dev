import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Tracks whether the software keyboard is currently showing. Used by the
 * floating nav capsule and FAB (floating navigation design pass) to hide
 * the whole dock/FAB assembly while a keyboard is up, so it never sits on
 * top of — or crowds — an input a screen is actively editing. iOS fires
 * `keyboardWillShow`/`Hide` ahead of the animation (matches the keyboard's
 * own timing better); Android has no reliable "will" pair, so it falls
 * back to `keyboardDidShow`/`Hide`.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}
