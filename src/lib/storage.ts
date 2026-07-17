import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../types/models';
import { DEFAULT_CATEGORIES } from './defaultCategories';
import { generateId } from './id';

const STORAGE_KEY = 'moneycoach.appdata.v1';

export function createEmptyAppData(): AppData {
  return {
    user: {
      name: '',
      currency: 'USD',
      theme: 'system',
      hasSeenIntro: false,
      monthlyIncome: 0,
      payFrequency: 'monthly',
      nextPayday: null,
      language: 'system',
    },
    categories: DEFAULT_CATEGORIES,
    recurringItems: [],
    transactions: [],
    goals: [],
    assets: [],
    liabilities: [],
    creditCards: [],
    netWorthHistory: [],
    luluScoreHistory: [],
    savingsComparisons: [],
    seenAchievementIds: [],
    completedLearningCardIds: [],
  };
}

/**
 * Collapses byte-identical credit card entries — the accidental result of a
 * fast double-tap on Save before the old add-card form guarded against it
 * (PRD bug report, §10/§P0: "duplicate credit cards"). Only merges cards
 * that match on every real-world field, so two genuinely distinct cards
 * from the same issuer (rare, but real) are never silently combined.
 */
function dedupeCreditCards(data: AppData): AppData {
  const seen = new Set<string>();
  const creditCards = data.creditCards.filter((c) => {
    const signature = [c.issuer, c.creditLimit, c.currentBalance, c.dueDay, c.minimumPayment, c.apr ?? ''].join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  return creditCards.length === data.creditCards.length ? data : { ...data, creditCards };
}

/**
 * One-time upgrade from the old single-income model (income lived directly
 * on `user.monthlyIncome`/`incomeAmount`/`payFrequency`/`nextPayday`) to
 * multiple income sources, each a `RecurringItem` (PRD ask, §3). Runs only
 * while a user still has legacy income recorded but no income-type
 * recurring item yet — after this runs once, AppStateContext's persist
 * pipeline keeps `user.monthlyIncome` etc. in sync from `recurringItems`
 * going forward, so this never has anything left to do on later loads.
 */
function migrateIncomeToRecurringItems(data: AppData): AppData {
  const hasIncomeItem = data.recurringItems.some((r) => r.type === 'income');
  const legacyAmount = data.user.incomeAmount ?? data.user.monthlyIncome;
  if (hasIncomeItem || !legacyAmount || legacyAmount <= 0) return data;
  const migrated = {
    id: generateId(),
    type: 'income' as const,
    label: 'Income',
    amount: legacyAmount,
    frequency: data.user.payFrequency,
    nextDueDate: data.user.nextPayday ?? new Date().toISOString(),
    nextDueDateUnknown: !data.user.nextPayday,
    isFixed: true,
    active: true,
    icon: 'cash-outline',
  };
  return { ...data, recurringItems: [...data.recurringItems, migrated] };
}

function isBeforeToday(iso: string): boolean {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(iso).getTime() < startOfToday.getTime();
}

/**
 * The one signal in this app that encodes genuine profile *age* rather than
 * financial completeness: `luluScoreHistory`/`netWorthHistory` each accrue
 * at most one entry per calendar day and are never backfilled, so an entry
 * dated before today means this profile was actually open on some earlier
 * day. Deliberately NOT based on whether assets/bills/goals/transactions
 * exist — a genuinely new user may add any of those before their first
 * income and must still be eligible for the prompt (PRD ask: "do not infer
 * feature eligibility from unrelated financial behaviour").
 *
 * This repo has no formal schema-version/migration framework, so this is
 * the best available heuristic, not a proof. Known limitation: a
 * pre-existing profile that happens to have no history entry from before
 * today (e.g. one created very recently, still on its first calendar day)
 * will not be caught by this check and may see the prompt once even though
 * it isn't brand new. Accepted deliberately — an occasional unnecessary
 * prompt is preferable to permanently, incorrectly suppressing a genuine
 * first-time user.
 */
function isGenuinelyEstablishedProfile(data: AppData): boolean {
  return data.luluScoreHistory.some((h) => isBeforeToday(h.date)) || data.netWorthHistory.some((h) => isBeforeToday(h.date));
}

/**
 * Existing profiles created before the Savings Allocation discovery prompt
 * shipped must never be unexpectedly interrupted by it (PRD ask). Runs once
 * — while `savingsAllocationPromptHandled` is still undefined — and stamps
 * it `true` only for profiles `isGenuinelyEstablishedProfile` identifies as
 * pre-existing. A brand-new install never reaches this function at all (see
 * the `!raw` early return below). A profile reset via Settings → Reset Lulu
 * also never reaches a `true` stamp here, since resetting clears
 * `luluScoreHistory`/`netWorthHistory` along with everything else, so a
 * reset profile reads as not-yet-established until it has genuinely been
 * used again on a later day.
 */
function migrateSavingsAllocationPromptFlag(data: AppData): AppData {
  if (data.user.savingsAllocationPromptHandled !== undefined) return data;
  if (!isGenuinelyEstablishedProfile(data)) return data;
  return { ...data, user: { ...data.user, savingsAllocationPromptHandled: true } };
}

export async function loadAppData(): Promise<AppData> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const defaults = createEmptyAppData();
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const merged = {
      ...defaults,
      ...parsed,
      // Shallow-merge nested objects explicitly so new fields on `user`
      // (e.g. theme, hasSeenIntro) get their default instead of `undefined`
      // when loading data saved by an older schema version.
      user: { ...defaults.user, ...parsed.user },
    };
    return migrateSavingsAllocationPromptFlag(migrateIncomeToRecurringItems(dedupeCreditCards(merged)));
  } catch {
    return defaults;
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
