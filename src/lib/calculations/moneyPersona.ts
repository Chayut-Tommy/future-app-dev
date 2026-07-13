import { AppData, UserProfile } from '../../types/models';

export type MoneyPersona = 'employee' | 'freelancer' | 'retiree' | 'investor' | 'business_owner';

/**
 * Which persona frames the Money hero for this user. A pure presentation
 * lookup — never derives a new number, only picks which words describe the
 * same Safe-to-Spend/cash-runway figures already computed elsewhere (PRD
 * ask, §3/§12: "one shared engine, different presentation"). Falls back to
 * inferring from pay frequency only when the user hasn't explicitly picked
 * one, so existing users see no behaviour change until they opt in.
 */
export function resolveMoneyPersona(user: UserProfile): MoneyPersona {
  if (user.moneyPersona) return user.moneyPersona;
  return user.payFrequency === 'irregular' ? 'freelancer' : 'employee';
}

export interface MoneyHeroCopy {
  /** Small uppercase eyebrow label above the headline figure. */
  eyebrowScheduled: string;
  eyebrowRunway: string;
  /** What to call the estimated lump-sum figure. */
  amountLabel: string;
}

const PERSONA_COPY: Record<MoneyPersona, MoneyHeroCopy> = {
  employee: {
    eyebrowScheduled: 'Available Until Payday',
    eyebrowRunway: 'Current Cash Position',
    amountLabel: 'Estimated amount remaining',
  },
  freelancer: {
    eyebrowScheduled: 'Available Until Payday',
    eyebrowRunway: 'Estimated Cash Runway',
    amountLabel: 'Estimated amount remaining',
  },
  retiree: {
    eyebrowScheduled: 'Retirement Income',
    eyebrowRunway: 'Current Cash Position',
    amountLabel: 'Estimated amount available',
  },
  investor: {
    eyebrowScheduled: 'Passive Income',
    eyebrowRunway: 'Current Cash Position',
    amountLabel: 'Estimated amount available',
  },
  business_owner: {
    eyebrowScheduled: 'Business Cash Position',
    eyebrowRunway: 'Business Cash Position',
    amountLabel: 'Estimated amount remaining',
  },
};

export const MONEY_PERSONA_LABEL: Record<MoneyPersona, string> = {
  employee: 'Employee',
  freelancer: 'Freelancer / self-employed',
  retiree: 'Retiree',
  investor: 'Investor',
  business_owner: 'Business owner',
};

/** The persona-appropriate copy for the Money hero — pick eyebrowScheduled
 * when a real payday/income date is known, eyebrowRunway when Lulu is
 * falling back to a cash-runway estimate instead (same branching the hero
 * already does; this only supplies the words for each branch). */
export function computeMoneyHeroCopy(data: AppData): MoneyHeroCopy {
  return PERSONA_COPY[resolveMoneyPersona(data.user)];
}

export type CashRunwayStatus = 'comfortable' | 'building' | 'running_low';

/** A plain-language band over the existing cashRunwayDays estimate — pure
 * display categorisation of a number already computed by
 * computeSafeToSpend, never a new calculation (PRD ask, §4: "include an
 * overall status: Comfortable / Building / Running Low"). */
export function cashRunwayStatus(days: number): CashRunwayStatus {
  if (days >= 90) return 'comfortable';
  if (days >= 30) return 'building';
  return 'running_low';
}

export const CASH_RUNWAY_STATUS_LABEL: Record<CashRunwayStatus, string> = {
  comfortable: 'Comfortable',
  building: 'Building',
  running_low: 'Running Low',
};
