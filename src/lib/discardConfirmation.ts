import { Alert } from 'react-native';

/** Shared "Discard changes?" gate used by every dismiss path (swipe,
 * tap-outside, Cancel button) — closes immediately when there's nothing to
 * lose, otherwise confirms first (PRD ask: never silently drop what the
 * user typed). */
export function confirmDiscardIfDirty(isDirty: boolean, onDiscard: () => void) {
  if (!isDirty) {
    onDiscard();
    return;
  }
  Alert.alert('Discard changes?', 'You have unsaved changes that will be lost.', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onDiscard },
  ]);
}
