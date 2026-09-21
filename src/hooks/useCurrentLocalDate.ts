import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * The single live "today" value a screen's month headings, month-to-date
 * calculation bounds, and relative-day labels should all derive from
 * (Round 6 correction). A `useMemo(() => new Date(), [])`-style capture, or
 * a `useMemo(() => computeX(data, new Date()), [data])` whose OTHER
 * dependency is what actually triggers recomputation, both go stale the
 * moment real time passes without that dependency changing — a screen left
 * open across local midnight (or a month/year boundary reached with zero
 * new transactions) keeps reading yesterday's date indefinitely. This hook
 * instead owns the refresh itself, independent of any data change:
 *
 * - refreshes on mount;
 * - refreshes whenever the owning screen regains React Navigation focus
 *   (tab switch back to this screen);
 * - refreshes whenever the app returns to the foreground from background;
 * - refreshes exactly at the next local midnight, then reschedules for the
 *   one after that — so a screen left open overnight self-corrects even
 *   without a tab switch or backgrounding.
 *
 * Every listener/timer is torn down on unmount. Always derives the local
 * calendar day from getFullYear()/getMonth()/getDate() — never
 * toISOString(), which would shift the calendar day for any timezone with
 * a non-zero UTC offset.
 */
export function useCurrentLocalDate(): Date {
  const [date, setDate] = useState(() => new Date());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    setDate(new Date());
  }, []);

  const scheduleMidnightRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const now = new Date();
    // A few seconds past local midnight, not exactly at it — avoids a
    // sub-millisecond race where the timer fires a moment before the
    // device clock actually turns over.
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
    timerRef.current = setTimeout(() => {
      setDate(new Date());
      scheduleMidnightRefresh();
    }, delay);
    // Pass C.3 evidence closure — under Node (Jest), a timer that outlives a
    // sandbox torn down before React's deferred unmount cleanup runs would
    // keep the whole process alive for hours ("Jest did not exit one second
    // after the test run has completed"). Marking it as not holding the
    // process open has NO effect on device: React Native timer ids are plain
    // numbers with no `unref`, and the timer still fires and is still cleared
    // exactly as before.
    (timerRef.current as unknown as { unref?: () => void }).unref?.();
  }, []);

  useEffect(() => {
    scheduleMidnightRefresh();
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        setDate(new Date());
        scheduleMidnightRefresh();
      }
    });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      subscription.remove();
    };
  }, [scheduleMidnightRefresh]);

  // Tab/screen focus — a screen backgrounded behind another tab (not the
  // whole app) still needs a refresh the moment the user switches back.
  useFocusEffect(refresh);

  return date;
}
