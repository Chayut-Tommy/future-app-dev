// Wave 10 closure — the defect's converse, in a fresh realm: mounting each
// celebration PRESENTATION directly, outside any queue and with no action
// behind it, must produce zero haptics. Under the defective ownership every
// one of these mounts vibrated; under action ownership none may.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { SmallCelebrationToast } from '../../src/components/celebrations/SmallCelebrationToast';
import { MediumCelebrationSheet } from '../../src/components/celebrations/MediumCelebrationSheet';
import { BigCelebrationOverlay } from '../../src/components/celebrations/BigCelebrationOverlay';
import { hapticLight, hapticRigid, hapticSoftSuccess, hapticWarning } from '../../src/lib/haptics';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../src/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticSoftSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticRigid: jest.fn(),
}));

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

describe('Renderer-only mounts are haptically silent', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterAll(() => view?.unmount());

  test('Small, Medium and Big presentations mount without creating a Save haptic', async () => {
    view = await render(
      <Shell>
        <SmallCelebrationToast
          event={{ id: 'x-small', tier: 'small', icon: 'trophy-outline', title: 'Direct mount', body: 'small body', context: 'MILESTONE' }}
          onDone={jest.fn()}
        />
        <MediumCelebrationSheet
          event={{ id: 'x-medium', tier: 'medium', icon: 'trophy-outline', title: 'Direct mount', body: 'medium body' }}
          onDismissed={jest.fn()}
        />
        <BigCelebrationOverlay
          event={{ id: 'x-big', tier: 'big', icon: 'trophy-outline', title: 'Direct mount', body: 'big body' }}
          onDismissed={jest.fn()}
        />
      </Shell>
    );
    // All three presentations are genuinely on screen...
    await screen.findByText('small body', {}, { timeout: 20000 });
    await screen.findByText('medium body', {}, { timeout: 20000 });
    await screen.findByText('big body', {}, { timeout: 20000 });
    // ...and none of them manufactured feedback.
    expect((hapticSoftSuccess as jest.Mock).mock.calls.length).toBe(0);
    expect((hapticLight as jest.Mock).mock.calls.length).toBe(0);
    expect((hapticWarning as jest.Mock).mock.calls.length).toBe(0);
    expect((hapticRigid as jest.Mock).mock.calls.length).toBe(0);
  }, 60000);
});
