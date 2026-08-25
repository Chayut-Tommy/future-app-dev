import { Achievement } from './achievements';

/** Achievements whose current/target pair is NOT a dollar amount — checked
 * explicitly by id, matching achievements.ts's own definitions exactly
 * (diversified_portfolio's current/target are a 0-100 diversification
 * score; score_improved_10's are Navilo Score points). Every other
 * quantified achievement in that file uses `current`/`target` as real
 * dollar figures. This list exists so the snapshot's "[current] of
 * [target]" line is never mislabelled with a "$" it doesn't have — a
 * narrow, explicit exception, not a guess. */
const NON_CURRENCY_ACHIEVEMENT_IDS = new Set(['diversified_portfolio', 'score_improved_10']);

function formatProgressValue(id: string, value: number): string {
  return NON_CURRENCY_ACHIEVEMENT_IDS.has(id) ? `${Math.round(value)}` : `$${Math.round(value).toLocaleString()}`;
}

/**
 * Pass 2B — the compact Journey snapshot's presentation contract. Wraps the
 * existing, unmodified computeAchievements() output — never recomputes
 * achievement rules, ordering, or unlock conditions; never fabricates a
 * milestone, target, percentage, or recommendation that isn't already
 * present on the achievements list.
 *
 * "Next" uses the SAME definition JourneyTimeline.tsx (the existing full
 * Journey presentation) has always used for its own "NEXT UP" badge —
 * `achievements.findIndex(a => !a.unlocked)`, the first not-yet-unlocked
 * achievement in list order — not the separate, quantified-only
 * getNextMilestone() from achievements.ts (a different consumer, used for
 * the daily-insight "$X away" line). Reusing JourneyTimeline's own
 * established concept keeps the compact snapshot and the full timeline
 * always in agreement about which milestone is "next."
 */
export interface JourneySnapshot {
  /** True when there is no achievement data to show at all — an empty
   * achievements array. Structurally not expected today (computeAchievements
   * always returns a non-empty starter list), but this presentation layer
   * never assumes that invariant holds forever. */
  unavailable: boolean;
  totalCount: number;
  completedCount: number;
  /** True once every achievement in the list is unlocked — a genuine,
   * distinct state from "next" being present, since there is no next
   * incomplete milestone left to show. */
  allCompleted: boolean;
  /** The next not-yet-unlocked achievement, or null when unavailable or
   * allCompleted. */
  next: Achievement | null;
  /** Only present when `next` itself carries a real, already-computed
   * current/target pair (matching JourneyTimeline's own
   * `isNext && a.target` gate) — never invented for a next milestone that
   * has no quantified progress (e.g. "Started Navilo"). `formatted` is the
   * ready-to-render "[current] of [target]" string — dollar-formatted for
   * every quantified achievement except the narrow, explicit non-currency
   * exceptions above, so this presentation layer never mislabels a
   * non-dollar value with a "$" it doesn't have. */
  nextProgress: { current: number; target: number; formatted: string } | null;
}

/**
 * Wave 9c state-communication correction B — how an UPCOMING milestone is
 * titled.
 *
 * THE DEFECT (owner device test): with the optional goal deferred, the
 * next not-yet-unlocked achievement is `created_first_goal`, whose FIXED
 * title is the past-tense record "Created First Goal". Today's compact
 * Journey row rendered that title with no upcoming-state qualifier, so a
 * customer who had just declined to create a goal read a past-tense
 * "Created First Goal" — a milestone the engine correctly holds LOCKED
 * (`unlocked: data.goals.length > 0`; inspection, not inference). The
 * structured state was right; only the tense of the presentation was
 * wrong.
 *
 * This is the ONE shared presentation resolver both Today's compact row
 * and Grow's full Journey timeline use for a milestone that is not yet
 * achieved — the condition lives here exactly once, keyed on the
 * achievement's structured id, never on its label, icon or position. The
 * achieved/history wording (the achievement's own title) is untouched,
 * and no engine, unlock rule or Score input changes.
 */
const UPCOMING_MILESTONE_TITLES: Readonly<Record<string, string>> = {
  created_first_goal: 'Create your first goal',
};

export function upcomingMilestoneTitle(achievement: Pick<Achievement, 'id' | 'title'>): string {
  return UPCOMING_MILESTONE_TITLES[achievement.id] ?? achievement.title;
}

export function computeJourneySnapshot(achievements: Achievement[]): JourneySnapshot {
  if (achievements.length === 0) {
    return { unavailable: true, totalCount: 0, completedCount: 0, allCompleted: false, next: null, nextProgress: null };
  }
  const completedCount = achievements.filter((a) => a.unlocked).length;
  const nextIndex = achievements.findIndex((a) => !a.unlocked);
  const allCompleted = nextIndex === -1;
  const next = allCompleted ? null : achievements[nextIndex];
  const nextProgress =
    next && typeof next.current === 'number' && typeof next.target === 'number' && next.target > 0
      ? { current: next.current, target: next.target, formatted: `${formatProgressValue(next.id, next.current)} of ${formatProgressValue(next.id, next.target)}` }
      : null;
  return { unavailable: false, totalCount: achievements.length, completedCount, allCompleted, next, nextProgress };
}
