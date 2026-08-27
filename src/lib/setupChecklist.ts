import { AppData, Asset } from '../types/models';

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

/**
 * Post-Wave-10 checklist UX closure — the PURE composition the Today card
 * renders from. Presentation-only: it consumes the structured per-step
 * state the existing predicates/flags produce and decides order, progress
 * copy, the compact subset and grouping. It owns NO completion rule, no
 * storage and no routing — one data model, one set of predicates.
 */
export interface SetupStepComposition {
  key: (typeof SETUP_STEP_PRIORITY)[number];
  /** Data-backed completion — a real record satisfies the predicate. */
  completed: boolean;
  /** Explicit deferral or "not applicable" acknowledgement (a persisted
   * confirmed* flag) WITHOUT backing data. Never called complete. */
  acknowledged: boolean;
}

export interface SetupChecklistComposition {
  /** The locked seven-task order. */
  order: readonly (typeof SETUP_STEP_PRIORITY)[number][];
  /** First four tasks / the "Add when it applies" group. */
  coreKeys: readonly (typeof SETUP_STEP_PRIORITY)[number][];
  whenItAppliesKeys: readonly (typeof SETUP_STEP_PRIORITY)[number][];
  /** completed + acknowledged (a step is resolved either way). */
  resolvedCount: number;
  completedCount: number;
  total: number;
  /** Honest progress copy: "complete" ONLY while every resolved step is
   * data-backed; any acknowledgement in the numerator switches the word
   * to "reviewed" — a deferred step is never called complete. */
  progressLabel: string;
  progressRatio: number;
  /** Nothing resolved yet — the card renders fully expanded. */
  zeroProgress: boolean;
  /** Every step resolved — the existing setup-complete outcome shows. */
  allResolved: boolean;
  /** First unresolved task in the locked order (the Continue target). */
  nextKey: (typeof SETUP_STEP_PRIORITY)[number] | null;
  /** The compact card's rows: the next (up to) two unresolved tasks. */
  compactKeys: readonly (typeof SETUP_STEP_PRIORITY)[number][];
}

export function composeSetupChecklist(steps: readonly SetupStepComposition[]): SetupChecklistComposition {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const order = SETUP_STEP_PRIORITY.filter((k) => byKey.has(k));
  const resolved = (k: (typeof SETUP_STEP_PRIORITY)[number]) => {
    const s = byKey.get(k)!;
    return s.completed || s.acknowledged;
  };
  const completedCount = order.filter((k) => byKey.get(k)!.completed).length;
  const resolvedCount = order.filter(resolved).length;
  const anyAcknowledgedOnly = order.some((k) => !byKey.get(k)!.completed && byKey.get(k)!.acknowledged);
  const total = order.length;
  const unresolved = order.filter((k) => !resolved(k));
  return {
    order,
    coreKeys: order.slice(0, 4),
    whenItAppliesKeys: order.slice(4),
    resolvedCount,
    completedCount,
    total,
    progressLabel: `${resolvedCount} of ${total} ${anyAcknowledgedOnly ? 'reviewed' : 'complete'}`,
    progressRatio: total === 0 ? 0 : resolvedCount / total,
    zeroProgress: resolvedCount === 0,
    allResolved: resolvedCount === total && total > 0,
    nextKey: unresolved[0] ?? null,
    compactKeys: unresolved.slice(0, 2),
  };
}

/**
 * Checklist consistency correction — REAL DATA WINS, permanently. Applied
 * inside the persist pipeline (AppStateContext, next to
 * syncIncomeAggregate) so the moment genuinely contradicting data is
 * recorded, the corresponding setup acknowledgement is CLEARED — not just
 * visually superseded. That is what keeps a later deletion honest: with
 * the flag gone, deleting the last Savings item (or the final real debt)
 * returns the task to unresolved instead of resurrecting a stale "I don't
 * have any" answer the customer gave before the data ever existed.
 * Pure and idempotent; returns the SAME object when nothing applies.
 */
export function supersedeSetupAcknowledgements(data: AppData): AppData {
  const savingsSupersedes = data.user.confirmedNoSavings === true && hasSavingsAccount(data.assets);
  const debtSupersedes =
    data.user.confirmedNoDebt === true &&
    (data.liabilities.some((l) => l.currentBalance > 0) || data.creditCards.some((c) => c.currentBalance > 0));
  if (!savingsSupersedes && !debtSupersedes) return data;
  return {
    ...data,
    user: {
      ...data.user,
      ...(savingsSupersedes ? { confirmedNoSavings: false } : {}),
      ...(debtSupersedes ? { confirmedNoDebt: false } : {}),
    },
  };
}
