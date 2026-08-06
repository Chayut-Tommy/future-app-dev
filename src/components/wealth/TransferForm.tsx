import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState, TransferTarget } from '../../state/AppStateContext';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';

function targetsEqual(a: TransferTarget | null, b: TransferTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'asset' && b.kind === 'asset') return a.assetId === b.assetId;
  if (a.kind === 'liability' && b.kind === 'liability') return a.liabilityId === b.liabilityId;
  return false;
}

/** Why a close was requested — lets the owner (standalone TransferModal or
 * the embedded Add Anything host) decide what "closing" means (dismiss a
 * Modal vs. return to a chooser) without this form needing to know which
 * context it's rendered in. */
export type TransferCloseReason = 'cancel' | 'back' | 'backdrop' | 'swipe' | 'androidBack';

export interface TransferFormHandle {
  /** Invoked by the owner's Save/Transfer control. Runs this form's own
   * validation and persistence (transferFunds), calling onSaveSuccess only
   * once, only on success. Guarded against rapid repeated taps. */
  requestSave: () => void;
  /** Invoked by the owner's Cancel control or (when embedded) an internal
   * Back control. When embedded and the form has genuine changes, applies
   * Navilo's existing "Discard changes?"-pattern confirmation before
   * threading `reason` through to onConfirmedClose; otherwise proceeds
   * immediately. Standalone (non-embedded) callers are unaffected — see
   * the `embedded` prop below. */
  requestClose: (reason: TransferCloseReason) => void;
}

export interface TransferFormProps {
  /** True only when rendered inside the embedded Add Anything -> Transfer
   * route (Stream D correction pass) — activates real dirty-detection and
   * the "Discard transfer?" confirmation on Cancel/Back/backdrop/swipe/
   * Android Back. Omitted (the default) preserves TransferModal's
   * original, unconditional-close standalone behaviour exactly, so
   * standalone Wealth -> Transfer UX is never silently changed by this
   * correction. */
  embedded?: boolean;
  /** Live dirty-state report, for an owner that wants to gate its own
   * dismissal (e.g. KeyboardSheet's own isDirty prop) on it. Always false
   * unless `embedded` is true. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Live validity report, so the owner's host-rendered Save/Transfer
   * button can be enabled/disabled correctly. */
  onCanSaveChange: (canSave: boolean) => void;
  onSaveSuccess: () => void;
  onConfirmedClose: (reason: TransferCloseReason) => void;
}

/**
 * Extracted Transfer field state, validation, and persistence (Stream D,
 * persistent-host proof-of-pattern) — the one source of truth used both by
 * the standalone TransferModal (wrapping this in KeyboardSheet, unchanged
 * public behaviour for WealthScreen) and by the embedded Add Anything →
 * Transfer route, so neither duplicates transferFunds, validation, eligible-
 * account filtering, or exact-cent handling. This component owns no Modal,
 * backdrop, keyboard-avoidance, scrolling, or footer — those stay owned by
 * whichever KeyboardSheet-based container renders it.
 */
export const TransferForm = forwardRef<TransferFormHandle, TransferFormProps>(function TransferForm(
  { embedded = false, onDirtyChange, onCanSaveChange, onSaveSuccess, onConfirmedClose },
  ref
) {
  const { data, transferFunds } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();

  const cashAssets = data.assets.filter((a) => a.type === 'cash' || a.type === 'savings');
  const nonCashAssets = data.assets.filter((a) => a.type !== 'cash' && a.type !== 'savings');

  const [fromId, setFromId] = useState<string | null>(cashAssets[0]?.id ?? null);
  const [toTarget, setToTarget] = useState<TransferTarget | null>(null);
  const [amount, setAmount] = useState('');
  // Snapshot of the values this form actually opened with (fromId defaults
  // to the first cash asset; toTarget/amount start unset) — captured once,
  // at mount, since this component always mounts fresh per open (Stream D
  // Round 3's established mount-driven-reset convention). Compared against
  // current values below to detect genuine user changes; embedded-mode
  // only (see `embedded` prop) — standalone TransferModal never reads
  // isDirty.
  const initialSnapshot = useRef({ fromId: cashAssets[0]?.id ?? null, toTarget: null as TransferTarget | null, amount: '' });
  // Synchronous double-submission guard — same established pattern as
  // AddWealthItemModal's submittingRef / AddGoalModal's savingRef.
  // TransferModal itself had no such guard before this extraction; added
  // here because the embedded-host control contract requires "rapid Save
  // taps cannot submit twice" as an explicit property, and every standalone
  // TransferModal caller benefits from the same protection at zero
  // behavioural cost (transferFunds' own semantics are unchanged).
  const submittingRef = useRef(false);

  const amountValue = parseFloat(amount);
  const canSave = !!fromId && !!toTarget && !isNaN(amountValue) && amountValue > 0;

  useEffect(() => {
    onCanSaveChange(canSave);
  }, [canSave, onCanSaveChange]);

  // Genuine-change detection, relative to the values this form opened with
  // (initialSnapshot above) — embedded mode only. Standalone TransferModal
  // never passes `embedded`, so `isDirty` is always false there, and
  // confirmDiscardIfDirty(false, ...) below always proceeds immediately —
  // faithfully preserving TransferModal's original unconditional-close
  // Cancel behaviour without a separate code path.
  const isDirty =
    embedded &&
    (fromId !== initialSnapshot.current.fromId ||
      !targetsEqual(toTarget, initialSnapshot.current.toTarget) ||
      amount !== initialSnapshot.current.amount);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function handleSave() {
    if (!canSave || !fromId || !toTarget) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    transferFunds(fromId, toTarget, amountValue);
    // Successful Save never goes through requestClose/confirmDiscardIfDirty
    // — it must never produce a discard prompt.
    onSaveSuccess();
  }

  // Cancel (footer button) and internal Back (embedded only) both funnel
  // through here. Uses the SAME confirmDiscardIfDirty utility every other
  // Navilo form already uses (declining leaves this component mounted with
  // all state intact — nothing is cleared unless the user confirms).
  function handleRequestClose(reason: TransferCloseReason) {
    confirmDiscardIfDirty(isDirty, () => onConfirmedClose(reason), 'Discard transfer?', 'Your transfer details will be lost.');
  }

  useImperativeHandle(ref, () => ({
    requestSave: handleSave,
    requestClose: handleRequestClose,
  }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        chipActive: { backgroundColor: colors.accentSoft },
        chipText: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        chipTextActive: { color: colors.accentStrong, fontWeight: '600' },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 20,
          fontWeight: '700',
          color: colors.textPrimary,
        },
        empty: { ...typography.caption, fontSize: 12, color: colors.textMuted },
      }),
    [colors, radius, spacing, typography]
  );

  const isSameTarget = (t: TransferTarget) =>
    (toTarget?.kind === 'asset' && t.kind === 'asset' && toTarget.assetId === t.assetId) ||
    (toTarget?.kind === 'liability' && t.kind === 'liability' && toTarget.liabilityId === t.liabilityId);

  return (
    <>
      <Text style={styles.label}>From</Text>
      {cashAssets.length === 0 ? (
        <Text style={styles.empty}>Add a cash or savings asset first to transfer from it.</Text>
      ) : (
        <View style={styles.chipRow}>
          {cashAssets.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.chip, fromId === a.id ? styles.chipActive : null]}
              onPress={() => setFromId(a.id)}
            >
              <Text style={[styles.chipText, fromId === a.id ? styles.chipTextActive : null]}>
                {a.label} (${a.currentValue.toLocaleString()})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>To</Text>
      <View style={styles.chipRow}>
        {nonCashAssets.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.chip, isSameTarget({ kind: 'asset', assetId: a.id }) ? styles.chipActive : null]}
            onPress={() => setToTarget({ kind: 'asset', assetId: a.id })}
          >
            <Text style={[styles.chipText, isSameTarget({ kind: 'asset', assetId: a.id }) ? styles.chipTextActive : null]}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
        {data.liabilities.map((l) => (
          <TouchableOpacity
            key={l.id}
            style={[styles.chip, isSameTarget({ kind: 'liability', liabilityId: l.id }) ? styles.chipActive : null]}
            onPress={() => setToTarget({ kind: 'liability', liabilityId: l.id })}
          >
            <Text
              style={[styles.chipText, isSameTarget({ kind: 'liability', liabilityId: l.id }) ? styles.chipTextActive : null]}
            >
              Pay down {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {nonCashAssets.length === 0 && data.liabilities.length === 0 ? (
        <Text style={styles.empty}>Add an investment or a liability first to transfer to it.</Text>
      ) : null}

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
    </>
  );
});
