// Wave 9c — onboarding RUNTIME typography, its own file for a fresh module
// registry (one root per locale; see the skip suite's header for why).
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import i18n from '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <CelebrationProvider>
            <SavingsAllocationPromptProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </SavingsAllocationPromptProvider>
          </CelebrationProvider>
        </ThemeProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const isGlyph = (f: unknown) => typeof f === 'string' && /ionicons/i.test(f);

function flatten(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style as Record<string, unknown>;
}

/** Every non-glyph Text/TextInput family on the mounted onboarding tree. */
function families(): { family: unknown; text: string }[] {
  const out: { family: unknown; text: string }[] = [];
  const walk = (n: any, insideText: boolean) => {
    if (!n || typeof n !== 'object') return;
    const isText = n.type === 'Text';
    const isInput = n.type === 'TextInput';
    if ((isText && !insideText) || isInput) {
      const family = flatten(n.props?.style).fontFamily;
      const kids = n.props?.children;
      const text = Array.isArray(kids) ? kids.filter((k: unknown) => typeof k === 'string').join('') : typeof kids === 'string' ? kids : String(n.props?.placeholder ?? '');
      if (!isGlyph(family) && (text.trim().length > 0 || isInput)) out.push({ family, text: text.slice(0, 40) });
    }
    (n.children ?? []).forEach((c: unknown) => walk(c, insideText || isText));
  };
  walk((screen as any).root, false);
  return out;
}

function offenders(prefix: string): { family: unknown; text: string }[] {
  return families().filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith(prefix));
}

describe('Wave 9c — onboarding fonts (English)', () => {
  let view: any;
  beforeAll(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('en');
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    view = await render(<Harness />);
    await screen.findByText(/Meet Nolie/, {}, { timeout: 20000 });
  }, 60000);
  afterAll(() => view?.unmount());

  test('Welcome state: every text resolves Figtree', () => {
    expect(families().length).toBeGreaterThan(2);
    expect(offenders('Figtree')).toEqual([]);
  });

  test('Name state: heading and TextInput resolve Figtree', async () => {
    fireEvent.press(screen.getByTestId('onboarding-get-started'));
    await screen.findByTestId('onboarding-continue');
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('onboarding-name-input');
    expect(offenders('Figtree')).toEqual([]);
    expect(flatten(screen.getByTestId('onboarding-name-input').props.style).fontFamily).toMatch(/^Figtree/);
    expect(flatten(screen.getByTestId('onboarding-heading').props.style).fontFamily).toMatch(/^Figtree/);
  });
});

describe('Wave 9c — onboarding fonts (Thai)', () => {
  let view: any;
  beforeAll(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('th');
    view = await render(<Harness />);
    await screen.findByText(/Meet Nolie/, {}, { timeout: 20000 });
  }, 60000);
  afterAll(async () => {
    view?.unmount();
    await i18n.changeLanguage('en');
  });

  test('Welcome state: every text resolves Noto Sans Thai', () => {
    expect(families().length).toBeGreaterThan(2);
    expect(offenders('NotoSansThai')).toEqual([]);
  });
});
