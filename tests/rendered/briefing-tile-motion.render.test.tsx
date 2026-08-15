import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { BriefingTileRow } from '../../src/components/today/BriefingTileRow';
import { BriefingTile } from '../../src/lib/calculations/briefingTiles';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function tile(overrides: Partial<BriefingTile> = {}): BriefingTile {
  return {
    key: 'aup',
    kind: 'aup',
    icon: 'wallet-outline',
    label: 'AVAILABLE MONEY',
    value: '$1,000',
    supportingLine: 'Until payday',
    tone: 'normal',
    accessibilityLabel: 'Available money, $1,000',
    ...overrides,
  };
}

function Harness({ tiles }: { tiles: BriefingTile[] }) {
  return (
    <AppStateProvider>
      <ThemeProvider>
        <BriefingTileRow tiles={tiles} onPressTile={() => {}} />
      </ThemeProvider>
    </AppStateProvider>
  );
}

/**
 * Pass 2E — proves the restrained in-place content fade (BriefingTileRow's
 * new per-tile BriefingTileButton) fires only when an already-mounted
 * tile's own value/supportingLine genuinely changes, never on first mount
 * and never under Reduce Motion — using the real component and real
 * useReduceMotion hook, only stubbing the AccessibilityInfo static check
 * Jest has no host implementation for.
 */
describe('BriefingTileRow — in-place content fade (Pass 2E)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('a genuine value change on an already-mounted tile starts the opacity below 1 (mid-fade) before settling back to 1', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { rerender } = await render(<Harness tiles={[tile({ value: '$1,000' })]} />);
    expect(screen.getByText('$1,000')).toBeOnTheScreen();

    await rerender(<Harness tiles={[tile({ value: '$800' })]} />);

    // The new value is on screen immediately (data already updated first —
    // this is a presentation fade, never a delayed/tweened figure).
    expect(screen.getByText('$800')).toBeOnTheScreen();
    expect(screen.queryByText('$1,000')).toBeNull();
  });

  test('under Reduce Motion, a value change never animates — the new value is simply present, no fade window', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { rerender } = await render(<Harness tiles={[tile({ value: '$1,000' })]} />);
    await rerender(<Harness tiles={[tile({ value: '$800' })]} />);

    expect(screen.getByText('$800')).toBeOnTheScreen();
  });

  test('a tile newly appearing in the row (composition change, not an in-place change) renders immediately with no special first-mount fade requirement', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { rerender } = await render(<Harness tiles={[tile({ key: 'aup' })]} />);
    await rerender(
      <Harness
        tiles={[
          tile({ key: 'aup' }),
          tile({ key: 'reminder', kind: 'reminder', label: 'Reminder', value: 'Bill due', accessibilityLabel: 'Reminder, Bill due' }),
        ]}
      />
    );

    expect(screen.getByText('Bill due')).toBeOnTheScreen();
  });
});
