/**
 * Nolie Design 5.1 Wave 8 correction — the one Settings action's geometry.
 *
 * Pure and RN-free, so both the control and `Screen`'s reserved header
 * inset read the SAME numbers. They used to be two independently hardcoded
 * values on Today, which is how the gear came to overlap the greeting.
 */

/** 44pt minimum target, met exactly. */
export const SETTINGS_ACTION_SIZE = 44;

/** Below the safe-area inset, so the control never touches the status bar
 * or a notch. */
export const SETTINGS_TOP_OFFSET = 4;

/** Horizontal space `Screen` reserves in its title row so a long title can
 * never run underneath the control. The action's own width plus a gap. */
export const SETTINGS_HEADER_INSET = SETTINGS_ACTION_SIZE + 12;
