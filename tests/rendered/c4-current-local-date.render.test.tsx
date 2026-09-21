// Pass C.4 — shared-hook verification for useCurrentLocalDate's unref'd midnight
// timer (added in C.3 to stop a leaked timer holding the Jest process open).
//   1. `unref` is optional / platform-safe (React Native timer ids are numbers).
//   2. The timer still refreshes the date at the next local-calendar boundary.
//   3. Cleanup clears it on unmount.
//   4. Application behaviour is otherwise unchanged (foreground refresh).

import React from 'react';
import { AppState, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { act, render, screen } from '@testing-library/react-native';

import { useCurrentLocalDate } from '../../src/hooks/useCurrentLocalDate';

function Probe() {
  const d = useCurrentLocalDate();
  return <Text testID="date">{`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`}</Text>;
}
const App = () => (
  <NavigationContainer>
    <Probe />
  </NavigationContainer>
);

describe('useCurrentLocalDate — unref is safe and behaviour is unchanged', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  test('Node-style timer: unref() is called; the date rolls over a few seconds after local midnight; unmount clears the timer', async () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 18, 23, 59, 50) });
    const realSetTimeout = global.setTimeout;
    const unrefs: jest.Mock[] = [];
    const midnightHandles: any[] = [];
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...args: any[]) => {
      const handle: any = realSetTimeout(fn, ms, ...args);
      if (ms && ms >= 1000 && handle && typeof handle === 'object') {
        const u = jest.fn();
        handle.unref = u;
        unrefs.push(u);
        midnightHandles.push(handle);
      }
      return handle;
    }) as any);
    const view = await render(<App />);
    expect(screen.getByTestId('date')).toHaveTextContent('2026-9-18');
    expect(unrefs.length).toBeGreaterThanOrEqual(1);
    expect(unrefs[0]).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(16_000); }); // 00:00:06 the next local day
    expect(screen.getByTestId('date')).toHaveTextContent('2026-9-19');
    expect(unrefs.length).toBeGreaterThanOrEqual(2); // rescheduled for the following midnight, unref'd again
    spy.mockRestore();
    const clear = jest.spyOn(global, 'clearTimeout');
    await view.unmount();
    // Cleanup cleared the pending (rescheduled) midnight timer itself.
    expect(clear.mock.calls.some((c) => c[0] === midnightHandles[midnightHandles.length - 1])).toBe(true);
  }, 30000);

  test('React Native-style timer (a plain number, no unref): no throw, still schedules, still refreshes', async () => {
    jest.useFakeTimers({ now: new Date(2026, 11, 31, 23, 59, 50) });
    const realSetTimeout = global.setTimeout;
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...args: any[]) => Number(realSetTimeout(fn, ms, ...args))) as any);
    await render(<App />);
    expect(screen.getByTestId('date')).toHaveTextContent('2026-12-31');
    await act(async () => { jest.advanceTimersByTime(16_000); });
    expect(screen.getByTestId('date')).toHaveTextContent('2027-1-1'); // year boundary
    spy.mockRestore();
  }, 30000);

  test('returning to the foreground still refreshes the date immediately', async () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 18, 10, 0, 0) });
    let handler: ((s: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: any) => { handler = h; return { remove: jest.fn() }; }) as any);
    await render(<App />);
    expect(screen.getByTestId('date')).toHaveTextContent('2026-9-18');
    jest.setSystemTime(new Date(2026, 8, 20, 9, 0, 0));
    await act(async () => { handler?.('active'); });
    expect(screen.getByTestId('date')).toHaveTextContent('2026-9-20');
  }, 30000);
});
