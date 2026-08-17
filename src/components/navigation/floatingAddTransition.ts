/**
 * Floating navigation — correction round. The single deterministic owner of
 * the FAB/tray/AddAnythingSheet hand-off, replacing the previous design
 * where the tray's own native Modal and AddAnythingSheet's native Modal
 * could both be asked to present at once (see QuickActionsTray.tsx's own
 * doc comment for the confirmed device root cause: presenting a second
 * native modal while the first is still fully presented, then dismissing
 * the first while the second sits on top of it, leaves an orphaned,
 * invisible, touch-intercepting native view).
 *
 * The core invariant this module exists to guarantee: AddAnythingSheet's
 * native Modal (`isSheetOpen`) and the tray (`isTrayMounted`) are NEVER
 * both true for the same phase — proven exhaustively over all five phases
 * in tests/floating-add-transition.test.ts, not just asserted by
 * convention. The tray itself is no longer a native Modal at all (see
 * QuickActionsTray.tsx) — it's a plain absolutely-positioned overlay — so
 * even if this invariant were somehow violated, there would be no second
 * native presentation to race against; this module keeps the guarantee
 * explicit anyway, since a plain overlay drawn on top of an already-open
 * AddAnythingSheet would still be a confusing, effectively-illegal state.
 */
export type FloatingAddPhase = 'closed' | 'trayOpen' | 'closingForAction' | 'closingForDismiss' | 'addSheetOpen';

export type FloatingAddEvent = 'PRESS_FAB' | 'SELECT_ACTION' | 'REQUEST_DISMISS' | 'TRAY_CLOSED' | 'SHEET_CLOSED';

export const INITIAL_FLOATING_ADD_PHASE: FloatingAddPhase = 'closed';

/**
 * Pure transition function. Every event not valid for the current phase is
 * a no-op (returns the SAME phase) — this is what makes illegal
 * transitions (e.g. a stale animation-completion callback arriving after a
 * newer one already resolved, or a second SELECT_ACTION while already
 * closing) structurally impossible to act on, without every call site
 * needing its own ad hoc guard.
 */
export function reduceFloatingAddPhase(phase: FloatingAddPhase, event: FloatingAddEvent): FloatingAddPhase {
  switch (event) {
    case 'PRESS_FAB':
      if (phase === 'closed') return 'trayOpen';
      if (phase === 'trayOpen') return 'closingForDismiss';
      return phase; // mid-transition or sheet already open — ignored, not queued
    case 'SELECT_ACTION':
      // Only a genuinely open, interactive tray can accept a selection —
      // once closing has already started (for any reason), a tile tap
      // must never be able to resurrect it into a different closing path.
      return phase === 'trayOpen' ? 'closingForAction' : phase;
    case 'REQUEST_DISMISS':
      return phase === 'trayOpen' ? 'closingForDismiss' : phase;
    case 'TRAY_CLOSED':
      // The tray's own close animation has genuinely finished — the ONLY
      // signal that unmounts it and, if a tile was selected, permits
      // AddAnythingSheet to open. Never reachable from 'trayOpen' itself
      // (nothing has asked it to close yet), so a stray/duplicate
      // TRAY_CLOSED can never fire from the wrong phase.
      if (phase === 'closingForAction') return 'addSheetOpen';
      if (phase === 'closingForDismiss') return 'closed';
      return phase;
    case 'SHEET_CLOSED':
      return phase === 'addSheetOpen' ? 'closed' : phase;
    default:
      return phase;
  }
}

/** The three phases QuickActionsTray.tsx itself needs to know about — it is
 * only ever mounted while `isTrayMounted` is true, so this is the type its
 * own `phase` prop is declared with (imported from here, not redeclared
 * there, so the two can never drift apart). */
export type TrayPhase = Extract<FloatingAddPhase, 'trayOpen' | 'closingForAction' | 'closingForDismiss'>;

/** True while the tray should be mounted at all (open or animating closed).
 * A type predicate so callers narrow `phase` to `TrayPhase` for free at the
 * exact point they decide whether to render <QuickActionsTray>. */
export function isTrayMounted(phase: FloatingAddPhase): phase is TrayPhase {
  return phase === 'trayOpen' || phase === 'closingForAction' || phase === 'closingForDismiss';
}

/** True only while the tray should accept taps — false the instant a
 * selection or dismiss has been requested, even before its close animation
 * finishes (the "disable tray/backdrop pointer events immediately"
 * requirement). */
export function isTrayInteractive(phase: FloatingAddPhase): boolean {
  return phase === 'trayOpen';
}

/** True only in the one phase reserved for AddAnythingSheet. */
export function isSheetOpen(phase: FloatingAddPhase): boolean {
  return phase === 'addSheetOpen';
}

/** The invariant: never true for any reachable phase. See this module's
 * own header comment and the exhaustive test coverage. */
export function bothModalsVisible(phase: FloatingAddPhase): boolean {
  return isSheetOpen(phase) && isTrayMounted(phase);
}
