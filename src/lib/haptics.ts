import * as Haptics from 'expo-haptics';

/**
 * Wave 10 — THE haptic dispatch module. Exactly the four semantic events
 * doc C authorises (`MOTION_MS`'s own HAPTICS table mirrors this):
 *
 *   light       — selection (tile/chip/date/option)
 *   softSuccess — engine-confirmed save, ONCE, shared with any celebration
 *   warning     — blocked action / destructive confirm shown / save failure
 *   rigid       — confirmed deletion or reset
 *
 * Impact mapping is the direct expo-haptics counterpart of each semantic
 * name: Light and Rigid impacts, Soft impact for softSuccess, and the
 * Warning notification type for warning. Every dispatch swallows failure —
 * unsupported devices stay quiet. Forbidden (doc C): scroll, tab taps,
 * number changes, score movement, toast echo. Nothing outside this module
 * may call expo-haptics; ownership lives with the ACTION (a save's single
 * softSuccess is carried by its celebration tier, since saves themselves
 * fire nothing — so a queued celebration pair can never double-fire the
 * same save, and a plain confirmation toast stays silent).
 */
export function hapticLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticSoftSuccess(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
}

export function hapticWarning(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function hapticRigid(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
}
