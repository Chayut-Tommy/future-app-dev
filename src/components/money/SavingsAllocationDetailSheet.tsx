import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { computeSafeToSpend } from '../../lib/calculations/safeToSpend';
import { resolveSavingsAllocationMonthly } from '../../lib/calculations/savingsAllocation';
import { PayFrequency } from '../../types/models';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

const FREQUENCY_LABEL: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  irregular: 'Irregular',
};

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
      <Text style={{ ...typography.caption, fontSize: 13, color: colors.textSecondary, flex: 1, marginRight: spacing.sm }}>{label}</Text>
      <Text style={{ ...typography.body, fontSize: 13, color: colors.textPrimary, fontWeight: '600', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/**
 * Shared detail/edit entry point for every Savings Allocation row in What
 * Happens Next (PRD ask: "one shared detail/edit flow for all Savings
 * Allocation timeline rows" — a timeline occurrence is not an
 * independently editable transaction, it's a display of the one
 * user-level savingsAllocation setting on a given cycle date). The
 * occurrence only supplies contextual display info (its date); every
 * number shown here is recomputed live from the current shared setting,
 * and Edit/Turn off both write to that single setting, never to a
 * per-occurrence record.
 */
export function SavingsAllocationDetailSheet({
  visible,
  onClose,
  occurrenceDate,
  onEditAllocation,
}: {
  visible: boolean;
  onClose: () => void;
  /** The tapped occurrence's date — contextual display only. */
  occurrenceDate: Date | null;
  /** Hand off to the shared allocation editor after this sheet has asked
   * to close, mirroring the existing bill→mortgage handoff pattern rather
   * than opening a second Modal in the same tick. */
  onEditAllocation: () => void;
}) {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [confirmingTurnOff, setConfirmingTurnOff] = useState(false);

  const setting = data.user.savingsAllocation;
  const monthlyAmount = resolveSavingsAllocationMonthly(data.user);
  const safeToSpend = useMemo(() => computeSafeToSpend(data), [data]);
  const cycleAmount = safeToSpend.cycleSavingsReserved;

  const selectedByYouText =
    setting?.mode === 'percent'
      ? `${Math.round((setting.percent ?? 0) * 100)}% of expected recurring income`
      : setting?.mode === 'fixed'
        ? `Fixed monthly amount: ${formatMoney(setting.amount ?? 0)}`
        : 'Not set';

  function handleClose() {
    setConfirmingTurnOff(false);
    onClose();
  }

  function handleEdit() {
    setConfirmingTurnOff(false);
    onClose();
    onEditAllocation();
  }

  function handleTurnOff() {
    updateUser({ savingsAllocation: { mode: 'off' } });
    setConfirmingTurnOff(false);
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        intro: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
        detailBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        footerNote: { ...typography.caption, fontSize: 11, color: colors.textMuted, lineHeight: 15, marginBottom: spacing.md },
        actionButton: { marginBottom: spacing.sm },
        confirmTitle: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.xs },
        confirmCopy: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.lg },
      }),
    [colors, radius, spacing, typography]
  );

  if (confirmingTurnOff) {
    return (
      <KeyboardSheet
        visible={visible}
        onClose={handleClose}
        title="Turn off Savings Allocation?"
        footer={
          <>
            <Button label="Keep allocation" variant="secondary" onPress={() => setConfirmingTurnOff(false)} style={{ flex: 1 }} />
            <Button label="Turn off" onPress={handleTurnOff} style={{ flex: 1 }} />
          </>
        }
      >
        <Text style={styles.confirmCopy}>
          This will remove the allocation from Navilo's future estimates. It will not change your balances or transaction history.
        </Text>
      </KeyboardSheet>
    );
  }

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleClose}
      title="Savings allocation"
      footer={<Button label="Close" variant="secondary" onPress={handleClose} style={{ flex: 1 }} />}
    >
      <Text style={styles.intro}>You selected this optional allocation for Navilo's estimates. It does not move money or create a transaction.</Text>
      <View style={styles.detailBox}>
        <DetailRow label="Selected by you" value={selectedByYouText} />
        <DetailRow label="Estimated monthly amount" value={formatMoney(monthlyAmount)} />
        <DetailRow label="This pay cycle" value={formatMoney(cycleAmount)} />
        <DetailRow label="Primary pay frequency" value={FREQUENCY_LABEL[data.user.payFrequency]} />
        {occurrenceDate ? (
          <DetailRow label="Occurrence date" value={occurrenceDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} />
        ) : null}
      </View>
      <Text style={styles.footerNote}>This is an estimated allocation, not a recorded transfer.</Text>
      <Button label="Edit allocation" onPress={handleEdit} style={styles.actionButton} />
      <Button label="Turn off allocation" variant="secondary" onPress={() => setConfirmingTurnOff(true)} style={styles.actionButton} />
    </KeyboardSheet>
  );
}
