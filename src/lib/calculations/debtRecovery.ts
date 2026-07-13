import { AppData } from '../../types/models';
import { computeMonthlySummary } from './monthlySummary';

export interface DebtRecoveryStatus {
  active: boolean;
  netWorth: number;
  expensesExceedIncome: boolean;
  debtExceedsAssets: boolean;
}

/**
 * A hard money situation should still feel supportive, not judged (PRD
 * ask): "you are rebuilding," not "you are failing." Active whenever net
 * worth is negative, spending has outpaced income this month, or debt
 * outweighs assets — any one of these is enough to switch Lulu's tone.
 */
export function computeDebtRecoveryStatus(data: AppData): DebtRecoveryStatus {
  const totalAssets = data.assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = data.liabilities.reduce((sum, l) => sum + l.currentBalance, 0);
  const netWorth = totalAssets - totalLiabilities;
  const summary = computeMonthlySummary(data);
  const expensesExceedIncome = data.user.monthlyIncome > 0 && summary.netCashflow < 0;
  const debtExceedsAssets = totalLiabilities > 0 && totalLiabilities > totalAssets;

  return {
    active: netWorth < 0 || expensesExceedIncome || debtExceedsAssets,
    netWorth,
    expensesExceedIncome,
    debtExceedsAssets,
  };
}
