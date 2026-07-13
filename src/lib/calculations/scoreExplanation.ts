import { AppData } from '../../types/models';
import { LuluScoreResult, ScoreCategory, ScoreFactor, ScoreCategoryKey, summariseCategory } from './luluScore';
import { brand } from '../brand';

/**
 * Deterministic explanation layer (PRD ask, §A12/§Part C Phase 4):
 * "Rules calculate the score, AI explains and coaches." Every function
 * here only describes numbers `computeLuluScore` already produced — it
 * never invents points, changes weights, or overrides the calculation.
 * Any future AI layer should call these (or read their output), not
 * re-derive its own opinion of the score.
 */

export interface ScoreMovementEntry {
  categoryKey: ScoreCategoryKey;
  categoryLabel: string;
  delta: number;
  text: string;
}

export interface ScoreMovement {
  currentScore: number;
  previousScore: number;
  delta: number;
  /** Non-zero category movements, largest absolute change first. */
  entries: ScoreMovementEntry[];
}

function buildMovementText(category: ScoreCategory, delta: number): string {
  const { strong } = summariseCategory(category);
  const direction = delta > 0 ? 'improved' : 'declined';
  const contextLabel = strong ? ` — ${strong.label.toLowerCase()} is the strongest factor` : '';
  return `${category.label} ${direction}${contextLabel}.`;
}

/**
 * Compares today's category snapshot against the most recent prior stored
 * snapshot (real history, never fabricated) — the same mechanism that
 * powers "Improved Lulu Score by 10 points" achievements, just at
 * category granularity (PRD ask, §A10).
 */
export function computeScoreMovement(data: AppData, result: LuluScoreResult): ScoreMovement | null {
  if (result.locked) return null;
  const todayISO = new Date().toISOString().slice(0, 10);
  const prior = [...data.luluScoreHistory].reverse().find((e) => e.date !== todayISO && e.categories);
  if (!prior || !prior.categories) return null;

  const entries: ScoreMovementEntry[] = [];
  for (const cat of result.categories) {
    const priorCat = prior.categories.find((c) => c.key === cat.key);
    if (!priorCat) continue;
    const delta = Math.round(cat.points) - priorCat.points;
    if (delta === 0) continue;
    entries.push({ categoryKey: cat.key, categoryLabel: cat.label, delta, text: buildMovementText(cat, delta) });
  }
  entries.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { currentScore: result.score, previousScore: prior.score, delta: result.score - prior.score, entries };
}

/** The category with the best points/maxPoints ratio — "strongest area." */
export function computeStrongestArea(result: LuluScoreResult): ScoreCategory | null {
  if (result.locked || result.categories.length === 0) return null;
  return [...result.categories].sort((a, b) => b.points / (b.maxPoints || 1) - a.points / (a.maxPoints || 1))[0];
}

/** The single applicable factor, across every category, with the most
 * potential points left on the table — "biggest opportunity." */
export function computeBiggestOpportunity(result: LuluScoreResult): { category: ScoreCategory; factor: ScoreFactor } | null {
  if (result.locked) return null;
  let best: { category: ScoreCategory; factor: ScoreFactor } | null = null;
  for (const category of result.categories) {
    for (const factor of category.factors) {
      if (!factor.applicable) continue;
      if (!best || factor.potentialPoints > best.factor.potentialPoints) best = { category, factor };
    }
  }
  return best;
}

/** The A12 example line, assembled entirely from rule-computed numbers —
 * "Your strongest area is X. Your biggest opportunity is Y... up to N
 * points." A future AI layer may restyle this sentence, but the facts
 * (which area, which factor, how many points) must come from here. */
export function buildScoreSummaryLine(result: LuluScoreResult): string | null {
  if (result.locked) return null;
  const strongest = computeStrongestArea(result);
  const opportunity = computeBiggestOpportunity(result);
  if (!strongest || !opportunity) return null;
  const gain = Math.round(opportunity.factor.potentialPoints);
  const gainClause = gain > 0 ? ` This could improve your ${brand.scoreName} by up to ${gain} point${gain === 1 ? '' : 's'}.` : '';
  return `Your strongest area is ${strongest.label}. Your biggest opportunity is ${opportunity.factor.label.toLowerCase()}.${gainClause}`;
}
