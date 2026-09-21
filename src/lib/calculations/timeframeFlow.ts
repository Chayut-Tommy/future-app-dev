import { LocalDate, localDatesEqual } from './localCalendar';
/**
 * Pass C.1 correction — the Available-Until-Payday card's timeframe chooser ↔
 * native date-picker transition, as an explicit, pure state machine.
 *
 * iOS can only present ONE React Native Modal at a time. Presenting the date
 * picker while the chooser sheet was still up made the picker silently never
 * appear (the confirmed device defect). This machine guarantees only one is
 * ever presented, sequencing each hand-off through the OTHER surface's native
 * dismissal-completion event (RN Modal `onDismiss`), never a timer:
 *
 *   idle ──open_chooser──▶ chooser
 *   chooser ──choose_date(iOS)──▶ chooser_to_picker ──chooser_dismissed──▶ picker
 *   chooser ──choose_date(Android)──▶ picker      (Android's picker is a dialog)
 *   picker ──close (confirm/commit)──▶ idle
 *   picker ──cancel(iOS)──▶ picker_to_chooser ──picker_dismissed──▶ chooser
 *   picker ──cancel(Android)──▶ chooser
 *   any ──close──▶ idle
 *
 * The two "…_to_…" stages are the in-flight hand-offs: NEITHER surface is
 * presented during them, so there is never a moment with two modals up. The
 * dismissal events only advance a hand-off that is actually pending (a
 * spurious or late dismissal on any other stage is ignored), so an
 * interruption always leaves a valid, non-stuck stage.
 */
export type TimeframeStage = 'idle' | 'chooser' | 'chooser_to_picker' | 'picker' | 'picker_to_chooser';

export type TimeframeEvent =
  | { type: 'open_chooser' }
  | { type: 'choose_date'; isIOS: boolean }
  | { type: 'chooser_dismissed' }
  | { type: 'cancel_picker'; isIOS: boolean }
  | { type: 'picker_dismissed' }
  | { type: 'close' };

export function timeframeFlowTransition(stage: TimeframeStage, event: TimeframeEvent): TimeframeStage {
  switch (event.type) {
    case 'open_chooser':
      return 'chooser';
    case 'choose_date':
      // Only meaningful from the open chooser; ignore if fired elsewhere.
      if (stage !== 'chooser') return stage;
      return event.isIOS ? 'chooser_to_picker' : 'picker';
    case 'chooser_dismissed':
      // Present the picker ONLY once the chooser's native dismissal completed.
      return stage === 'chooser_to_picker' ? 'picker' : stage;
    case 'cancel_picker':
      if (stage !== 'picker') return stage;
      return event.isIOS ? 'picker_to_chooser' : 'chooser';
    case 'picker_dismissed':
      // Re-present the chooser ONLY once the picker's native dismissal completed.
      return stage === 'picker_to_chooser' ? 'chooser' : stage;
    case 'close':
      return 'idle';
    default:
      return stage;
  }
}

/** Exactly one surface is presented per stage — and never two at once. */
export const timeframeSheetVisible = (stage: TimeframeStage): boolean => stage === 'chooser';
export const datePickerVisible = (stage: TimeframeStage): boolean => stage === 'picker';

// --- Pass C.2 correction — which chooser row is ACTIVE -----------------------

export type TimeframeSelection = 'payday' | 'month_end' | 'custom';

/** Pure: which Timeframe-sheet row the card's current target corresponds to.
 * `null` → Until payday; the month-end quick choice's exact date → End of this
 * month; anything else → a custom date. Display-only; never writes. */
export function resolveTimeframeSelection(
  currentTarget: LocalDate | null | undefined,
  monthEndTarget: LocalDate | null,
  /** Pass C.2 closure — HOW the current target was chosen. When known it wins
   * outright, so a custom date that happens to equal month end (or payday, or
   * a payday that falls on month end) still highlights the row the customer
   * actually used. Date equality is only the fallback for callers that did
   * not record the mode. */
  mode?: TimeframeSelection | null
): TimeframeSelection {
  if (!currentTarget) return 'payday';
  if (mode === 'month_end' || mode === 'custom') return mode;
  if (monthEndTarget && localDatesEqual(currentTarget, monthEndTarget)) return 'month_end';
  return 'custom';
}
