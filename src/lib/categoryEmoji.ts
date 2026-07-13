// A friendly emoji per category, keyed by id — purely presentational (PRD
// ask: "adding money should feel quick and satisfying, not like accounting
// software"). The underlying Category records and transaction logic are
// untouched; this only changes how a category looks in the picker.
const CATEGORY_EMOJI: Record<string, string> = {
  'cat-salary': '💼',
  'cat-side-hustle': '💻',
  'cat-investment-income': '📈',
  'cat-rental-income': '🏠',
  'cat-gift': '🎁',
  'cat-bonus': '🎁',
  'cat-other-income': '➕',
  'cat-rent': '🏠',
  'cat-mortgage': '🏠',
  'cat-groceries': '🛒',
  'cat-dining': '🍔',
  'cat-transport': '🚗',
  'cat-shopping': '🛍',
  'cat-travel': '✈️',
  'cat-subscriptions': '💳',
  'cat-health': '💪',
  'cat-entertainment': '🎬',
  'cat-utilities': '⚡',
  'cat-insurance': '🛡️',
  'cat-debt': '💳',
  'cat-other-expense': '➕',
};

export function categoryEmoji(categoryId: string): string {
  return CATEGORY_EMOJI[categoryId] ?? '💰';
}
