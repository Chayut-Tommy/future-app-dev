import { useRef } from 'react';
import { AppData } from '../../types/models';
import { computeRecordedMonthlyCashflow } from './monthlySummary';
import { computeTotalWealth } from './wealthDefinitions';

export type FinancialCashflowZone = 'positive' | 'negative';
export type FinancialStateKey = 'standard' | 'cashflow_focus' | 'financial_rebuild';

export interface FinancialState {
  key: FinancialStateKey;
  /** The resolved cashflow signal, after hysteresis — 'negative' means this
   * month's recorded cashflow is materially tight/negative. */
  cashflowZone: FinancialCashflowZone;
  /** Whether total net wealth is materially negative (small rounding
   * tolerance only — see NET_WEALTH_TOLERANCE below). */
  netWealthNegative: boolean;
  /** Raw inputs, exposed so callers never need to recompute them.
   * `netCashflow` is *recorded* cashflow this calendar month (see
   * `computeRecordedMonthlyCashflow`) — not the recurring-income-rate-based
   * figure `computeMonthlySummary` produces for budgeting math. */
  netCashflow: number;
  netWealth: number;
  /** The +/- threshold actually used this computation (1% of monthly
   * income, or the $25 fallback) — exposed for transparency/debugging, not
   * for display. */
  cashflowThreshold: number;
}

// A tiny epsilon only — large enough to absorb floating-point/cents noise,
// small enough to never mask a genuinely negative position (PRD ask: "a
// small tolerance... should not obscure a genuinely negative position").
// Net wealth moves slowly compared to monthly cashflow, so unlike cashflow
// it doesn't need true hysteresis (a remembered previous state) — a fixed
// epsilon is enough to stop $0.01 rounding from flipping the state.
const NET_WEALTH_TOLERANCE = 1;

// Cashflow, in contrast, is compared against a *rate* (this month's income)
// so the same $100 swing matters a lot for someone earning $1,000/month and
// barely at all for someone earning $20,000/month — hence a threshold
// proportional to income, not a flat dollar figure.
const CASHFLOW_THRESHOLD_RATE = 0.01; // 1% of monthly income
const CASHFLOW_THRESHOLD_FALLBACK = 25; // used when income is $0/unknown

/**
 * computeFinancialState — the single authoritative "is this user in a
 * recovery-oriented state" signal, replacing three independent local
 * checks that used to live in DebtRecoveryCard/debtRecovery.ts,
 * WealthScreen's hero, and YourFutureCard (PRD bug report: each screen
 * quietly disagreed with the others about what "rebuilding" meant).
 *
 * State matrix (cashflowZone × netWealthNegative):
 *   positive × false → 'standard'          (no special messaging)
 *   negative × false → 'cashflow_focus'    (tight month, wealth is fine)
 *   positive × true  → 'financial_rebuild' (wealth negative, cashflow OK)
 *   negative × true  → 'financial_rebuild' (both negative)
 * financial_rebuild's two cashflow variants get different supporting copy
 * (see the describeFinancialState* functions below) but are the same state
 * key — the distinction that matters for actions/tone is net wealth, not
 * which cashflow variant produced it.
 *
 * netCashflow is *recorded* cashflow — actual income transactions received
 * this calendar month minus actual expenses recorded this month
 * (`computeRecordedMonthlyCashflow`, the same source July So Far/Available
 * Until Payday/Estimated Wealth Change already use) — never the recurring
 * monthly income *rate* blended with logged expenses that
 * `computeMonthlySummary`'s `netCashflow` produces for budgeting math. An
 * earlier version of this engine read that rate-based figure, so a one-off
 * income transaction (a bonus, a large ad-hoc payment) that made the actual
 * month strongly positive still showed "this month's cashflow is also
 * tight" (PRD bug report) — the copy already said "recorded cashflow," the
 * implementation just wasn't reading recorded data. `cashflowThreshold`
 * below still scales off the recurring income *rate* deliberately — it
 * needs a stable "normal" income magnitude to size the dead zone against,
 * which is a different question from what the cashflow value itself is.
 *
 * Cashflow hysteresis: comparing netCashflow to a single $0 threshold makes
 * the state flicker on rounding noise or a single small transaction. This
 * uses a two-threshold dead zone instead — enters 'negative' only below
 * -1%-of-income, returns to 'positive' only above +1%-of-income, and
 * *retains whatever zone it resolved to last time* while inside the band
 * (PRD ask). Income of $0/unknown can't produce a 1% threshold, so a flat
 * $25 fallback is used instead — small enough to matter for someone with
 * no income on file, deliberately not zero.
 *
 * That "last time" memory is deliberately kept as ephemeral React state
 * (via the useFinancialState hook below), never written into AppData or
 * routed through persist(). An earlier version persisted it to
 * `data.user.financialCashflowZone` on every save — that put this feature
 * on the same hot path as an existing debounce effect on Today
 * (TodayScreen.tsx's achievement-celebration effect deliberately re-arms a
 * timer on every `data` reference change) and froze the app after any
 * data edit (PRD bug report). Keeping the memory outside `data` entirely
 * removes that whole class of risk — the trade-off is the remembered zone
 * resets on app restart instead of surviving it, which is the accepted
 * cost (app usability over cross-restart hysteresis, PRD ask).
 *
 * Net wealth uses `computeTotalWealth` (accessible net worth + retirement)
 * — the same total the three replaced checks were each independently
 * re-deriving as `totalAssets - totalLiabilities`.
 *
 * Consumers: Today's financial-state card (FinancialStateCard.tsx),
 * Wealth Map's hero supportive line (WealthScreen.tsx), Your Future's
 * rebuild-path gating (YourFutureCard.tsx) — each via the useFinancialState
 * hook below, never by calling computeFinancialState directly with no
 * previousZone (that's only for the hook and for tests). Any new surface
 * referencing the user's overall financial position must go through the
 * hook — never re-derive netWorth < 0 or netCashflow < 0 locally.
 */
export function computeFinancialState(data: AppData, previousZone?: FinancialCashflowZone): FinancialState {
  const netCashflow = computeRecordedMonthlyCashflow(data);
  const netWealth = computeTotalWealth(data);

  const monthlyIncome = data.user.monthlyIncome;
  const cashflowThreshold = monthlyIncome > 0 ? monthlyIncome * CASHFLOW_THRESHOLD_RATE : CASHFLOW_THRESHOLD_FALLBACK;

  let cashflowZone: FinancialCashflowZone;
  if (netCashflow < -cashflowThreshold) {
    cashflowZone = 'negative';
  } else if (netCashflow > cashflowThreshold) {
    cashflowZone = 'positive';
  } else {
    // Dead zone — retain whatever the last resolved zone was. A user who
    // has never had a resolved zone before (first ever computation, still
    // inside the dead zone) defaults to 'positive': there's no history to
    // retain, and a brand-new user with nothing logged yet shouldn't be
    // told their cashflow is tight.
    cashflowZone = previousZone ?? 'positive';
  }

  const netWealthNegative = netWealth < -NET_WEALTH_TOLERANCE;

  const key: FinancialStateKey = netWealthNegative ? 'financial_rebuild' : cashflowZone === 'negative' ? 'cashflow_focus' : 'standard';

  return { key, cashflowZone, netWealthNegative, netCashflow, netWealth, cashflowThreshold };
}

/**
 * useFinancialState — the only sanctioned way to get a FinancialState.
 * Wraps computeFinancialState with the cashflow hysteresis memory held in a
 * useRef, deliberately kept out of AppData/persist()/AsyncStorage (see the
 * comment on computeFinancialState above for why). The remembered zone is
 * per-mount, not per-app-restart — that's the accepted trade-off.
 */
export function useFinancialState(data: AppData): FinancialState {
  const previousZoneRef = useRef<FinancialCashflowZone | undefined>(undefined);
  const state = computeFinancialState(data, previousZoneRef.current);
  previousZoneRef.current = state.cashflowZone;
  return state;
}

export interface FinancialStateActionSpec {
  key: 'income' | 'bills' | 'spending';
  label: string;
}

/** The only actions ever shown for a non-standard state (PRD ask: no debt-
 * specific or savings-specific actions — those read as Navilo prescribing
 * a strategy). Every surface that renders action buttons for
 * cashflow_focus/financial_rebuild must use exactly this list. */
export const FINANCIAL_STATE_ACTIONS: FinancialStateActionSpec[] = [
  { key: 'income', label: 'Add income' },
  { key: 'bills', label: 'Add bills' },
  { key: 'spending', label: 'Review spending' },
];

export interface FinancialStateCopy {
  label: string;
  headline: string;
  body: string;
}

/** Today's financial-state card copy — the exact wording approved for this
 * surface. Cashflow Focus and both Financial Rebuild variants each have
 * distinct supporting copy; Standard returns null (no card shown at all). */
export function describeFinancialStateForToday(state: FinancialState): FinancialStateCopy | null {
  if (state.key === 'standard') return null;
  if (state.key === 'cashflow_focus') {
    return {
      label: 'Cashflow Focus',
      headline: "This month's cashflow is currently tight.",
      body: 'Recorded outgoings are currently higher than recorded income for this month. Your overall net position remains positive, and the figures will update as new activity is added.',
    };
  }
  // financial_rebuild — copy differs by cashflow variant, per PRD ask.
  return {
    label: 'Financial Rebuild',
    headline: 'Your current financial position is rebuilding.',
    body:
      state.cashflowZone === 'positive'
        ? "This month's recorded cashflow is positive, while recorded liabilities remain higher than recorded assets. Your Wealth Map will update automatically as your financial information changes."
        : 'Recorded liabilities currently exceed recorded assets, and this month\'s cashflow is also tight. Your position will update automatically as income, spending, assets and liabilities change.',
  };
}

/** Wealth Map hero's single supportive line — worded specifically for that
 * surface (shorter, "Wealth Map will update" framing) rather than reusing
 * Today's card copy verbatim, per PRD ask §G. Standard and Cashflow-Focus-
 * with-negative-wealth (impossible combination) return null. */
export function describeFinancialStateForWealthMap(state: FinancialState): string | null {
  if (state.key === 'standard') return null;
  if (state.key === 'cashflow_focus') {
    return "This month's cashflow is currently tight, while your overall net position remains positive.";
  }
  return state.cashflowZone === 'positive'
    ? 'Recorded liabilities currently exceed recorded assets, while this month\'s cashflow is positive. Your Wealth Map will update automatically as your financial information changes.'
    : 'Recorded liabilities currently exceed recorded assets, and this month\'s cashflow is also tight. Your Wealth Map will update automatically as your financial information changes.';
}
