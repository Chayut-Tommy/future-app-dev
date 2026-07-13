import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../types/models';
import { DEFAULT_CATEGORIES } from './defaultCategories';

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
    return dedupeCreditCards(merged);
  } catch {
    return defaults;
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
