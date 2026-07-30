import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../types/models';
import { DEFAULT_CATEGORIES } from './defaultCategories';
import { generateId } from './id';
import { isValidScheduleAnchorDay, usesScheduleAnchor } from './calculations/recurringSchedule';

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
 *
 * Deliberately does NOT include `expectedMonthlyRepayment` in the signature
 * (PRD ask, regression-protection review): it's a mutable planning field, and
 * cards are addressed by a stable `id` everywhere they're updated
 * (`updateCreditCard` replaces in place via `.map(c => c.id === id ? ... :
 * c)`, never appends a second record) — so this function can never actually
 * encounter "the same card before and after an edit" as two separate array
 * entries to (mis)merge or fail to merge. The double-tap scenario this
 * function exists for produces two *freshly created* records from the same
 * form submission, which share identical values on every field including
 * this one — so including or excluding it from the signature doesn't change
 * whether that case is caught. With no demonstrated benefit and a mutable
 * field's presence in an identity signature being inherently riskier to
 * reason about, it's left out.
 */
export function dedupeCreditCards(data: AppData): AppData {
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
export function migrateIncomeToRecurringItems(data: AppData): AppData {
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
export function migrateSavingsAllocationPromptFlag(data: AppData): AppData {
  if (data.user.savingsAllocationPromptHandled !== undefined) return data;
  if (!isGenuinelyEstablishedProfile(data)) return data;
  return { ...data, user: { ...data.user, savingsAllocationPromptHandled: true } };
}

/**
 * Idempotent default/repair for `RecurringItem.scheduleAnchorDay` on data
 * that predates it, or that somehow carries a corrupt value (regression-
 * protection review, B2.0A) — every monthly/irregular item whose anchor is
 * missing OR fails isValidScheduleAnchorDay (not an integer 1-31) gets one
 * derived from its current `nextDueDate`'s day-of-month, once. This is a
 * best-effort default, not a reconstruction: if an item's `nextDueDate` had
 * already silently drifted under the old sequential month-stepping bug
 * before this fix shipped, the anchor derived here inherits that drift
 * rather than recovering the user's true original day — there is no way to
 * distinguish "this item's stored day is correct" from "it already
 * drifted" using only what's persisted. Never touches an item whose
 * `scheduleAnchorDay` already passes validation (including on every
 * subsequent app launch), so it does not alter behaviour that a user or an
 * already-applied edit has already established.
 */
export function migrateRecurringItemAnchors(data: AppData): AppData {
  let changed = false;
  const recurringItems = data.recurringItems.map((item) => {
    if (!usesScheduleAnchor(item.frequency)) return item;
    if (isValidScheduleAnchorDay(item.scheduleAnchorDay)) return item;
    changed = true;
    return { ...item, scheduleAnchorDay: new Date(item.nextDueDate).getDate() };
  });
  return changed ? { ...data, recurringItems } : data;
}

/** `migrated: true` only when at least one migration in the chain actually
 * changed something — every migration function here (dedupeCreditCards,
 * migrateIncomeToRecurringItems, migrateSavingsAllocationPromptFlag,
 * migrateRecurringItemAnchors) already returns its input object by
 * reference, unmodified, whenever it makes no change, so a single
 * `!== merged` reference check after the whole chain correctly detects "did
 * anything change" without a JSON.stringify comparison — deliberately
 * avoided since a full-object deep-compare on every launch would be
 * disproportionate to what a handful of cheap, already-reference-stable
 * functions already tell us for free (regression-protection review,
 * B2.0A follow-up §2). A fresh install (`!raw`) or corrupt data (`catch`)
 * never reports `migrated: true` — there is nothing migrated to persist in
 * either case, only defaults. */
export async function loadAppData(): Promise<{ data: AppData; migrated: boolean }> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const defaults = createEmptyAppData();
  if (!raw) return { data: defaults, migrated: false };
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
    const migratedData = migrateRecurringItemAnchors(
      migrateSavingsAllocationPromptFlag(migrateIncomeToRecurringItems(dedupeCreditCards(merged)))
    );
    return { data: migratedData, migrated: migratedData !== merged };
  } catch {
    return { data: defaults, migrated: false };
  }
}

/**
 * A true FIFO — `task` N+1 cannot start until `task` N's returned promise
 * has settled, so completions are structurally guaranteed to arrive in
 * issue order (B2.0C corrected design §1/§7). Generic and dependency-free
 * (no AsyncStorage, no AppData) so it is directly testable with fake/
 * deferred-promise tasks, without needing a native bridge. A rejected task
 * never breaks the chain for tasks queued behind it — `chain` is always
 * normalized back to a resolved state via the trailing `.then(ok, ok)`,
 * regardless of which branch its predecessor took.
 */
export function createSerializedQueue<T = void>(): (task: () => Promise<T>) => Promise<T> {
  let chain: Promise<void> = Promise.resolve();
  return (task) => {
    const result = chain.then(task);
    chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

/**
 * Builds the AppData save function around an injected low-level `write`
 * primitive, so the exact production algorithm — synchronous serialize-at-
 * call-time, then enqueue — can be exercised in tests against a fake writer,
 * without a real AsyncStorage/native bridge (unavailable outside the RN
 * runtime; confirmed empirically this round — real AsyncStorage.setItem
 * rejects immediately with "window is not defined" in the plain-Node test
 * harness, so it cannot itself be used to test success/ordering behaviour).
 * `saveAppData` below is this factory's one production instantiation.
 *
 * Serializing `data` synchronously, before it ever reaches the queue, is
 * what directly guarantees "the exact state accepted by commitData is the
 * state offered to persistence" (B2.0C corrected design §7) — it doesn't
 * depend on `data` remaining unmutated until its eventual queue turn (true
 * today by this codebase's spread/`.map`/`.filter` discipline, but this
 * makes it true by construction). A synchronous `JSON.stringify` failure
 * (e.g. a circular reference) rejects the caller's own promise immediately
 * and never enters the queue at all — it cannot consume a turn or delay
 * whatever is queued behind it.
 */
export function createAppDataSaver(write: (key: string, value: string) => Promise<void>): (data: AppData) => Promise<void> {
  const enqueue = createSerializedQueue<void>();
  return (data: AppData) => {
    let json: string;
    try {
      json = JSON.stringify(data);
    } catch (error) {
      return Promise.reject(error);
    }
    return enqueue(() => write(STORAGE_KEY, json));
  };
}

export const saveAppData: (data: AppData) => Promise<void> = createAppDataSaver((key, value) => AsyncStorage.setItem(key, value));
