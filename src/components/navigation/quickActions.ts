import { AddAnythingKind } from './AddAnythingSheet';

/**
 * Nolie Design 5.1 Wave 3 — the canonical six quick actions.
 *
 * Doc A p.4/p.5 and handoff §2: "Quick actions, exactly six
 * (quickActions.ts): record_spending, income_received, add_bill, move_money,
 * add_goal, more (opens catalogue). Removed: add_account, add_debt,
 * add_asset, add_anything centre tile. Ask Nolie must not appear."
 *
 * WHAT CHANGED FROM THE NINE-TILE TRAY AND WHY:
 * - `add_asset` resolved to the `investment` (ETF) form despite its broad
 *   label, so a customer asking for "an asset" silently landed on one narrow
 *   type (audit D5-003). The catalogue now names all six asset types
 *   explicitly and no shortcut guesses.
 * - `add_account` opened a second, scoped chooser — a picker behind a
 *   "quick" action. The three balance types live in the catalogue instead.
 * - `add_debt` competed with the catalogue's own taxonomy (D5-010).
 * - The centre "Add anything" tile duplicated the catalogue's own title and
 *   was the placeholder slot for Ask Nolie. Ask Nolie has no operational
 *   capability, so per doc A p.16 it is ABSENT from the production IA —
 *   not a disabled tile, not a teaser. This module no longer imports it.
 *
 * Every tile resolves to the SAME canonical AddAnythingSheet workspace the
 * catalogue uses. There is no second form, store or calculation anywhere.
 */

export type QuickActionKey =
  | 'record_spending'
  | 'income_received'
  | 'add_bill'
  | 'move_money'
  | 'add_goal'
  | 'more';

export interface QuickActionTile {
  key: QuickActionKey;
  label: string;
  icon: string;
  /** `more` is visually distinct (dashed container, neutral ink) so five
   * tiles read as actions and More reads as "everything else" — deliberately
   * distinct WITHOUT reading as disabled (doc A p.4). */
  isMore: boolean;
}

/** Tile order is fixed by the design and is what the tray renders. */
export const QUICK_ACTION_ORDER: QuickActionKey[] = [
  'record_spending',
  'income_received',
  'add_bill',
  'move_money',
  'add_goal',
  'more',
];

const TILES: Record<QuickActionKey, QuickActionTile> = {
  record_spending: { key: 'record_spending', label: 'Record spending', icon: 'cart-outline', isMore: false },
  income_received: { key: 'income_received', label: 'Income received', icon: 'cash-outline', isMore: false },
  add_bill: { key: 'add_bill', label: 'Add bill', icon: 'calendar-outline', isMore: false },
  move_money: { key: 'move_money', label: 'Move money', icon: 'swap-horizontal-outline', isMore: false },
  add_goal: { key: 'add_goal', label: 'Add goal', icon: 'flag-outline', isMore: false },
  more: { key: 'more', label: 'More', icon: 'ellipsis-horizontal', isMore: true },
};

export function buildQuickActionTiles(): QuickActionTile[] {
  return QUICK_ACTION_ORDER.map((key) => TILES[key]);
}

/**
 * What each tile opens, expressed as the exact props the canonical
 * AddAnythingSheet already accepts. `more` passes no `initialKind`, which is
 * how the sheet lands on its chooser (the "Add to Nolie" catalogue).
 */
export interface QuickActionResolution {
  sheet: { initialKind?: AddAnythingKind };
  /** True only for `more`: the journey starts at the catalogue, so the
   * workspace's return stack is seeded with the chooser. Every other tile is
   * a DIRECT quick action whose Back must never reveal the catalogue
   * (audit D5-001). */
  opensCatalogue: boolean;
}

export function resolveQuickAction(key: QuickActionKey): QuickActionResolution {
  switch (key) {
    case 'record_spending':
      return { sheet: { initialKind: 'expense' }, opensCatalogue: false };
    case 'income_received':
      return { sheet: { initialKind: 'income_received' }, opensCatalogue: false };
    case 'add_bill':
      return { sheet: { initialKind: 'bill' }, opensCatalogue: false };
    case 'move_money':
      return { sheet: { initialKind: 'transfer' }, opensCatalogue: false };
    case 'add_goal':
      return { sheet: { initialKind: 'goal' }, opensCatalogue: false };
    case 'more':
      return { sheet: {}, opensCatalogue: true };
  }
}
