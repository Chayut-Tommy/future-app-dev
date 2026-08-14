import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { buildGoalImpactOpportunity } from './opportunities';
import { getNextMilestone } from './achievements';
import { findSavingsAsset, computeSavingsSummary, findBestComparison, annualInterestDifference } from './savingsCoach';
import { computeLuluScore } from './luluScore';
import { brand } from '../brand';

export interface DailyInsight {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  /** Pass 2D — a structured tag identifying which pool entry this is,
   * added purely so a second consumer (todayContextualInsight.ts) can
   * pick a specific entry out of the same pool by identity rather than by
   * re-deriving or duplicating the text/condition that produced it. Purely
   * additive: pickDailyInsight's own rotation behaviour below is
   * completely unchanged by this field's presence. 'emergencyFund' is never
   * produced by buildInsightPool below — it exists only so
   * todayContextualInsight.ts's own, separate emergency-savings entry can
   * share this same DailyInsight shape. */
  source: 'goalImpact' | 'milestone' | 'savingsInterest' | 'scoreBand' | 'emergencyFund';
}

/**
 * "Daily AI Insight" — the signature hook (PRD ask: users should open Lulu
 * because they're curious what it noticed). Every entry in the pool is
 * derived from the user's own real numbers. Deliberately excludes anything
 * like "you're saving faster than 82% of Australians in your age group" —
 * that's a cohort/percentile claim with no real aggregate data source
 * behind it (same constraint as Discover's market data), so it's not
 * included even though it reads well as an example.
 *
 * Pass 2B correction — `excludeMilestoneAchievementId` lets the caller
 * (TodayScreen.tsx) suppress the "$X away from unlocking..." entry
 * specifically when it would restate the exact milestone the Journey
 * snapshot already displays as "Next" directly above it. Compared by
 * achievement id (structured identity — computeJourneySnapshot's own
 * `next.id`), never by parsing or diffing the rendered text of either
 * surface. getNextMilestone here and journeySnapshot.next use genuinely
 * different definitions (this one only considers quantified achievements;
 * journeySnapshot.next is the first unlocked achievement of any kind — see
 * journeySnapshot.ts's own doc comment) and can diverge; when they do, this
 * entry is a real, independent insight and stays eligible. Every other pool
 * entry (goal impact, savings-interest, score-band) is untouched and always
 * eligible — this exclusion is narrowly scoped to the one entry that can
 * actually duplicate Journey's content.
 *
 * Pass 2D — exported (was module-private) so todayContextualInsight.ts can
 * select a specific entry by its `source` tag (see DailyInsight's own doc
 * comment) rather than re-deriving the same condition a second time. The
 * function's own logic/conditions/text are completely unchanged.
 */
export function buildInsightPool(data: AppData, excludeMilestoneAchievementId: string | null): DailyInsight[] {
  const pool: DailyInsight[] = [];

  const goalImpact = buildGoalImpactOpportunity(data);
  if (goalImpact) {
    pool.push({ icon: goalImpact.icon, text: goalImpact.body, source: 'goalImpact' });
  }

  const nextMilestone = getNextMilestone(data);
  if (nextMilestone && nextMilestone.remaining > 0 && nextMilestone.achievement.id !== excludeMilestoneAchievementId) {
    pool.push({
      icon: 'flag',
      text: `You're only $${Math.round(nextMilestone.remaining).toLocaleString()} away from unlocking "${nextMilestone.achievement.title}".`,
      source: 'milestone',
    });
  }

  const savingsAsset = findSavingsAsset(data.assets);
  if (savingsAsset) {
    const summary = computeSavingsSummary(savingsAsset);
    const best = findBestComparison(data.savingsComparisons, summary.rate);
    if (best) {
      const diff = annualInterestDifference(summary.balance, summary.rate, best.rate);
      if (diff > 20) {
        pool.push({
          icon: 'sparkles',
          text: `The interest on your savings could be improved by approximately $${Math.round(diff).toLocaleString()}/year.`,
          source: 'savingsInterest',
        });
      }
    }
  }

  // Pass 2C correction — previously used luluScoreBand's label ("You're
  // doing incredibly well with your finances." at the top band), which
  // implies a complete financial-health judgment from manually recorded
  // information. Replaced with the same factual, recorded-data pattern
  // scoreChipPresentation already uses elsewhere — no complete-wellbeing
  // claim, for any score band, ever. luluScoreBand itself is left
  // untouched in luluScore.ts (out of scope for this correction); this is
  // simply no longer its caller.
  const luluScore = computeLuluScore(data);
  if (!luluScore.locked) {
    pool.push({ icon: 'trending-up', text: `Your ${brand.scoreName} is ${luluScore.score}/100 based on what you've recorded.`, source: 'scoreBand' });
  }

  return pool;
}

/**
 * `excludeMilestoneAchievementId` — pass the Journey snapshot's own
 * `next?.id` (or `null` when unavailable/all-completed) so this never
 * offers a milestone insight that merely restates what Journey already
 * shows as "Next" directly above it on Today (Pass 2B correction §4).
 * Structured id comparison only — see buildInsightPool's doc comment.
 */
export function pickDailyInsight(data: AppData, date: Date = new Date(), excludeMilestoneAchievementId: string | null = null): DailyInsight | null {
  const pool = buildInsightPool(data, excludeMilestoneAchievementId);
  if (pool.length === 0) return null;
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return pool[dayOfYear % pool.length];
}
