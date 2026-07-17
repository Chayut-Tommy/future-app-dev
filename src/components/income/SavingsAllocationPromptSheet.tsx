import React, { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { SavingsAllocationSetting } from '../../types/models';
import { SavingsAllocationPickerBody, isValidSetting } from '../wealth/SavingsAllocationPickerBody';

/**
 * The one-time "Plan around your income?" prompt (PRD ask: ask about
 * Savings Allocation at the moment a user is naturally thinking about
 * income, not buried inside another screen). Rendered exclusively by
 * `SavingsAllocationPromptContext`'s stable coordinator — never mounted
 * directly by a screen — so its own lifetime is never at risk from
 * whatever triggered it. Shares the same picker body, copy conventions,
 * and validation as `EditSavingsAllocationModal`; differs only in title,
 * intro copy, and footer actions.
 *
 * `onDone` fires from every dismissal route — Save, "Not now", swipe,
 * backdrop, and Android back all funnel through this single KeyboardSheet
 * `onClose` — and is the one place `savingsAllocationPromptHandled` gets
 * persisted, deliberately only once the sheet has actually been shown to
 * the user and they've genuinely dismissed it, never merely when the
 * request was queued (PRD ask).
 */
export function SavingsAllocationPromptSheet({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const { data, updateUser } = useAppState();
  const { colors, spacing, typography } = useTheme();
  const hasRecurringIncome = data.user.monthlyIncome > 0;

  const [draft, setDraft] = useState<SavingsAllocationSetting>({ mode: 'off' });

  const canSave = isValidSetting(draft, hasRecurringIncome);

  function markHandledAndClose() {
    updateUser({ savingsAllocationPromptHandled: true });
    onDone();
  }

  function handleSave() {
    if (!canSave) return;
    updateUser({ savingsAllocation: draft, savingsAllocationPromptHandled: true });
    onDone();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        intro: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
        footerButton: { flex: 1 },
      }),
    [colors, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={markHandledAndClose}
      title="Plan around your income?"
      footer={
        <>
          <Button label="Not now" variant="secondary" onPress={markHandledAndClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      <Text style={styles.intro}>
        You can optionally include a savings allocation in Navilo's estimates. This does not move money or create a transaction.
      </Text>
      <SavingsAllocationPickerBody value={draft} onChange={setDraft} hasRecurringIncome={hasRecurringIncome} monthlyIncome={data.user.monthlyIncome} />
    </KeyboardSheet>
  );
}
