import { Ionicons } from '@expo/vector-icons';
import { AppData } from '../../types/models';
import { buildGoalImpactOpportunity } from './opportunities';
import { getNextMilestone } from './achievements';
import { findSavingsAsset, computeSavingsSummary, findBestComparison, annualInterestDifference } from './savingsCoach';
import { luluScoreBand, computeLuluScore } from './luluScore';
import { brand } from '../brand';

export interface DailyInsight {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
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
 */
function buildInsightPool(data: AppData, excludeMilestoneAchievementId: string | null): DailyInsight[] {
  const pool: DailyInsight[] = [];

  const goalImpact = buildGoalImpactOpportunity(data);
  if (goalImpact) {
    pool.push({ icon: goalImpact.icon, text: goalImpact.body });
  }

  const nextMilestone = getNextMilestone(data);
  if (nextMilestone && nextMilestone.remaining > 0 && nextMilestone.achievement.id !== excludeMilestoneAchievementId) {
    pool.push({
      icon: 'flag',
      text: `You're only $${Math.round(nextMilestone.remaining).toLocaleString()} away from unlocking "${nextMilestone.achievement.title}".`,
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
        });
      }
    }
  }

  const luluScore = computeLuluScore(data);
  if (!luluScore.locked) {
    const band = luluScoreBand(luluScore.score);
    pool.push({ icon: 'trending-up', text: `${band.label} Your ${brand.scoreName} is ${luluScore.score}/100 today.` });
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
