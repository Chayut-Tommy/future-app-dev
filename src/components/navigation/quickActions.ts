import { AddAnythingKind } from './AddAnythingSheet';
import { AskNolieCapability, resolveCenterTileConfig } from '../../lib/askNolie';

export type QuickActionKey =
  | 'recordIncome'
  | 'recordSpending'
  | 'addBill'
  | 'addAccount'
  | 'centerAction'
  | 'moveMoney'
  | 'addDebt'
  | 'addAsset'
  | 'addGoal';

export interface QuickActionTile {
  key: QuickActionKey;
  label: string;
  icon: string;
  /** True only for the centre tile when a real Ask Nolie capability is
   * enabled — the strongest branded (ambient ocean-blue, restrained glow)
   * treatment applies only then. Every other tile, including the
   * "Add anything" fallback the centre position shows today, renders with
   * the tray's ordinary tile styling. */
  ambient: boolean;
}

/** What each tray tile should do, expressed as the exact props the
 * existing, canonical AddAnythingSheet needs to land the user on the right
 * destination — never a duplicate form, store, or calculation. A `null`
 * `sheet` value (only ever the centre tile, only ever when Ask Nolie is
 * genuinely enabled) means "don't open AddAnythingSheet at all" — that
 * tile calls `askNolieCapability.open()` instead. */
export interface QuickActionResolution {
  sheet: { initialKind?: AddAnythingKind; onlyBalances?: boolean } | null;
}

const ASSET_ORDER_TOP: QuickActionKey[] = ['recordIncome', 'recordSpending', 'addBill'];
const ASSET_ORDER_MIDDLE: QuickActionKey[] = ['addAccount', 'centerAction', 'moveMoney'];
const ASSET_ORDER_BOTTOM: QuickActionKey[] = ['addDebt', 'addAsset', 'addGoal'];

/** The tray's fixed 3x3 layout, top row first — a plain ordered list rather
 * than a nested grid structure, since QuickActionsTray itself only needs to
 * lay these out three-per-row in order. */
export const QUICK_ACTION_ORDER: QuickActionKey[] = [...ASSET_ORDER_TOP, ...ASSET_ORDER_MIDDLE, ...ASSET_ORDER_BOTTOM];

/** Builds the tray's tile list, resolving the centre tile's copy from the
 * Ask Nolie capability flag (see askNolie.ts) rather than hardcoding it. */
export function buildQuickActionTiles(askNolie: AskNolieCapability, assistantName: string): QuickActionTile[] {
  const center = resolveCenterTileConfig(askNolie, assistantName);
  const tiles: Record<QuickActionKey, QuickActionTile> = {
    recordIncome: { key: 'recordIncome', label: 'Record income', icon: 'cash-outline', ambient: false },
    recordSpending: { key: 'recordSpending', label: 'Record spending', icon: 'cart-outline', ambient: false },
    addBill: { key: 'addBill', label: 'Add bill', icon: 'calendar-outline', ambient: false },
    addAccount: { key: 'addAccount', label: 'Add account', icon: 'wallet-outline', ambient: false },
    centerAction: {
      key: 'centerAction',
      label: center.label,
      icon: center.kind === 'askNolie' ? 'sparkles' : 'add-circle-outline',
      ambient: center.kind === 'askNolie',
    },
    moveMoney: { key: 'moveMoney', label: 'Move money', icon: 'swap-horizontal-outline', ambient: false },
    addDebt: { key: 'addDebt', label: 'Add debt', icon: 'card-outline', ambient: false },
    addAsset: { key: 'addAsset', label: 'Add asset', icon: 'trending-up-outline', ambient: false },
    addGoal: { key: 'addGoal', label: 'Add goal', icon: 'flag-outline', ambient: false },
  };
  return QUICK_ACTION_ORDER.map((key) => tiles[key]);
}

/** Pure mapping from a tray tile to the existing canonical flow it opens —
 * every destination reuses AddAnythingSheet's own tile-press/embedded-form
 * machinery (see AddAnythingSheet.tsx's `initialKind`/`onlyBalances`), so
 * this function only ever chooses WHICH existing entry to use, never
 * reimplements one. `null` marks the one tile (centre, Ask Nolie enabled)
 * that does not open AddAnythingSheet at all. */
export function resolveQuickAction(key: QuickActionKey, askNolieEnabled: boolean): QuickActionResolution {
  switch (key) {
    case 'recordIncome':
      return { sheet: { initialKind: 'income_received' } };
    case 'recordSpending':
      return { sheet: { initialKind: 'expense' } };
    case 'addBill':
      return { sheet: { initialKind: 'bill' } };
    case 'addAccount':
      return { sheet: { onlyBalances: true } };
    case 'centerAction':
      return askNolieEnabled ? { sheet: null } : { sheet: {} };
    case 'moveMoney':
      return { sheet: { initialKind: 'transfer' } };
    case 'addDebt':
      return { sheet: { initialKind: 'liability' } };
    case 'addAsset':
      return { sheet: { initialKind: 'investment' } };
    case 'addGoal':
      return { sheet: { initialKind: 'goal' } };
  }
}
