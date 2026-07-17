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
  /** Small uppercase eyebrow label above the headline figure, shown only
   * when a real payday/income date is known — the "Available Money" no-
   * payday state uses fixed copy, not persona variation (PRD ask,
   * §Adaptive hero: literal "Available Money" / "Choose a balance..."
   * titles). */
  eyebrowScheduled: string;
  /** What to call the estimated lump-sum figure. */
  amountLabel: string;
}

const PERSONA_COPY: Record<MoneyPersona, MoneyHeroCopy> = {
  employee: {
    eyebrowScheduled: 'Available Until Payday',
    amountLabel: 'Estimated amount remaining',
  },
  freelancer: {
    eyebrowScheduled: 'Available Until Payday',
    amountLabel: 'Estimated amount remaining',
  },
  retiree: {
    eyebrowScheduled: 'Retirement Income',
    amountLabel: 'Estimated amount available',
  },
  investor: {
    eyebrowScheduled: 'Passive Income',
    amountLabel: 'Estimated amount available',
  },
  business_owner: {
    eyebrowScheduled: 'Business Cash Position',
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

/** The persona-appropriate copy for the Money hero's known-payday state —
 * the no-payday "Available Money"/"Choose a balance" states use fixed
 * copy instead (PRD ask, §Adaptive hero). */
export function computeMoneyHeroCopy(data: AppData): MoneyHeroCopy {
  return PERSONA_COPY[resolveMoneyPersona(data.user)];
}
