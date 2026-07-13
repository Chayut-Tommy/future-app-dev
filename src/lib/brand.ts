/**
 * Central brand configuration (PRD ask, §11: controlled rebrand, Phase 1).
 * Every user-facing string that names the product or its assistant should
 * read from here rather than hardcoding "Lulu" — this is the single place
 * a future name change (or region-specific variant) gets made.
 *
 * Deliberately does NOT touch storage keys, navigation routes, file/folder
 * names, or internal identifiers — those stay as-is until a dedicated,
 * migration-safe technical-identity pass (PRD §11 Phase 3), so existing
 * AsyncStorage data is never at risk from this rename.
 */
export const brand = {
  name: 'Navilo',
  tagline: 'Your wealth navigator',
  assistantName: 'Navilo',
  scoreName: 'Navilo Score',
} as const;
