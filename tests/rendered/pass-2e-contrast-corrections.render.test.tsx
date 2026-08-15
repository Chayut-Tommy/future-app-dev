import React from 'react';
import { render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppStateProvider } from '../../src/state/AppStateContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { MoneyOpportunitiesHero } from '../../src/components/discover/MoneyOpportunitiesHero';
import { createEmptyAppData } from '../../src/lib/storage';
import { AppData } from '../../src/types/models';
import { HERO_SCRIM_OPACITY } from '../../src/theme/contrastOverrides';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const STORAGE_KEY = 'moneycoach.appdata.v1';

/**
 * Pass 2E contrast correction — proves MoneyOpportunitiesHero's
 * naviloColorStyle/scheme -> HERO_SCRIM_OPACITY routing actually wires the
 * correct value into the rendered scrim overlay, for real (a rendered tree
 * walk against the component's actual output), not just that the lookup
 * table itself is correct (that's pass-2e-contrast-corrections.test.ts).
 * Explicitly sets data.user.theme to 'light'/'dark' (never 'system') so the
 * test doesn't depend on mocking useColorScheme.
 */
function Harness({ opportunities }: { opportunities: any[] }) {
  return (
    <AppStateProvider>
      <ThemeProvider>
        <MoneyOpportunitiesHero opportunities={opportunities} onAction={() => {}} />
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

const sampleOpportunity = [{ id: 'opp1', title: 'Test insight', detail: 'Test detail', actionLabel: 'View', icon: 'sparkles' } as any];

// Recursively walk the rendered JSON tree for a node whose style includes a
// backgroundColor matching the given rgba pattern.
function findScrimBackgroundColor(node: any): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const style = Array.isArray(node.props?.style) ? Object.assign({}, ...node.props.style.filter(Boolean)) : node.props?.style;
  if (style?.backgroundColor && typeof style.backgroundColor === 'string' && style.backgroundColor.startsWith('rgba(0,0,0,')) {
    return style.backgroundColor;
  }
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findScrimBackgroundColor(child);
      if (found) return found;
    }
  }
  return undefined;
}

describe('Pass 2E contrast correction — MoneyOpportunitiesHero scrim routing', () => {
  test('blue/light (the default style/scheme) renders the scrim at its HERO_SCRIM_OPACITY.blue.light value', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
      data.user.luluCardTheme = 'blue';
    });

    const view = await render(<Harness opportunities={sampleOpportunity} />);
    const bg = findScrimBackgroundColor(view.toJSON());

    expect(bg).toBe(`rgba(0,0,0,${HERO_SCRIM_OPACITY.blue.light})`);
  });

  test('purple/dark renders the scrim at its own, much lighter HERO_SCRIM_OPACITY.purple.dark value — not blue/light’s', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'dark';
      data.user.luluCardTheme = 'purple';
    });

    const view = await render(<Harness opportunities={sampleOpportunity} />);
    const bg = findScrimBackgroundColor(view.toJSON());

    expect(bg).toBe(`rgba(0,0,0,${HERO_SCRIM_OPACITY.purple.dark})`);
    expect(bg).not.toBe(`rgba(0,0,0,${HERO_SCRIM_OPACITY.blue.light})`);
  });

  test('sunrise/light renders the scrim in the empty-state branch too (0 opportunities), not only the populated branch', async () => {
    await AsyncStorage.clear();
    await seedData((data) => {
      data.user.theme = 'light';
      data.user.luluCardTheme = 'sunrise';
    });

    const view = await render(<Harness opportunities={[]} />);
    const bg = findScrimBackgroundColor(view.toJSON());

    expect(bg).toBe(`rgba(0,0,0,${HERO_SCRIM_OPACITY.sunrise.light})`);
  });
});
