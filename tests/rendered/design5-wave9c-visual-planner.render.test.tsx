// Wave 9c visual/checklist correction, Correction I — the ACTUAL rendered
// "Plan around your income?" sheet resolves the shipped fonts at runtime,
// English and Thai. Direct mounts of the real sheet (visible) inside the
// real providers — grep evidence alone is banned for this correction. No
// presses are needed, so the two roots coexist safely in one file.
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import i18n from '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { SavingsAllocationPromptSheet } from '../../src/components/income/SavingsAllocationPromptSheet';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <AppStateProvider>
        <ThemeProvider>
          <SavingsAllocationPromptSheet visible onDone={() => undefined} />
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

function families(): { family: unknown; text: string }[] {
  const out: { family: unknown; text: string }[] = [];
  const walk = (n: any, insideText: boolean) => {
    if (!n || typeof n !== 'object') return;
    const isText = n.type === 'Text' || n.type === 'TextInput';
    if (isText && !insideText) {
      const family = flatten(n.props?.style).fontFamily;
      const text = nodeText(n) || String(n.props?.placeholder ?? '');
      if (!isGlyph(family) && text.trim().length > 0) out.push({ family, text: text.slice(0, 40) });
    }
    (n.children ?? []).forEach((c: unknown) => walk(c, insideText || (n.type === 'Text')));
  };
  walk((screen as any).root, false);
  return out;
}

describe('Plan around your income? — runtime fonts (English)', () => {
  let view: any;
  beforeAll(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('en');
    view = await render(<Harness />);
    await screen.findByText('Plan around your income?', {}, { timeout: 20000 });
  }, 60000);
  afterAll(() => view?.unmount());

  test('the whole sheet — title, intro, options, notes, actions — resolves Figtree', () => {
    expect(screen.getByText('No savings allocation')).toBeTruthy();
    expect(screen.getByText('Percentage of expected recurring income')).toBeTruthy();
    expect(screen.getByText('Fixed monthly amount')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('This does not move money or create a transaction.', { exact: false })).toBeTruthy();
    const fams = families();
    expect(fams.length).toBeGreaterThan(6);
    expect(fams.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('Figtree'))).toEqual([]);
  });
});

describe('Plan around your income? — runtime fonts (Thai)', () => {
  let view: any;
  beforeAll(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('th');
    view = await render(<Harness />);
    await screen.findByText('Plan around your income?', {}, { timeout: 20000 });
  }, 60000);
  afterAll(async () => {
    view?.unmount();
    await i18n.changeLanguage('en');
  });

  test('the whole sheet resolves Noto Sans Thai', () => {
    const fams = families();
    expect(fams.length).toBeGreaterThan(6);
    expect(fams.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('NotoSansThai'))).toEqual([]);
  });
});
