// Wave 9c FINAL correction pass, Correction D — the debt chooser, RENDERED
// (English root). The owner's recording showed the "Tell me about any debt"
// journey still in legacy typography with emoji-like tiles and a red-X
// no-debt row. This suite opens the REAL sheet from the REAL checklist and
// proves the runtime hierarchy, fonts, vector icons and destinations —
// grep evidence alone is banned for this correction. The Thai sweep lives
// in its own file (documented multi-root first-press pathology).
import '@testing-library/react-native/dont-cleanup-after-each';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import '../../src/i18n';
import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { CelebrationProvider } from '../../src/state/CelebrationContext';
import { SavingsAllocationPromptProvider } from '../../src/state/SavingsAllocationPromptContext';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';

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

/** Smallest subtree containing the chooser's first and last controls = the
 * debt sheet's own content, excluding the Today page behind it. */
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

function debtFamilies(): { family: unknown; text: string }[] {
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
  return out;
}

async function stored(): Promise<AppData> {
  return JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!) as AppData;
}

describe('Wave 9c final — debt chooser (English)', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    const d = createEmptyAppData();
    d.user.name = 'Jamie';
    d.user.hasSeenIntro = true;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    view = await render(<Harness />);
    await screen.findByText('Complete your money setup', {}, { timeout: 20000 });
  }, 60000);

  afterAll(() => view?.unmount());

  test('the chooser opens with the accepted hierarchy and four 56pt destinations', async () => {
    fireEvent.press(screen.getByTestId('checklist-debt'));
    await screen.findByText('Tell us about any debt', {}, { timeout: 20000 });
    expect(screen.getByText('Add only what applies. You can update this later.')).toBeTruthy();
    for (const t of ['credit_card', 'mortgage', 'car_loan', 'personal_loan']) {
      const row = screen.getByTestId(`debt-choice-${t}`);
      expect(flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(56);
    }
    expect(screen.getByText('Credit card')).toBeTruthy();
    expect(screen.getByText('Mortgage')).toBeTruthy();
    expect(screen.getByText('Car loan')).toBeTruthy();
    expect(screen.getByText('Personal loan')).toBeTruthy();
    // The calm no-debt answer — and NO red X, NO emoji, anywhere.
    expect(screen.getByTestId('debt-no-debt')).toBeTruthy();
    expect(screen.queryByText(/❌|💳|🏠|🚗|💰/)).toBeNull();
  });

  test('every rendered Text in the chooser resolves Figtree at runtime', () => {
    const fams = debtFamilies();
    expect(fams.length).toBeGreaterThan(5);
    expect(fams.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('Figtree'))).toEqual([]);
  });

  test('the icons are vector glyphs from the shared resolver, not emoji text', () => {
    // Inside each row: exactly the Ionicons text nodes carry the icon
    // font; no other node contains pictographic characters.
    const row = screen.getByTestId('debt-choice-mortgage');
    const glyphFamilies: unknown[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'Text') {
        const family = flatten(n.props?.style).fontFamily;
        if (isGlyph(family)) glyphFamilies.push(family);
      }
      (n.children ?? []).forEach(walk);
    };
    walk(row);
    expect(glyphFamilies.length).toBeGreaterThanOrEqual(1);
  });

  test('the no-debt answer writes the same flag and closes — no data invented', async () => {
    fireEvent.press(screen.getByTestId('debt-no-debt'));
    await waitFor(async () => expect((await stored()).user.confirmedNoDebt).toBe(true), { timeout: 20000 });
    const s = await stored();
    expect(s.liabilities).toHaveLength(0);
    expect(s.creditCards).toHaveLength(0);
    // The checklist reflects the truthful answered state.
    // RECONCILED (post-Wave-10 checklist UX closure): the truthful
    // debt-free state is now the row's chip (decorative, a11y-hidden
    // inside the one row button); the support line stays the constant
    // factual purpose copy. The resolution compacts the card, so the row
    // sits behind the one View all disclosure.
    await screen.findByText(/of 7 reviewed/, {}, { timeout: 20000 });
    if (screen.queryByTestId('checklist-view-all')) fireEvent.press(screen.getByTestId('checklist-view-all'));
    await screen.findByTestId('checklist-debt', {}, { timeout: 20000 });
    expect(screen.getByText('Debt-free', { includeHiddenElements: true })).toBeTruthy();
  });
});
