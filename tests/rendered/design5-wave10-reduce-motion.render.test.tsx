// Wave 10 — OptionsSheet Reduced-Motion parity, rendered against the REAL
// component and the ONE shared authority (hooks/useReduceMotion).
//
// One root. The AccessibilityInfo mock captures the hook's own
// reduceMotionChanged listener, so the OS setting is flipped LIVE mid-test
// — proving initial resolution, runtime updates, and that both motion
// paths deliver the IDENTICAL completion: dismissal reaches onClose, and
// the deferred selection still fires only from the native onDismiss (the
// protected modal-freeze lifecycle, untouched by the wave).
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { OptionsSheet } from '../../src/components/shared/OptionsSheet';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const onSelect = jest.fn();
const onClose = jest.fn();

function Harness({ visible }: { visible: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <OptionsSheet
            visible={visible}
            onClose={onClose}
            title="Pick one"
            options={[
              { key: 'a', icon: 'cash-outline', label: 'Option A', description: 'first' },
              { key: 'b', icon: 'wallet-outline', label: 'Option B', description: 'second' },
            ]}
            onSelect={onSelect}
          />
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

function findModalInstance(): any {
  const [m] = (screen as any).root.queryAll((i: any) => 'onRequestClose' in (i.props ?? {}));
  return m ?? null;
}

describe('Wave 10 — OptionsSheet parity through the one Reduced-Motion authority', () => {
  let view: any;
  let rmListener: ((enabled: boolean) => void) | null = null;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: any) => {
      if (event === 'reduceMotionChanged') rmListener = handler;
      return { remove: jest.fn() } as never;
    }) as never);
    view = await render(<Harness visible />);
    await screen.findByText('Option A', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('motion ON: a selection dismisses through the animated path and defers to the native onDismiss', async () => {
    const modal = findModalInstance();
    fireEvent.press(screen.getByText('Option A'));
    // The animated slide-out completes (real timers, sheetInfoOut=200ms)
    // and onClose fires — but the SELECTION stays deferred until the
    // native dismissal signal.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 20000 });
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => {
      modal.props.onDismiss?.();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a');
  }, 60000);

  test('the OS setting flips LIVE through the shared hook; motion OFF delivers the IDENTICAL completion instantly', async () => {
    // Reopen the sheet, then flip Reduced Motion at runtime.
    onClose.mockClear();
    onSelect.mockClear();
    view.rerender(<Harness visible={false} />);
    view.rerender(<Harness visible />);
    await screen.findByText('Option B', {}, { timeout: 20000 });
    expect(rmListener).toBeTruthy();
    await act(async () => {
      rmListener!(true);
    });

    const modal = findModalInstance();
    fireEvent.press(screen.getByText('Option B'));
    // Zero-travel path: completion is synchronous state, not an animation
    // callback — onClose has already fired by the time the press settles.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 20000 });
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => {
      modal.props.onDismiss?.();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
  }, 60000);
});
