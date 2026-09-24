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

/**
 * Pass E — the same gate for a HANDOFF rather than a dismissal: the user is leaving a
 * dirty form to open a child flow they will come back to, so losing the draft is not
 * the only sensible outcome and neither is keeping it. Same primitive, same fast path
 * (nothing unsaved → continue immediately, no prompt), same "Keep editing" cancel
 * semantics; it only adds the explicit Save choice that a dismissal does not need.
 *
 * Both outcomes are the user's own decision, so nothing is ever committed or dropped
 * merely because the child flow was opened.
 */
export function confirmSaveOrDiscardIfDirty(
  isDirty: boolean,
  handlers: { onSave: () => void; onDiscard: () => void },
  title: string = 'Save your changes?',
  message: string = 'You have unsaved changes. Save them before continuing, or discard them.'
) {
  if (!isDirty) {
    handlers.onDiscard();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: handlers.onDiscard },
    { text: 'Save and continue', onPress: handlers.onSave },
  ]);
}
