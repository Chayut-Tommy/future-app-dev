import { AppData } from '../../types/models';
import { computeEmergencyFund } from './emergencyFund';
import { buildInsightPool, DailyInsight } from './dailyInsight';

/**
 * Pass 2D — Today's single "contextual insight" slot (final hierarchy §6).
 * A pure, deterministic priority selector reusing three ALREADY-EXISTING
 * calculations — no new financial logic, no new persisted ranking/dismissal
 * state, and no rotation-by-day (unlike pickDailyInsight, whose deterministic
 * daily rotation exists specifically because it's picking among several
 * always-eligible entries; here the ordering itself is the selection rule,
 * so at most one candidate is ever actually eligible on a given render).
 *
 * Priority order (first eligible one wins, so there is never more than one):
 * 1. Emergency savings — computeEmergencyFund (emergencyFund.ts), the exact
 *    calculation Safety Net's own detail screen uses (expense-based months-
 *    covered, not the income-based ratio opportunities.ts's separate
 *    "Emergency savings" entry uses) — chosen specifically so this insight's
 *    number can never disagree with the destination it focuses. "Genuinely
 *    relevant" reuses computeEmergencyFund's own already-established
 *    recommendedMax (expenses × 6) threshold — not a new number invented for
 *    this insight.
 * 2. Savings-rate insight — the exact 'savingsInterest' entry from
 *    dailyInsight.ts's own pool (same threshold, same wording, same source
 *    functions) — reused by identity via its `source` tag, never
 *    re-implemented.
 * 3. Another existing factual daily insight — the exact 'goalImpact' entry
 *    from the same pool. 'milestone' is never selected here (Today's
 *    Journey snapshot already shows the next milestone — showing it again
 *    would be exactly the "repeat the next Journey milestone" this pass
 *    forbids) and 'scoreBand' is never selected here either (Today's
 *    Briefing already shows the Score chip — showing the score number again
 *    would be exactly the "repeat the Score merely because the chip exists"
 *    this pass forbids). Both exclusions happen by construction (this
 *    function simply never looks for those two `source` tags), not by a new
 *    filter rule bolted onto the shared pool.
 */
export type TodayContextualInsightDestination = { kind: 'grow_focus'; target: 'safety_net' | 'saving' } | { kind: 'transactions' };

export interface TodayContextualInsight extends DailyInsight {
  destination: TodayContextualInsightDestination;
}

export function pickTodayContextualInsight(data: AppData, excludeMilestoneAchievementId: string | null): TodayContextualInsight | null {
  const emergencyFund = computeEmergencyFund(data);
  if (emergencyFund.monthsCovered !== null && emergencyFund.currentCash < emergencyFund.recommendedMax) {
    const monthsLabel = Math.round(emergencyFund.monthsCovered * 10) / 10;
    return {
      icon: 'shield-checkmark-outline',
      text: `Current: ${monthsLabel} month${monthsLabel === 1 ? '' : 's'} of expenses saved. General reference: many people aim for 3–6 months.`,
      source: 'emergencyFund',
      destination: { kind: 'grow_focus', target: 'safety_net' },
    };
  }

  const pool = buildInsightPool(data, excludeMilestoneAchievementId);
  const savingsEntry = pool.find((p) => p.source === 'savingsInterest');
  if (savingsEntry) return { ...savingsEntry, destination: { kind: 'grow_focus', target: 'saving' } };

  const goalImpactEntry = pool.find((p) => p.source === 'goalImpact');
  if (goalImpactEntry) return { ...goalImpactEntry, destination: { kind: 'transactions' } };

  return null;
}
