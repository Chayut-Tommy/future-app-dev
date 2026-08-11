import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState, TransferTarget } from '../../state/AppStateContext';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { useCurrentLocalDate } from '../../hooks/useCurrentLocalDate';
import {
  listEligibleLiquidBalances,
  listEligibleLiquidDestinations,
  listEligibleDebtDestinations,
  disambiguateBalanceLabels,
} from '../../lib/calculations/moveMoneyEligibility';
import { listBnplHandoffStates } from '../../lib/calculations/bnplHandoff';
import { AddWealthItemModal } from './AddWealthItemModal';
import { Liability } from '../../types/models';

function targetsEqual(a: TransferTarget | null, b: TransferTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'asset' && b.kind === 'asset') return a.assetId === b.assetId;
  if (a.kind === 'liability' && b.kind === 'liability') return a.liabilityId === b.liabilityId;
  return false;
}

function formatCentsAmount(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Neutral, factual wording for every TransferFundsResult rejection reason —
 * never exposes which technical validation failed for `invalid_recorded_balance`
 * (side is internal diagnostic detail only). */
function rejectionMessage(reason: string): string {
  switch (reason) {
    case 'insufficient_source':
      return "This balance doesn't have enough recorded money. Choose a smaller amount or another balance.";
    case 'exceeds_liability_balance':
      return 'Enter an amount no more than the recorded balance owing.';
    case 'same_balance':
      return 'Choose a different balance to transfer to.';
    case 'invalid_recorded_balance':
      return "Navilo can't complete this right now — one of the balances involved needs to be corrected first.";
    default:
      return "We couldn't complete this transfer. Please check your selections and try again.";
  }
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
 *
 * Correction round, 2026-08-10 (Move Money architecture correction) —
 * eligibility is now the ONE shared allowlist in `moveMoneyEligibility.ts`,
 * reused unmodified by `transferFundsTransition` itself, so the UI can never
 * offer a destination the engine would reject on eligibility grounds alone.
 * Save results are now the typed `TransferFundsResult` — a rejection keeps
 * this form open with an inline, neutral error message rather than silently
 * doing nothing. A dedicated "BNPL repayments" group presents active BNPL
 * plans as a contextual handoff to the real, unmodified
 * `confirmBnplRepayment` transition — BNPL itself never becomes a generic
 * "To" destination.
 */
export const TransferForm = forwardRef<TransferFormHandle, TransferFormProps>(function TransferForm(
  { embedded = false, onDirtyChange, onCanSaveChange, onSaveSuccess, onConfirmedClose },
  ref
) {
  const { data, transferFunds, confirmBnplRepayment } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const today = useCurrentLocalDate();

  const sourceAssets = useMemo(() => listEligibleLiquidBalances(data.assets), [data.assets]);

  const [fromId, setFromId] = useState<string | null>(sourceAssets[0]?.id ?? null);
  const [toTarget, setToTarget] = useState<TransferTarget | null>(null);
  const [amount, setAmount] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [manageLiabilityId, setManageLiabilityId] = useState<string | null>(null);

  const destinationAssets = useMemo(() => listEligibleLiquidDestinations(data.assets, fromId), [data.assets, fromId]);
  const transferableLiabilities = useMemo(() => listEligibleDebtDestinations(data.liabilities), [data.liabilities]);
  // One disambiguation pass over every eligible liquid balance (not just the
  // ones currently shown as "To") — a stable set, so the same account gets
  // the same disambiguated label whether it's rendered as a source or a
  // destination chip.
  const balanceLabels = useMemo(() => disambiguateBalanceLabels(sourceAssets), [sourceAssets]);

  const bnplPlans = useMemo(() => listBnplHandoffStates(data, today), [data, today]);
  const manageLiability: Liability | null = manageLiabilityId ? data.liabilities.find((l) => l.id === manageLiabilityId) ?? null : null;

  // Snapshot of the values this form actually opened with (fromId defaults
  // to the first eligible liquid asset; toTarget/amount start unset) —
  // captured once, at mount, since this component always mounts fresh per
  // open (Stream D Round 3's established mount-driven-reset convention).
  // Compared against current values below to detect genuine user changes;
  // embedded-mode only (see `embedded` prop) — standalone TransferModal
  // never reads isDirty.
  const initialSnapshot = useRef({ fromId: sourceAssets[0]?.id ?? null, toTarget: null as TransferTarget | null, amount: '' });
  // Synchronous double-submission guard — same established pattern as
  // AddWealthItemModal's submittingRef / AddGoalModal's savingRef.
  const submittingRef = useRef(false);

  const amountValue = parseFloat(amount);
  const fromAsset = fromId ? data.assets.find((a) => a.id === fromId) ?? null : null;
  const sourceHasEnough = !!fromAsset && !isNaN(amountValue) && Math.round(amountValue * 100) <= Math.round(fromAsset.currentValue * 100);
  const destinationLiability = toTarget?.kind === 'liability' ? data.liabilities.find((l) => l.id === toTarget.liabilityId) ?? null : null;
  const withinLiabilityBalance =
    !destinationLiability || (!isNaN(amountValue) && Math.round(amountValue * 100) <= Math.round(destinationLiability.currentBalance * 100));
  const canSave = !!fromId && !!toTarget && !isNaN(amountValue) && amountValue > 0 && sourceHasEnough && withinLiabilityBalance;

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
    const result = transferFunds(fromId, toTarget, amountValue);
    if (result.applied) {
      // Successful Save never goes through requestClose/confirmDiscardIfDirty
      // — it must never produce a discard prompt.
      onSaveSuccess();
      return;
    }
    // Rejected — engine-level safety boundary caught something canSave's
    // own UX-convenience checks didn't (e.g. a concurrent change to the
    // same balance since this form last read `data`). Stays open, inline
    // error, retryable.
    submittingRef.current = false;
    setSaveError(rejectionMessage(result.reason));
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
        errorText: { ...typography.caption, fontSize: 12, color: colors.warning, lineHeight: 16, marginTop: spacing.sm },
        bnplSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        bnplRow: { marginBottom: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md },
        bnplTitle: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '600', marginBottom: 2 },
        bnplSub: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
        bnplButton: {
          alignSelf: 'flex-start',
          borderRadius: radius.pill,
          paddingVertical: 7,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.accent,
        },
        bnplButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        bnplButtonText: { ...typography.caption, fontSize: 12, color: colors.onAccent, fontWeight: '700' },
        bnplButtonTextSecondary: { color: colors.textSecondary },
      }),
    [colors, radius, spacing, typography]
  );

  const isSameTarget = (t: TransferTarget) =>
    (toTarget?.kind === 'asset' && t.kind === 'asset' && toTarget.assetId === t.assetId) ||
    (toTarget?.kind === 'liability' && t.kind === 'liability' && toTarget.liabilityId === t.liabilityId);

  // BNPL source behaviour (correction round, 2026-08-10) — Move Money must
  // honour whichever balance is already selected as "From" above, never
  // silently substitute or ask for a different one. `confirmBnplRepaymentTransition`
  // only supports 'cash' | 'everyday' | 'credit_card' as a payment source;
  // Savings is deliberately never added to that union merely because it's
  // an eligible generic Move Money source.
  const fromSupportsRepayment = fromAsset && (fromAsset.type === 'cash' || fromAsset.type === 'everyday');

  function confirmPlan(liabilityId: string, recurringItemId: string, expectedNextDueDate: string) {
    if (!fromAsset || !fromSupportsRepayment) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    const { transition } = confirmBnplRepayment({
      liabilityId,
      recurringItemId,
      expectedNextDueDate,
      paymentSource: fromAsset.type === 'everyday' ? 'everyday' : 'cash',
      targetAssetId: fromAsset.type === 'everyday' ? fromAsset.id : undefined,
    });
    submittingRef.current = false;
    if (transition.applied) {
      onSaveSuccess();
      return;
    }
    if (transition.reason !== 'stale' && transition.reason !== 'not_found' && transition.reason !== 'already_confirmed') {
      setSaveError("We couldn't record that repayment. Please check your BNPL plan's details and try again.");
    }
  }

  return (
    <>
      <Text style={styles.label}>From</Text>
      {sourceAssets.length === 0 ? (
        <Text style={styles.empty}>Add a Cash, Everyday or Savings balance first to transfer from it.</Text>
      ) : (
        <View style={styles.chipRow}>
          {sourceAssets.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.chip, fromId === a.id ? styles.chipActive : null]}
              onPress={() => setFromId(a.id)}
              accessibilityRole="button"
              accessibilityLabel={`${balanceLabels.get(a.id) ?? a.label}, $${a.currentValue.toLocaleString()}`}
            >
              <Text style={[styles.chipText, fromId === a.id ? styles.chipTextActive : null]}>
                {balanceLabels.get(a.id) ?? a.label} (${a.currentValue.toLocaleString()})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>To</Text>
      <View style={styles.chipRow}>
        {destinationAssets.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.chip, isSameTarget({ kind: 'asset', assetId: a.id }) ? styles.chipActive : null]}
            onPress={() => setToTarget({ kind: 'asset', assetId: a.id })}
            accessibilityRole="button"
            accessibilityLabel={balanceLabels.get(a.id) ?? a.label}
          >
            <Text style={[styles.chipText, isSameTarget({ kind: 'asset', assetId: a.id }) ? styles.chipTextActive : null]}>
              {balanceLabels.get(a.id) ?? a.label}
            </Text>
          </TouchableOpacity>
        ))}
        {transferableLiabilities.map((l) => (
          <TouchableOpacity
            key={l.id}
            style={[styles.chip, isSameTarget({ kind: 'liability', liabilityId: l.id }) ? styles.chipActive : null]}
            onPress={() => setToTarget({ kind: 'liability', liabilityId: l.id })}
            accessibilityRole="button"
            accessibilityLabel={`Pay down ${l.label}`}
          >
            <Text
              style={[styles.chipText, isSameTarget({ kind: 'liability', liabilityId: l.id }) ? styles.chipTextActive : null]}
            >
              Pay down {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {destinationAssets.length === 0 && transferableLiabilities.length === 0 ? (
        <Text style={styles.empty}>Add another balance or a liability first to transfer to it.</Text>
      ) : null}

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(next) => {
          setAmount(next);
          setSaveError(null);
        }}
      />
      {saveError ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {saveError}
        </Text>
      ) : null}

      {/* BNPL repayments — a visually separate group, never a generic "To"
          destination (correction round, 2026-08-10). Reuses the real,
          unmodified confirmBnplRepayment transition — no second repayment
          engine. */}
      {bnplPlans.length > 0 ? (
        <View style={styles.bnplSection}>
          <Text style={styles.label}>BNPL repayments</Text>
          {bnplPlans.map((plan) => {
            if (plan.kind === 'due_or_overdue') {
              return (
                <View key={plan.liability.id} style={styles.bnplRow}>
                  <Text style={styles.bnplTitle}>{plan.liability.label}</Text>
                  <Text style={styles.bnplSub}>
                    {plan.overdue ? 'Overdue' : 'Due today'} · {formatCentsAmount(plan.effectiveCents)}
                  </Text>
                  {fromAsset && fromSupportsRepayment ? (
                    <TouchableOpacity
                      style={styles.bnplButton}
                      onPress={() => confirmPlan(plan.liability.id, plan.item.id, plan.item.nextDueDate)}
                      accessibilityRole="button"
                      accessibilityLabel={`Confirm repayment for ${plan.liability.label}`}
                    >
                      <Text style={styles.bnplButtonText}>Confirm repayment from {balanceLabels.get(fromAsset.id) ?? fromAsset.label}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.bnplSub}>
                      {fromAsset
                        ? 'Choose Cash or an Everyday Account above to record this repayment.'
                        : 'Choose a Cash or Everyday Account balance above to record this repayment.'}
                    </Text>
                  )}
                </View>
              );
            }
            if (plan.kind === 'future') {
              return (
                <View key={plan.liability.id} style={styles.bnplRow}>
                  <Text style={styles.bnplTitle}>{plan.liability.label}</Text>
                  <Text style={styles.bnplSub}>
                    Next repayment {new Date(plan.item.nextDueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ·{' '}
                    {formatCentsAmount(plan.effectiveCents)}
                  </Text>
                  <TouchableOpacity
                    style={[styles.bnplButton, styles.bnplButtonSecondary]}
                    onPress={() => setManageLiabilityId(plan.liability.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Manage repayment details for ${plan.liability.label}`}
                  >
                    <Text style={[styles.bnplButtonText, styles.bnplButtonTextSecondary]}>Manage repayment details</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            if (plan.kind === 'balance_only') {
              return (
                <View key={plan.liability.id} style={styles.bnplRow}>
                  <Text style={styles.bnplTitle}>{plan.liability.label}</Text>
                  <TouchableOpacity
                    style={[styles.bnplButton, styles.bnplButtonSecondary]}
                    onPress={() => setManageLiabilityId(plan.liability.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set up repayment details for ${plan.liability.label}`}
                  >
                    <Text style={[styles.bnplButtonText, styles.bnplButtonTextSecondary]}>Set up repayment details</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            // 'ambiguous' | 'corrupted' — neutral, no confirmation.
            return (
              <View key={plan.liability.id} style={styles.bnplRow}>
                <Text style={styles.bnplTitle}>{plan.liability.label}</Text>
                <TouchableOpacity
                  style={[styles.bnplButton, styles.bnplButtonSecondary]}
                  onPress={() => setManageLiabilityId(plan.liability.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Check repayment details for ${plan.liability.label}`}
                >
                  <Text style={[styles.bnplButtonText, styles.bnplButtonTextSecondary]}>Check repayment details</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : null}

      <AddWealthItemModal visible={!!manageLiability} kind="liability" editLiability={manageLiability} onClose={() => setManageLiabilityId(null)} />
    </>
  );
});
