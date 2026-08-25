// Wave 9c FINAL correction pass, Correction D — the debt chooser's THAI
// runtime font sweep. Its own file: a second fresh root in the same jest
// module realm does not reliably process its FIRST press (documented
// multi-root pathology), and this root's first interaction is the press
// that opens the sheet.
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
import { createEmptyAppData } from '../../src/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

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
const flatten = (style: unknown): Record<string, unknown> =>
  !style ? {} : Array.isArray(style) ? Object.assign({}, ...(style as unknown[]).map(flatten)) : (style as Record<string, unknown>);
const nodeText = (n: any): string => {
  const kids = n.props?.children;
  return Array.isArray(kids) ? kids.filter((k: unknown) => typeof k === 'string').join('') : typeof kids === 'string' ? kids : '';
};

function debtSubtree(): any {
  let smallest: any = null;
  const inspect = (n: any): { a: boolean; b: boolean } => {
    if (!n || typeof n !== 'object') return { a: false, b: false };
    let a = n.props?.testID === 'debt-choice-credit_card';
    let b = n.props?.testID === 'debt-no-debt';
    for (const c of n.children ?? []) {
      const r = inspect(c);
      a = a || r.a;
      b = b || r.b;
    }
    if (a && b && smallest === null) smallest = n;
    return { a, b };
  };
  inspect((screen as any).root);
  return smallest;
}

describe('Wave 9c final — debt chooser fonts (Thai)', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('th');
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByTestId('checklist-debt', {}, { timeout: 20000 });
  }, 60000);

  afterAll(async () => {
    view?.unmount();
    await i18n.changeLanguage('en');
  });

  test('every rendered Text in the chooser resolves Noto Sans Thai', async () => {
    fireEvent.press(screen.getByTestId('checklist-debt'));
    await screen.findByTestId('debt-no-debt', {}, { timeout: 20000 });
    const out: { family: unknown; text: string }[] = [];
    const walk = (n: any, insideText: boolean) => {
      if (!n || typeof n !== 'object') return;
      const isText = n.type === 'Text';
      if (isText && !insideText) {
        const family = flatten(n.props?.style).fontFamily;
        const text = nodeText(n);
        if (!isGlyph(family) && text.trim().length > 0) out.push({ family, text: text.slice(0, 40) });
      }
      (n.children ?? []).forEach((c: unknown) => walk(c, insideText || isText));
    };
    walk(debtSubtree(), false);
    expect(out.length).toBeGreaterThan(5);
    expect(out.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('NotoSansThai'))).toEqual([]);
  });
});
