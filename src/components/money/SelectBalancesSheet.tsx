import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { resolveIncludeInMoneyCalculations } from '../../lib/calculations/liquidAssets';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * The actual "select balances" flow for Available Money's empty state
 * (PRD ask, §Empty-state correction) and, since the correction round of
 * 2026-08-10, the primary "Manage balances" entry point reachable directly
 * from the Available Until Payday card in every one of its states. Lists
 * every Cash/Savings/Everyday Account asset with its current included/
 * excluded state.
 *
 * Correction round, 2026-08-10 — inclusion toggles are now a local DRAFT,
 * not an immediate per-tap write. The previous version called `updateAsset`
 * directly inside the toggle handler, which meant there was never an
 * "unconfirmed" state for Cancel/Back to discard — every tap was already
 * final the instant it landed. That directly conflicted with the explicit
 * requirement that Cancel/Back must discard unconfirmed selection changes.
 * Save now commits the whole draft in one pass (one `updateAsset` call per
 * CHANGED asset — inclusion is a per-asset boolean field, not a joint
 * financial transition, so there is no atomicity requirement across
 * multiple assets the way there is for a transaction+balance-effect pair
 * elsewhere in this app); Cancel/Back/swipe-dismiss/backdrop-tap all
 * discard the draft via the same shared `isDirty`-driven confirmation
 * KeyboardSheet already provides everywhere else, never a new mechanism.
 */
export function SelectBalancesSheet({
  visible,
  onClose,
  onAddBalance,
}: {
  visible: boolean;
  onClose: () => void;
  /** Hand off to the scoped, balance-only Add Anything chooser (requirement
   * 5) — reuses the same chooser the global + button opens, just filtered,
   * never a separate implementation. Called after this sheet's own draft
   * has been committed (see handleAddBalance) and asked to close. */
  onAddBalance: () => void;
}) {
  const { data, updateAssetsIncludeInMoney } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();

  const balances = data.assets.filter((a) => a.type === 'cash' || a.type === 'savings' || a.type === 'everyday');

  // The persisted state at the moment this sheet opened, and the working
  // draft the user is editing — kept as two separate maps (assetId ->
  // included) so `isDirty` and "which assets actually changed" can both be
  // derived by comparison, never by re-deriving from `data.assets` (which
  // would be affected by the very writes Save is about to make).
  const [savedIncluded, setSavedIncluded] = useState<Map<string, boolean>>(new Map());
  const [draftIncluded, setDraftIncluded] = useState<Map<string, boolean>>(new Map());

  // Re-seeds from the real, current data every time the sheet opens — this
  // is also what naturally picks up a balance just created via the
  // "+ Add a money balance" round-trip (this sheet closes, the scoped
  // chooser opens, then this sheet re-opens with `visible` going
  // false->true again), with no special-case wiring needed.
  useEffect(() => {
    if (!visible) return;
    const seeded = new Map(data.assets.filter((a) => a.type === 'cash' || a.type === 'savings' || a.type === 'everyday').map((a) => [a.id, resolveIncludeInMoneyCalculations(a)]));
    setSavedIncluded(seeded);
    setDraftIncluded(seeded);
    // Intentionally re-seeds only on visibility change, not on every
    // `data.assets` change — otherwise an unrelated background data update
    // while this sheet happens to be open (unlikely, but not impossible)
    // could silently overwrite an in-progress, unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDirty = useMemo(() => {
    for (const [id, included] of draftIncluded) {
      if (savedIncluded.get(id) !== included) return true;
    }
    return false;
  }, [draftIncluded, savedIncluded]);

  function toggleIncluded(assetId: string) {
    setDraftIncluded((prev) => {
      const next = new Map(prev);
      next.set(assetId, !(prev.get(assetId) ?? false));
      return next;
    });
  }

  // Commits exactly the assets whose draft value actually differs from
  // what was last saved — an unchanged toggle never issues a write, so
  // opening this sheet and immediately tapping Save with no edits touches
  // nothing. Correction, 2026-08-10 review: this previously called
  // updateAsset() once per changed asset. updateAsset closes over the
  // React-state `data` from the render that started this loop (it is not
  // dataRef-based), so every call in the loop persisted from the SAME
  // pre-loop snapshot — only the LAST call's change actually survived, and
  // every earlier toggle in a multi-account Save was silently discarded.
  // updateAssetsIncludeInMoney applies every changed entry against one
  // dataRef.current snapshot in a single persist() call, so a Save that
  // both includes Account A and excludes Account B commits both.
  function commitDraft() {
    const changes: { id: string; included: boolean }[] = [];
    for (const [id, included] of draftIncluded) {
      if (savedIncluded.get(id) !== included) changes.push({ id, included });
    }
    if (changes.length > 0) {
      updateAssetsIncludeInMoney(changes);
      setSavedIncluded(new Map(draftIncluded));
    }
  }

  function handleSave() {
    commitDraft();
    onClose();
  }

  // Cancel/Back/swipe/backdrop — all funnel here (via KeyboardSheet's own
  // onClose + isDirty-guarded discard confirmation). The draft is simply
  // dropped: nothing was ever written to `data.assets` for an unconfirmed
  // toggle, so there is nothing to revert.
  function handleCancel() {
    onClose();
  }

  // Saves first so a mid-edit "+ Add a money balance" tap never silently
  // discards toggles the user already made in this same session.
  function handleAddBalance() {
    commitDraft();
    onClose();
    onAddBalance();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        intro: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
          marginBottom: spacing.sm,
        },
        rowTextBlock: { flex: 1, marginRight: spacing.sm },
        rowLabel: { ...typography.body, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
        rowValue: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
        toggle: {
          paddingHorizontal: spacing.md,
          paddingVertical: 7,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
        },
        toggleActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        toggleText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        toggleTextActive: { color: colors.accentStrong },
        emptyText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
        addButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: 2, minHeight: 44, justifyContent: 'center' },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleCancel}
      isDirty={isDirty}
      title="Select balances"
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={handleCancel} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} style={styles.footerButton} />
        </>
      }
    >
      <Text style={styles.intro}>
        Choose which Cash, Savings or Everyday Account balances Nolie includes when estimating your available money. Excluding a
        balance here never changes or deletes it — it stays exactly as recorded in Wealth, and only stops counting toward this specific
        estimate.
      </Text>
      {balances.length === 0 ? (
        <Text style={styles.emptyText}>You don't have any Cash, Savings or Everyday Account balances recorded yet.</Text>
      ) : (
        balances.map((asset) => {
          const included = draftIncluded.get(asset.id) ?? resolveIncludeInMoneyCalculations(asset);
          return (
            <View key={asset.id} style={styles.row}>
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowLabel}>{asset.label}</Text>
                <Text style={styles.rowValue}>{formatMoney(asset.currentValue)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, included ? styles.toggleActive : null]}
                onPress={() => toggleIncluded(asset.id)}
                accessibilityRole="button"
                accessibilityLabel={`${asset.label}, ${formatMoney(asset.currentValue)}, ${included ? 'included' : 'excluded'}`}
                accessibilityState={{ selected: included }}
              >
                <Text style={[styles.toggleText, included ? styles.toggleTextActive : null]}>{included ? 'Included' : 'Excluded'}</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
      <TouchableOpacity style={styles.addButton} onPress={handleAddBalance} accessibilityRole="button" accessibilityLabel="Add a money balance">
        <Text style={[styles.toggleText, { color: colors.accent, fontSize: 13 }]}>+ Add a money balance</Text>
      </TouchableOpacity>
    </KeyboardSheet>
  );
}
