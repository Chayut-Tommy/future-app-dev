/**
 * Pure, dependency-free bookkeeping for AppData persistence (B2.0C). Kept
 * out of AppStateContext.tsx deliberately, even though that file itself
 * turns out to be importable in a plain-Node harness (React and
 * @react-native-async-storage/async-storage both tolerate being imported
 * outside a real app — confirmed empirically) — extracting these two
 * functions here makes their testability a property of this module's own
 * design (no React, no AsyncStorage, nothing that could ever fail to import
 * outside the RN runtime), not an accident of what other libraries happen
 * to tolerate at import time.
 *
 * Deliberately does NOT use per-write revision numbers. `createSerializedQueue`
 * (storage.ts) is a true FIFO — a write cannot even start until the one
 * issued before it has settled — so completions are structurally guaranteed
 * to arrive in issue order. Given that guarantee, a plain `pendingCount`
 * (issued-but-not-yet-settled writes) plus `status` derived from it is
 * sufficient to prevent an older write's completion from reporting
 * idle/error over a newer write that is still pending: a settle handler
 * only ever reports a terminal status when `pendingCount` reaches 0, i.e.
 * once nothing else issued is still outstanding (regression-protection
 * review, B2.0C corrected design §1).
 */

export type WriteKind = 'ordinary' | 'reset';

/**
 * `'none'` — no reset write outstanding (either none ever issued, or the
 * last one succeeded). `'pending'` — a reset write has been issued and has
 * not yet settled; the app-level UI must block onboarding/data-entry while
 * this holds (B2.0C mandatory correction 1). `'failed'` — the last reset
 * write was rejected and no successful reset write has landed since;
 * blocking continues, with retry offered, until it returns to `'none'`.
 * Deliberately independent of `status`/`pendingCount` (which reflect ALL
 * writes, ordinary and reset) so an ordinary write's own success/failure can
 * never misreport or obscure an unresolved reset.
 */
export type ResetState = 'none' | 'pending' | 'failed';

export interface PersistenceState {
  /** Number of AppData writes issued but not yet settled. */
  pendingCount: number;
  /** `'saving'` whenever pendingCount > 0; otherwise `'idle'` (last settled
   * write succeeded) or `'error'` (last settled write failed). */
  status: 'idle' | 'saving' | 'error';
  /** The kind of the most recently issued write — used only to choose which
   * copy the app-level failure surface shows; never used to gate reset
   * blocking (see ResetState above). */
  lastWriteKind: WriteKind;
  resetState: ResetState;
}

export const initialPersistenceState: PersistenceState = {
  pendingCount: 0,
  status: 'idle',
  lastWriteKind: 'ordinary',
  resetState: 'none',
};

/** Called synchronously, once, at the moment a write is issued (before its
 * promise has had any chance to settle). */
export function issueWrite(state: PersistenceState, kind: WriteKind): PersistenceState {
  return {
    pendingCount: state.pendingCount + 1,
    status: 'saving',
    lastWriteKind: kind,
    resetState: kind === 'reset' ? 'pending' : state.resetState,
  };
}

/** Called once a specific write's promise settles. `kind` is the kind that
 * specific write was issued with (closed over by the caller at issue time),
 * never re-derived from `state.lastWriteKind` — a different, later write may
 * have already changed that field by the time this one settles. */
export function settleWrite(state: PersistenceState, kind: WriteKind, outcome: 'success' | 'error'): PersistenceState {
  const pendingCount = state.pendingCount - 1;
  const status = pendingCount > 0 ? 'saving' : outcome === 'success' ? 'idle' : 'error';
  const resetState = kind === 'reset' ? (outcome === 'success' ? 'none' : 'failed') : state.resetState;
  return { ...state, pendingCount, status, resetState };
}

/** Duplicate-submission guard for resetAllData (B2.0C mandatory correction 1
 * §E) — a reset may only be *submitted* while no reset write is already
 * outstanding (pending) or awaiting retry (failed). */
export function canIssueReset(state: PersistenceState): boolean {
  return state.resetState === 'none';
}

/** Duplicate-tap guard for the single retry action, shared by the ordinary
 * banner and the reset overlay. Never allows a second concurrent reset
 * write; an ordinary retry is only meaningful while genuinely in `'error'`
 * with no reset outstanding. */
export function canRetry(state: PersistenceState): boolean {
  if (state.resetState === 'pending') return false;
  if (state.resetState === 'none' && state.status !== 'error') return false;
  return true;
}

/** Which kind a retry-triggered write should be tracked as — always
 * `'reset'` while a reset is awaiting retry, `'ordinary'` otherwise. Callers
 * must check `canRetry` first; this makes no guarantee on its own. */
export function retryWriteKind(state: PersistenceState): WriteKind {
  return state.resetState === 'failed' ? 'reset' : 'ordinary';
}
