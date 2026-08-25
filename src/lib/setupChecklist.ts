import { Asset } from '../types/models';

/**
 * Wave 9c visual/checklist correction — the checklist's canonical
 * SEVEN-step journey, and the structured completion predicates that keep
 * each step honest.
 *
 * THE PREDICATE DEFECT THIS FIXES (owner device test): every account in
 * the app is stored as an `Asset`, and the previous checks were broad
 * collection sweeps — "anything that is not cash/savings" satisfied the
 * Assets step, so an Everyday account completed Assets, and progress could
 * jump two steps from one record. Each predicate below names its exact
 * structured `AssetType` set, so ONE record can only ever complete ONE
 * account step. Cash completes nothing: it is neither an Everyday balance,
 * nor set-aside savings, nor a genuine wealth asset.
 *
 * Existence-based on purpose: a record the customer deliberately added at
 * $0 is still added — completion reflects that the QUESTION was answered,
 * never the balance.
 *
 * RN-free so every rule is directly executable evidence.
 */

/** Account types that are money balances, never "wealth assets". */
export const ACCOUNT_ASSET_TYPES = ['cash', 'savings', 'everyday'] as const;

/** The Everyday step: exactly the canonical Everyday account type — the
 * one the Money balance selector's eligibility default includes. */
export function hasEverydayAccount(assets: readonly Pick<Asset, 'type'>[]): boolean {
  return assets.some((a) => a.type === 'everyday');
}

/** The Savings step: exactly the canonical Savings type. Cash is NOT
 * savings — it answers no checklist question. */
export function hasSavingsAccount(assets: readonly Pick<Asset, 'type'>[]): boolean {
  return assets.some((a) => a.type === 'savings');
}

/** The Asset step: a genuine non-account wealth asset — vehicles ('car'),
 * property, investments (etf/shares/crypto), retirement ('super'),
 * business, furniture, collectibles, other. Everyday, Savings and Cash are
 * excluded by the structured type set, never by balance or label. */
export function hasWealthAsset(assets: readonly Pick<Asset, 'type'>[]): boolean {
  return assets.some((a) => !(ACCOUNT_ASSET_TYPES as readonly string[]).includes(a.type));
}

/**
 * The priority "Continue setup" resolves through — the SAME canonical
 * order the rows render and VoiceOver reads:
 *   income → everyday → savings ('cash' key, historical) → assets →
 *   bills → debt → goal (always last, optional).
 * STRUCTURED STATE ONLY: the resolver walks step keys and their computed
 * `done` flags, never labels or icons. Deferred and answered steps are
 * `done`, so a deferred step — the optional goal especially — can never
 * become the next CTA.
 */
export const SETUP_STEP_PRIORITY = ['income', 'everyday', 'cash', 'assets', 'bills', 'debt', 'goal'] as const;

export function resolveNextSetupStep<T extends { key: string; done: boolean }>(steps: readonly T[]): T | null {
  for (const key of SETUP_STEP_PRIORITY) {
    const step = steps.find((s) => s.key === key);
    if (step && !step.done) return step;
  }
  return null;
}
