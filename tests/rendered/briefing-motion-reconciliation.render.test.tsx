import fs from 'fs';
import path from 'path';

/**
 * Motion reconciliation task — originally also covered the Grow/Money
 * section-focus scroll honouring Reduce Motion for Score/Journey/event-row
 * navigations that landed within the Money/Grow BOTTOM TABS (via
 * `navigation.navigate('Money'/'Grow', { scrollTo, scrollToRequestId })`).
 *
 * Pass 2E final correction retired that in-tab navigation for exactly those
 * four Briefing destinations (Available Until Payday, an outflow event row,
 * Score, Journey) — they now push the root stack's MoneyDetail/GrowDetail
 * routes instead (RootNavigator.tsx), which this file's harness (a bare
 * `MainTabNavigator` with no RootStack around it, by original design — see
 * briefing-motion-state-retention.render.test.tsx's own doc comment) cannot
 * reach: `navigation.navigate('MoneyDetail'/'GrowDetail', ...)` has no
 * matching screen anywhere in this harness's tree and is a no-op. The
 * six removed tests' entire premise (that these presses land inside Money/
 * Grow's own tab-hosted ScrollView) is therefore no longer true for these
 * triggers, and reinstating them here would test retired behaviour.
 *
 * The pushed-route replacement for this exact guarantee — that the
 * destination's own arrival scroll never animates (never competes with the
 * native push transition) — is covered with real, mounted MoneyDetail/
 * GrowDetail routes in pass-2e-pushed-destinations.render.test.tsx.
 *
 * Today's contextual-insight card still navigates to the Grow TAB with
 * scrollTo params for its own, unrelated targets (safety_net/saving/
 * learning/goals/financial-learning) — sectionFocus.ts's own real-function
 * unit tests (tests/pass-2b-correction.test.ts et al.) continue to prove
 * that pending/fulfil/Reduce-Motion contract directly; this file never
 * exercised those five targets in the first place, so nothing here covered
 * them either.
 *
 * The one test below with no dependency on the retired mechanism — that
 * MainTabNavigator sets no navigator-level transition option — is
 * unaffected by this pass and remains in place.
 */
describe('Motion reconciliation — no navigator-level transition configuration', () => {
  test('MainTabNavigator.tsx sets no navigator-level animation/transition option', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/navigation/MainTabNavigator.tsx'), 'utf8');
    // Strip comments so the explicit "do not re-enable" doc comment (which
    // legitimately contains the word "animation") can't produce a false
    // negative on its own instructional text.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/animation\s*:/.test(code)).toBe(false);
    expect(/transitionSpec/.test(code)).toBe(false);
    expect(/sceneStyleInterpolator/.test(code)).toBe(false);
    expect(/TransitionPreset/.test(code)).toBe(false);
    expect(/FadeTransition/.test(code)).toBe(false);
  });
});
