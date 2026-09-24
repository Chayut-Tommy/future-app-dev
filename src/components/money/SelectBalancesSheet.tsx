import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { Ionicons } from '@expo/vector-icons';
import { confirmSaveOrDiscardIfDirty } from '../../lib/discardConfirmation';
import { resolveIncludeInMoneyCalculations } from '../../lib/calculations/liquidAssets';
import { formatCentsCentsAware } from '../../lib/calculations/money';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import { fontFamilyForWeight } from '../../theme/typography';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

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
  onDismissed,
}: {
  visible: boolean;
  onClose: () => void;
  /** Pass D.5 — fired ONCE after the sheet's dismissal has actually completed, so the
   * opener can return assistive focus to the control that invoked it. */
  onDismissed?: () => void;
  /** Hand off to the scoped, balance-only Add Anything chooser (requirement
   * 5) — reuses the same chooser the global + button opens, just filtered,
   * never a separate implementation. Called after this sheet's own draft
   * has been committed (see handleAddBalance) and asked to close. */
  onAddBalance: () => void;
}) {
  const { data, updateAssetsIncludeInMoney } = useAppState();
  const { colors, radius, spacing, semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

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


  // RN calls the native Modal's onDismiss on iOS only; on every other platform the
  // hide IS the completion. The opener's focus-return callback is idempotent, so this
  // can never move focus twice. No timer is involved.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      return;
    }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    if (Platform.OS !== 'ios') onDismissed?.();
  }, [visible, onDismissed]);

  const isDirty = useMemo(() => {
    for (const [id, included] of draftIncluded) {
      if (savedIncluded.get(id) !== included) return true;
    }
    return false;
  }, [draftIncluded, savedIncluded]);

  // The DRAFT's own total — the same balances listed above, summed in cents so the
  // preview cannot drift from the figures on screen. It is a preview only: the
  // authoritative included total still comes from the engine once this is saved.
  const selectedTotalLabel = useMemo(() => {
    const cents = balances
      .filter((a) => draftIncluded.get(a.id) ?? resolveIncludeInMoneyCalculations(a))
      .reduce((sum, a) => sum + (Number.isFinite(a.currentValue) ? Math.round(a.currentValue * 100) : 0), 0);
    return formatCentsCentsAware(cents);
  }, [balances, draftIncluded]);

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

  /** Drops the draft without writing anything: the toggles return to the last saved
   * state, so `isDirty` is false and nothing is left to commit later. */
  function discardDraft() {
    setDraftIncluded(new Map(savedIncluded));
  }

  // Pass E — "+ Add a money balance" is a HANDOFF, not a dismissal. It used to call
  // commitDraft() unconditionally, which meant merely opening the child flow SILENTLY
  // committed an inclusion change the user had not confirmed — a write to a persisted,
  // shared setting that feeds Available until payday, Look Ahead and Today. It now asks,
  // through the same shared confirmation the rest of the app uses: Save and continue
  // (one commit, the existing authoritative path), Discard (explicit), or Keep editing
  // (stays here with the draft intact). A clean draft continues straight through with no
  // prompt, exactly as before.
  function handleAddBalance() {
    confirmSaveOrDiscardIfDirty(
      isDirty,
      {
        onSave: () => {
          commitDraft();
          onClose();
          onAddBalance();
        },
        onDiscard: () => {
          discardDraft();
          onClose();
          onAddBalance();
        },
      },
      'Save your balance selection?',
      'You’ve changed which balances your money estimates use. Save that before adding a balance, or discard it.'
    );
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Pass D0.1 — Design 5.1 roles (Figtree via the shared resolver). The legacy
        // `typography.*` tokens declare no font family, so this sheet's body text
        // rendered in the platform font beside a Figtree title and buttons.
        intro: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.md },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
          marginBottom: spacing.sm,
          minHeight: designLayout.touchTargetMin,
        },
        rowSelected: { backgroundColor: semantic.interactiveTint },
        iconTile: {
          width: 36,
          height: 36,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        },
        rowTextBlock: { flex: 1, marginRight: spacing.sm },
        rowLabel: { ...typeStyle('support', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600', color: colors.textPrimary },
        rowValue: { ...typeStyle('meta', locale), fontVariant: ['tabular-nums'], color: colors.textSecondary, marginTop: 2 },
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
        // The running total of the DRAFT selection, so the effect of a toggle is
        // visible before it is saved. Composed from the same balances listed above.
        totalRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing.md,
          marginTop: spacing.xs,
          paddingTop: spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        totalLabel: { ...typeStyle('support', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600', color: colors.textPrimary, flex: 1 },
        totalValue: { ...typeStyle('figureRow', locale), fontVariant: ['tabular-nums'], color: colors.textPrimary, flexShrink: 0 },
        scopeNote: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: designSpacing.xs },
        // Wave 6 Correction C — selection is an interactive state, not a
        // positive financial outcome, so it takes the Ocean Blue
        // interactive role. Green stays reserved for money genuinely
        // received. The checkmark below is the non-colour cue.
        toggleActive: { backgroundColor: semantic.interactiveTint, borderColor: semantic.interactive },
        toggleText: { ...typeStyle('meta', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600', color: colors.textSecondary },
        toggleTextActive: { color: semantic.interactive },
        emptyText: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.md },
        addText: { ...typeStyle('meta', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600', color: semantic.interactive },
        addButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: 2, minHeight: 44, justifyContent: 'center' },
        footerButton: { flex: 1 },
        savePrimary: { flex: 1, backgroundColor: semantic.interactive },
      }),
    [colors, radius, spacing, semantic, locale]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleCancel}
      onDismiss={onDismissed}
      isDirty={isDirty}
      title="Choose accounts"
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={handleCancel} style={styles.footerButton} />
          {/* Wave 6 closure — choosing which balances feed an estimate is
              a neutral configuration action, not a positive financial
              outcome, so Save takes the theme's interactive primary rather
              than the legacy accent green. Scoped to THIS
              control: Button's own `primary` variant is untouched, so no
              other primary action in the app changes. Green stays reserved
              for money genuinely received. */}
          <Button label="Save" onPress={handleSave} style={styles.savePrimary} />
        </>
      }
    >
      {/* Pass D.5 — `includeInMoneyCalculations` is a PERSISTED per-account setting:
          it feeds Available until payday, Look Ahead and Today, and it survives a
          restart. The copy therefore never claims this changes one estimate only. */}
      <Text style={styles.intro} testID="select-balances-intro">
        Choose the Cash, Savings or Everyday Account balances used in your money estimates. This applies everywhere Nolie estimates your
        money and stays this way until you change it. Your account balances and Wealth total never change.
      </Text>
      {balances.length === 0 ? (
        <Text style={styles.emptyText}>You don't have any Cash, Savings or Everyday Account balances recorded yet.</Text>
      ) : (
        balances.map((asset) => {
          const included = draftIncluded.get(asset.id) ?? resolveIncludeInMoneyCalculations(asset);
          return (
            // The WHOLE row toggles, so the target is the row rather than a small pill.
            <TouchableOpacity
              key={asset.id}
              style={[styles.row, included ? styles.rowSelected : null]}
              onPress={() => toggleIncluded(asset.id)}
              accessibilityRole="checkbox"
              accessibilityLabel={`${asset.label}, ${formatMoney(asset.currentValue)}`}
              accessibilityState={{ checked: included }}
              testID={`select-balances-row-${asset.id}`}
            >
              <View style={styles.iconTile} importantForAccessibility="no-hide-descendants">
                <Ionicons name="wallet-outline" size={17} color={semantic.interactive} />
              </View>
              <View style={styles.rowTextBlock} importantForAccessibility="no-hide-descendants">
                <Text style={styles.rowLabel}>{asset.label}</Text>
                <Text style={styles.rowValue}>{formatMoney(asset.currentValue)}</Text>
              </View>
              {/* Selection is a shape as well as a colour: a filled check, or an
                  empty ring. Never colour alone. */}
              <Ionicons
                name={included ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={included ? semantic.interactive : colors.borderStrong}
                importantForAccessibility="no"
                testID={`select-balances-mark-${asset.id}`}
              />
            </TouchableOpacity>
          );
        })
      )}
      {balances.length > 0 ? (
        <View style={styles.totalRow} accessible accessibilityLabel={`Selected balance: ${selectedTotalLabel}`} testID="select-balances-total">
          <Text style={styles.totalLabel} importantForAccessibility="no">Selected balance</Text>
          <Text style={styles.totalValue} importantForAccessibility="no">{selectedTotalLabel}</Text>
        </View>
      ) : null}
      <TouchableOpacity style={styles.addButton} onPress={handleAddBalance} accessibilityRole="button" accessibilityLabel="Add a money balance">
        <Text style={styles.addText}>+ Add a money balance</Text>
      </TouchableOpacity>
    </KeyboardSheet>
  );
}
