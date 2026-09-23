import { useRef } from 'react';

/**
 * Pass D0.1 — a sheet keeps showing what it was presented with until its native
 * dismissal has finished.
 *
 * Every host of the shared editors clears its edit target in the SAME update
 * that hides the editor (`setVisible(false); setEditItem(null)`). The native
 * sheet is still animating away at that point, so the editor re-rendered as its
 * "Add …" form for a few frames — the wrong form flashing during dismissal
 * (device finding D01-01). Correcting that in each of the ~30 hosts would be a
 * caller-specific timing fix; correcting it here, inside the editor, fixes the
 * ownership once: while `visible` is false the editor keeps the value it last
 * had while visible, and it adopts the host's new value only when it is next
 * presented. No timer, no delay, no extra render.
 */
export function useLatchedWhileHidden<T>(visible: boolean, value: T): T {
  const latched = useRef(value);
  if (visible) latched.current = value;
  return visible ? value : latched.current;
}
