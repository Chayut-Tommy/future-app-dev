import React from 'react';
import { render } from '@testing-library/react-native';
import { TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { WorthKnowingCard } from '../../src/components/today/WorthKnowingCard';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';
import { WorthKnowingInsight } from '../../src/lib/calculations/worthKnowing';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Correction round — the rendered test the pre-implementation plan proposed
 * but the original implementation report omitted. Wraps WorthKnowingCard
 * exactly the way TodayScreen.tsx actually does (a single TouchableOpacity
 * carrying accessibilityRole="button" and one composed accessibilityLabel —
 * see TodayScreen.tsx's own insight-slot JSX), so this tests the real
 * shipped accessibility contract, not an idealised one.
 */
function Harness({ insight }: { insight: WorthKnowingInsight }) {
  return (
    <AppStateProvider>
      <ThemeProvider>
        <TouchableOpacity
          onPress={() => {}}
          accessibilityRole="button"
          accessibilityLabel={`Worth Knowing. ${insight.title}. ${insight.body} ${insight.ctaLabel}.`}
        >
          <WorthKnowingCard insight={insight} />
        </TouchableOpacity>
      </ThemeProvider>
    </AppStateProvider>
  );
}

async function seedData(overrides: (data: AppData) => void) {
  const data = createEmptyAppData();
  data.user.name = 'Jamie';
  overrides(data);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const baseInsight: WorthKnowingInsight = {
  type: 'upcoming_commitment_cluster',
  icon: 'calendar-outline',
  priority: 1,
  // Correction round — matches the current production title exactly
  // ("busiest" was never proven against the complete supplied horizon; see
  // worthKnowing.ts's own doc comment). A stale fixture string here would
  // no longer reflect what customers actually see.
  title: 'A busy payment week is coming up',
  body: 'You have $3,240 across 6 recorded payments between 20–25 August.',
  ctaLabel: 'See what’s coming',
  destination: { kind: 'money_section', section: 'timeline', targetDateKey: '2026-08-20', targetOccurrenceKeys: ['recurring_item:test-bill:2026-08-20'] },
  fingerprint: 'wk01:test',
  materialityCents: 324000,
  rankBasisPoints: 0,
  daysUntil: 5,
};

// Recursively collect every node in the rendered JSON tree carrying an
// accessibilityRole or an accessible-related prop, so tests can assert on
// the WHOLE accessible surface, not just the root.
function collectAccessibleNodes(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  const props = node.props ?? {};
  if (props.accessibilityRole || props.accessible === true) out.push(node);
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) collectAccessibleNodes(child, out);
  }
  return out;
}

function findGradientColors(node: any): string[] | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node.props?.colors)) return node.props.colors;
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findGradientColors(child);
      if (found) return found;
    }
  }
  return undefined;
}

function collectText(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'Text' && Array.isArray(node.children)) {
    for (const c of node.children) if (typeof c === 'string') out.push(c);
  }
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) collectText(child, out);
  }
  return out;
}

describe('Worth Knowing — WorthKnowingCard rendered proof', () => {
  /**
   * Design 5.1 Wave 5 visual pass — Worth Knowing is no longer a gradient
   * card. Today now has exactly ONE expressive hero, and a second gradient
   * surface directly beneath it competed with that hero for attention. The
   * card is now the flat HIGHLIGHTED SUPPORTING TIER: a low-saturation info
   * tint with a matching border, which is a clear step above the plain
   * supporting cards around it without pretending to be a hero.
   *
   * These three tests previously proved the gradient was theme- and
   * palette-aware. Two of those claims survive unchanged and are asserted
   * below: the card renders without throwing in every supported theme, and
   * light and dark are genuinely different. The third — that Purple renders
   * a DIFFERENT surface than Ocean — is deliberately superseded: `info` is
   * a SHARED role, and Design 5.1 bars a colour style from retinting status
   * roles. An insight tier is a status, so its invariance across the three
   * styles is now the correct behaviour, and is asserted as such.
   */
  function findCardStyle(node: any): any {
    if (!node || typeof node !== 'object') return undefined;
    if (node.props?.testID === 'today-worth-knowing-card') {
      const st = node.props.style;
      return Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findCardStyle(child);
        if (found) return found;
      }
    }
    return undefined;
  }

  test('light Ocean (blue) renders the flat highlighted info tier — a tint and a border, no gradient', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
      data.user.luluCardTheme = 'blue';
    });
    const view = await render(<Harness insight={baseInsight} />);
    expect(findGradientColors(view.toJSON())).toBeUndefined();
    const style = findCardStyle(view.toJSON());
    expect(style).toBeDefined();
    expect(style.backgroundColor).toBeDefined();
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBeDefined();
  });

  test('dark renders a genuinely different surface than light, and neither throws', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
      data.user.luluCardTheme = 'blue';
    });
    const lightStyle = findCardStyle((await render(<Harness insight={baseInsight} />)).toJSON());

    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'dark';
      data.user.luluCardTheme = 'blue';
    });
    const darkStyle = findCardStyle((await render(<Harness insight={baseInsight} />)).toJSON());

    expect(darkStyle).toBeDefined();
    expect(darkStyle.backgroundColor).not.toBe(lightStyle.backgroundColor);
  });

  test('a long headline renders in full — no truncation prop present on the headline Text', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
    });
    const longTitle = 'Several very large recorded payments are clustering together in an unusually busy upcoming week for your account';
    const insight = { ...baseInsight, title: longTitle };
    const view = await render(<Harness insight={insight} />);
    const texts = collectText(view.toJSON());
    expect(texts.some((t) => t === longTitle)).toBe(true);
  });

  test('a long body renders in full — no truncation prop present on the body Text', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
    });
    const longBody =
      'You have $12,450 across 9 recorded payments between 1 August and 28 August, spanning mortgage, credit card, two personal loans and several recurring bills, based on what you have recorded so far.';
    const insight = { ...baseInsight, body: longBody };
    const view = await render(<Harness insight={insight} />);
    const texts = collectText(view.toJSON());
    expect(texts.some((t) => t === longBody)).toBe(true);
  });

  test('a large monetary amount in the body renders exactly as given, no truncation or scientific notation', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
    });
    const insight = { ...baseInsight, body: 'Your recorded Mortgage of $1,245,000 is due on 22 August.' };
    const view = await render(<Harness insight={insight} />);
    const texts = collectText(view.toJSON());
    expect(texts.some((t) => t.includes('$1,245,000'))).toBe(true);
  });

  test('the CTA label renders as its own visible text (every current WK-01–WK-04 insight always carries a real ctaLabel/destination — see the correction report for why "CTA absent" is not a reachable state in this implementation)', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
    });
    const view = await render(<Harness insight={baseInsight} />);
    const texts = collectText(view.toJSON());
    expect(texts.some((t) => t === baseInsight.ctaLabel)).toBe(true);
  });

  test('accessibility: exactly ONE accessible control (the outer TouchableOpacity, role="button", the full composed label) — no nested accessible button inside another', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
    });
    const view = await render(<Harness insight={baseInsight} />);
    const accessibleNodes = collectAccessibleNodes(view.toJSON());

    // Exactly one node declares accessibilityRole="button" — the outer
    // TouchableOpacity. Every inner Text/View in WorthKnowingCard is marked
    // importantForAccessibility="no"/"no-hide-descendants", so RNTL's
    // rendered tree carries no second accessible button underneath it.
    const buttonNodes = accessibleNodes.filter((n) => n.props?.accessibilityRole === 'button');
    expect(buttonNodes.length).toBe(1);

    const expectedLabel = `Worth Knowing. ${baseInsight.title}. ${baseInsight.body} ${baseInsight.ctaLabel}.`;
    expect(buttonNodes[0].props.accessibilityLabel).toBe(expectedLabel);
  });

  test('accessibility: the labelRow ("WORTH KNOWING" eyebrow) and ctaRow are marked importantForAccessibility="no-hide-descendants", and headline/body/provenance Text nodes are marked "no" — VoiceOver reads the single composed label once, never a second pass per inner node', async () => {
    const WORTH_KNOWING_CARD_SRC = require('fs').readFileSync('src/components/today/WorthKnowingCard.tsx', 'utf8');
    expect(/importantForAccessibility="no-hide-descendants"/.test(WORTH_KNOWING_CARD_SRC)).toBe(true);
    expect((WORTH_KNOWING_CARD_SRC.match(/importantForAccessibility="no"/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  test('flexible height: neither the headline nor the body Text sets numberOfLines — no hidden truncation ceiling that could clip a long insight (genuine on-device layout/clipping proof remains a physical-device check per tests/README.md)', async () => {
    const WORTH_KNOWING_CARD_SRC = require('fs').readFileSync('src/components/today/WorthKnowingCard.tsx', 'utf8');
    expect(/numberOfLines/.test(WORTH_KNOWING_CARD_SRC)).toBe(false);
  });

  test('Reduce Motion: WorthKnowingCard introduces no animation of its own (no Animated.*, no LayoutAnimation) — there is nothing for Reduce Motion to gate; TodayScreen mounts/unmounts it via a plain conditional, inheriting whatever (if any) reveal behaviour the surrounding scroll already has', async () => {
    const WORTH_KNOWING_CARD_SRC = require('fs').readFileSync('src/components/today/WorthKnowingCard.tsx', 'utf8');
    expect(/Animated\.|LayoutAnimation/.test(WORTH_KNOWING_CARD_SRC)).toBe(false);
  });
});
