// RNTL unmounts every root after each test by default. This suite mounts
// ONE root per describe in beforeAll and asserts across many tests, which
// auto-cleanup would tear down after the first.
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
import { AppData } from '../../src/types/models';

/**
 * Nolie Design 5.1 Wave 9b closure — "What happens next" RUNTIME typography.
 *
 * The structural suite proved the timeline tree CALLS typeStyle(role,
 * locale); this file proves what that cannot: the ACTUAL flattened Text
 * styles of the mounted rows resolve the right family at runtime —
 * Figtree in English, Noto Sans Thai in Thai — with tabular numerals on
 * the amounts, and icon fonts (Ionicons) excluded from the sweep.
 *
 * Covered nodes: the section heading, the supporting sentence, a date
 * group heading and its calendar date, an ordinary bill row (Rent), a
 * BNPL row (ZIP), a credit-card row, a signed amount, and the View all
 * upcoming control.
 *
 * FIXTURE NOTE — the preview is exactly THREE events, so the three row
 * KINDS under proof (bnpl, bill, credit_card) are seeded as the three
 * soonest; a fourth commitment overflows the preview so the View all
 * upcoming control renders. Dates are local-midnight anchored — see iso().
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
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

function iso(days: number): string {
  // LOCAL-MIDNIGHT anchored — the exact shape every shipped writer stores
  // (nextOccurrenceFromDay, the DateTriggerField day list, and
  // advanceOneOccurrence all produce new Date(y, m, d).toISOString()).
  //
  // This matters beyond timezone hygiene: authoring this suite exposed a
  // LATENT boundary in projectBnplOccurrences (bnpl.ts) — it passes the raw
  // nextDueDate timestamp as the generator's `from`, while occurrenceDateAt
  // quantises every occurrence to local midnight, so any nextDueDate
  // carrying a time-of-day silently DROPS the first BNPL instalment from
  // the timeline and window sums. Shipped writers are all midnight-anchored,
  // so customers are unaffected today; the fragility is reported as a
  // Wave 10 carry-over rather than patched inside this checkpoint, because
  // bnpl.ts is a protected financial engine.
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString();
}

/** ZIP bnpl row (+2d), Rent bill row (+3d) and a card row (+4d) are the
 * three previewed events; Internet (+12d) exists only to overflow the
 * preview so the View all upcoming control renders. */
function timelineData(): AppData {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  data.user.hasSeenIntro = true;
  data.user.monthlyIncome = 5200;
  data.user.payFrequency = 'fortnightly';
  data.user.nextPayday = iso(11);
  data.user.moneyPictureChecklistDismissed = true;
  data.assets.push({ id: 'a1', label: 'Everyday', type: 'cash', currentValue: 3400, includeInMoneyCalculations: true } as never);
  data.liabilities.push({ id: 'zip1', type: 'bnpl', label: 'ZIP play', currentBalance: 1000 } as never);
  data.recurringItems.push(
    { id: 'r-zip', type: 'expense', label: 'ZIP play repayment', amount: 70, frequency: 'fortnightly', nextDueDate: iso(2), isFixed: true, active: true, linkedLiabilityId: 'zip1' } as never,
    { id: 'rent', type: 'expense', label: 'Rent', amount: 1800, frequency: 'monthly', nextDueDate: iso(3), isFixed: true, active: true } as never,
    { id: 'net', type: 'expense', label: 'Internet', amount: 80, frequency: 'monthly', nextDueDate: iso(12), isFixed: true, active: true } as never
  );
  const dueDay = new Date(Date.now() + 4 * 86400000).getDate();
  data.creditCards.push({ id: 'cba', issuer: 'CBA', label: 'CBA card', creditLimit: 10000, currentBalance: 500, dueDay, minimumPayment: 0, expectedMonthlyRepayment: 50, apr: 0.2 } as never);
  return data;
}

// Runtime typography walk — Ionicons glyphs are icon fonts, excluded by
// design; nested Text inherits its parent's family.
const isGlyph = (f: unknown) => typeof f === 'string' && /ionicons/i.test(f);

function flatten(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style as Record<string, unknown>;
}

function nodeText(n: any): string {
  const kids = n.props?.children;
  return Array.isArray(kids) ? kids.filter((k: unknown) => typeof k === 'string').join('') : typeof kids === 'string' ? kids : '';
}

/** The smallest subtree containing BOTH a date-group heading and the
 * expand control — i.e. the timeline card body itself, located
 * structurally (the card carries no testID of its own). Scoping matters:
 * Today's still-mounted tree renders similar strings whose FIGURE nodes
 * pin Figtree by design even in Thai, and the dock's tab labels are
 * pre-existing shell typography debt outside this wave's surface. */
function timelineSubtree(): any {
  let smallest: any = null;
  const inspect = (n: any): { group: boolean; expand: boolean } => {
    if (!n || typeof n !== 'object') return { group: false, expand: false };
    let group = n.type === 'Text' && /^(Today|Tomorrow|In \d+ days)$/.test(nodeText(n));
    let expand = n.props?.testID === 'money-timeline-expand';
    for (const c of n.children ?? []) {
      const r = inspect(c);
      group = group || r.group;
      expand = expand || r.expand;
    }
    if (group && expand && smallest === null) smallest = n; // post-order: first hit IS the smallest
    return { group, expand };
  };
  inspect((screen as any).root);
  return smallest;
}

/** Flattened style of the Text rendering `match`, searched inside `root`
 * (default: the timeline card subtree). */
function textStyleOf(match: RegExp | string, root?: any): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  const test = (t: string) => (typeof match === 'string' ? t.includes(match) : match.test(t));
  const walk = (n: any) => {
    if (!n || typeof n !== 'object' || found) return;
    if (n.type === 'Text') {
      const text = nodeText(n);
      if (text && test(text)) {
        found = flatten(n.props?.style);
        return;
      }
    }
    (n.children ?? []).forEach(walk);
  };
  walk(root ?? timelineSubtree());
  return found;
}

/** Every non-glyph top-level Text family inside the timeline card. */
function timelineFamilies(): { family: unknown; text: string }[] {
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
  walk(timelineSubtree(), false);
  return out;
}

async function goToMoney() {
  fireEvent.press(await screen.findByRole('button', { name: /^Money,/ }, { timeout: 20000 }));
  await screen.findByText('What happens next', {}, { timeout: 20000 });
}

const expectFamily = (style: Record<string, unknown> | null, pattern: RegExp) => {
  expect(style).not.toBeNull();
  expect(typeof style!.fontFamily).toBe('string');
  expect(style!.fontFamily).toMatch(pattern);
};

describe('Wave 9b — What happens next, runtime typography (English)', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('en');
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(timelineData()));
    view = await render(<Harness />);
    await goToMoney();
  }, 60000);

  afterAll(() => view?.unmount());

  test('the section heading and supporting sentence resolve Figtree', () => {
    const root = (screen as any).root; // heading is the SectionCard title, outside the card body subtree
    expectFamily(textStyleOf('What happens next', root), /^Figtree/);
    expectFamily(textStyleOf(/Bills, income and repayments/, root), /^Figtree/);
  });

  test('the date group heading and its calendar date resolve Figtree', () => {
    expectFamily(textStyleOf(/^(Today|Tomorrow|In \d+ days)$/), /^Figtree/);
    expectFamily(textStyleOf(/[A-Z][a-z]{2}, [A-Z][a-z]{2} \d/), /^Figtree/);
  });

  test('the ordinary bill row (Rent) resolves Figtree', () => {
    expectFamily(textStyleOf(/^Rent$/), /^Figtree/);
  });

  test('the BNPL row (ZIP) resolves Figtree', () => {
    expectFamily(textStyleOf(/ZIP play/), /^Figtree/);
  });

  test('the credit-card row resolves Figtree', () => {
    expectFamily(textStyleOf(/CBA card credit card repayment/), /^Figtree/);
  });

  test('a signed amount resolves Figtree WITH tabular numerals', () => {
    const style = textStyleOf(/^[-−+]\$70/);
    expectFamily(style, /^Figtree/);
    expect(JSON.stringify(style!.fontVariant ?? [])).toContain('tabular-nums');
  });

  test('the View all upcoming control resolves Figtree', () => {
    expectFamily(textStyleOf(/View all upcoming|Show less/), /^Figtree/);
  });

  test('EVERY non-glyph Text inside the timeline card resolves Figtree', () => {
    const fams = timelineFamilies();
    expect(fams.length).toBeGreaterThan(5);
    const offenders = fams.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('Figtree'));
    expect(offenders).toEqual([]);
  });
});

describe('Wave 9b — What happens next, runtime typography (Thai)', () => {
  let view: any;

  beforeAll(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('th');
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(timelineData()));
    view = await render(<Harness />);
    await goToMoney();
  }, 60000);

  afterAll(async () => {
    view?.unmount();
    await i18n.changeLanguage('en');
  });

  test('locale change re-resolves the family: heading renders Noto Sans Thai', () => {
    // Untranslated keys keep their English STRING; what must change is the
    // resolved FAMILY, proving locale is a live input to the stylesheet.
    expectFamily(textStyleOf('What happens next', (screen as any).root), /^NotoSansThai/);
  });

  test('rows, dates and amounts follow the Thai family too', () => {
    expectFamily(textStyleOf(/^Rent$/), /^NotoSansThai/);
    expectFamily(textStyleOf(/ZIP play/), /^NotoSansThai/);
    expectFamily(textStyleOf(/^(Today|Tomorrow|In \d+ days)$/), /^NotoSansThai/);
    const amount = textStyleOf(/^[-−+]\$70/);
    expectFamily(amount, /^NotoSansThai/);
    expect(JSON.stringify(amount!.fontVariant ?? [])).toContain('tabular-nums');
  });

  test('EVERY non-glyph Text inside the timeline card resolves Noto Sans Thai', () => {
    const fams = timelineFamilies();
    expect(fams.length).toBeGreaterThan(5);
    const offenders = fams.filter((f) => typeof f.family !== 'string' || !(f.family as string).startsWith('NotoSansThai'));
    expect(offenders).toEqual([]);
  });
});
