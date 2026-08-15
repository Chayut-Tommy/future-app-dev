import { AccessibilityInfo } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useReduceMotion } from '../../src/hooks/useReduceMotion';

/**
 * Pass 2E — proves useReduceMotion's own explicit contract: default `true`
 * (no animation) until the async OS check resolves, then tracks the real
 * resolved value and live reduceMotionChanged events. Uses the real hook
 * against real react-native AccessibilityInfo APIs, only stubbing the
 * static isReduceMotionEnabled Promise/listener registration RN itself has
 * no host implementation for outside a device/simulator — never a
 * duplicate reimplementation of the hook's own logic.
 */
describe('useReduceMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('defaults to true (no animation) before the async check resolves, then reflects the resolved value', async () => {
    let resolveCheck: (enabled: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());

    // Conservative default: true (no animation) while still resolving.
    expect(result.current).toBe(true);

    resolveCheck(false);
    await waitFor(() => expect(result.current).toBe(false));
  });

  test('reflects true when the OS reports Reduce Motion is genuinely on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });

  test('tracks a live reduceMotionChanged event and cleans up its listener on unmount', async () => {
    let changeHandler: ((enabled: boolean) => void) | null = null;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, handler: (enabled: boolean) => void) => {
      changeHandler = handler;
      return { remove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
    }) as unknown as typeof AccessibilityInfo.addEventListener);

    const { result, unmount } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(false));

    expect(changeHandler).not.toBeNull();
    await act(async () => {
      changeHandler!(true);
    });
    await waitFor(() => expect(result.current).toBe(true));

    expect(remove).not.toHaveBeenCalled();
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
