import { Ionicons } from '@expo/vector-icons';

/**
 * Wave 9c final correction pass — THE canonical income-source choices.
 *
 * These constants lived privately inside AddIncomeModal. Onboarding's
 * optional income block now offers the SAME structured selector, so the
 * ids, labels and saved-icon mapping move to this one shared module rather
 * than being duplicated — a second copy could silently drift and become a
 * parallel source of truth. AddIncomeModal imports them back unchanged.
 *
 * The source choice remains exactly what it has always been in the
 * canonical journey: presentation metadata. It prefills the record's icon
 * and (when empty) its name, and is never part of any validator or
 * calculation. `UserProfile.incomeSource` is the model's own designated
 * place for "which income category was picked when setting this up".
 */
export const INCOME_SOURCE_IDS = [
  'cat-salary',
  'cat-side-hustle',
  'cat-investment-income',
  'cat-rental-income',
  'cat-gift',
  'cat-other-income',
] as const;

export const INCOME_SOURCE_LABEL: Record<string, string> = {
  'cat-salary': 'Salary',
  'cat-side-hustle': 'Side hustle',
  'cat-investment-income': 'Dividends',
  'cat-rental-income': 'Rental income',
  'cat-gift': 'Gift',
  'cat-other-income': 'Other',
};

/** The Ionicons glyph a saved income record carries for each source — the
 * exact mapping AddIncomeModal has always stamped via `chooseSource`. */
export const INCOME_SOURCE_RECORD_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  'cat-salary': 'briefcase-outline',
  'cat-side-hustle': 'laptop-outline',
  'cat-investment-income': 'trending-up-outline',
  'cat-rental-income': 'home-outline',
  'cat-gift': 'gift-outline',
  'cat-other-income': 'cash-outline',
};
