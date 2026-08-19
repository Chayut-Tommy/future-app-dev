/**
 * Nolie Design 5.1 Wave 4 — one definition of bottom-sheet chrome.
 *
 * `InfoSheet`, `OptionsSheet` and `DatePickerModal` each carried their own
 * private copy of the same backdrop, surface, top radii, grabber and
 * safe-area bottom padding. Three copies meant three places for a token
 * migration to miss, and they had already drifted (paddingTop of `sm`,
 * `lg` and `md` respectively for no design reason).
 *
 * This consolidates the CHROME only. Each sheet deliberately keeps its own
 * `<Modal>` and its own dismissal lifecycle:
 *
 * - `OptionsSheet` defers `onSelect` to the native `onDismiss` (with an
 *   Android fallback) to avoid colliding two native modal transitions in
 *   one commit — the documented app-freeze defect. That is behaviour, not
 *   chrome, and is not touched here.
 * - `DatePickerModal` wraps a Modal on iOS only, because Android's date
 *   dialog is already its own overlay. Also behaviour, also untouched.
 *
 * Pure and RN-free apart from the token shapes it is handed, so the values
 * are assertable without rendering.
 */

export interface SheetChromeTokens {
  surface: string;
  scrim: string;
  grabber: string;
  radiusCard: number;
  spacingSm: number;
  spacingMd: number;
  spacingLg: number;
  /** The device's bottom safe-area inset. */
  insetBottom: number;
}

/** Width and height of the drag affordance at the top of a sheet. */
export const SHEET_GRABBER_WIDTH = 36;
export const SHEET_GRABBER_HEIGHT = 4;

export function sheetChromeStyles(t: SheetChromeTokens) {
  return {
    backdrop: {
      flex: 1,
      backgroundColor: t.scrim,
      justifyContent: 'flex-end' as const,
    },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: t.radiusCard,
      borderTopRightRadius: t.radiusCard,
      paddingHorizontal: t.spacingLg,
      paddingTop: t.spacingMd,
      // Never less than the design's own bottom padding, and never less
      // than the device's home-indicator inset.
      paddingBottom: Math.max(t.insetBottom, t.spacingLg),
    },
    grabber: {
      alignSelf: 'center' as const,
      width: SHEET_GRABBER_WIDTH,
      height: SHEET_GRABBER_HEIGHT,
      borderRadius: SHEET_GRABBER_HEIGHT / 2,
      backgroundColor: t.grabber,
      marginBottom: t.spacingMd,
    },
  };
}
