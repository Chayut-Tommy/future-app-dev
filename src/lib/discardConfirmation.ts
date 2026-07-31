import { Alert } from 'react-native';

/** Shared "Discard changes?" gate used by every dismiss path (swipe,
 * tap-outside, Cancel button) — closes immediately when there's nothing to
 * lose, otherwise confirms first (PRD ask: never silently drop what the
 * user typed). `title`/`message` are optional so a specific form (e.g.
 * "Discard income?") can use wording that names what's actually being
 * lost — every existing caller that omits them keeps the exact original
 * generic copy, unchanged. */
export function confirmDiscardIfDirty(
  isDirty: boolean,
  onDiscard: () => void,
  title: string = 'Discard changes?',
  message: string = 'You have unsaved changes that will be lost.'
) {
  if (!isDirty) {
    onDiscard();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}
