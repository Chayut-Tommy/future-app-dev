import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { SavingsAllocationSetting } from '../../types/models';
import { SavingsAllocationPickerBody, isValidSetting } from './SavingsAllocationPickerBody';

/**
 * "Savings allocation" editor — a fully optional, user-controlled setting
 * (PRD ask: Navilo must never decide how much of a user's income is
 * reserved for savings). Off by default; the user explicitly opts into a
 * percentage of recurring income or a fixed monthly amount, or leaves it
 * off entirely. This is the one place the setting changes outside the
 * first-income prompt, which then ripples into Available Until Payday,
 * Money Allocation, and Your Future — all read the same
 * resolveSavingsAllocationMonthly output, so they can never contradict
 * each other. Renders the shared SavingsAllocationPickerBody rather than
 * its own picker implementation — see that file's doc comment.
 */
export function EditSavingsAllocationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateUser } = useAppState();
  const { colors, spacing, typography, semantic } = useTheme();
  const hasRecurringIncome = data.user.monthlyIncome > 0;

  const [draft, setDraft] = useState<SavingsAllocationSetting>(() => data.user.savingsAllocation ?? { mode: 'off' });

  useEffect(() => {
    if (!visible) return;
    setDraft(data.user.savingsAllocation ?? { mode: 'off' });
  }, [visible, data.user.savingsAllocation]);

  const canSave = isValidSetting(draft, hasRecurringIncome);

  function handleSave() {
    if (!canSave) return;
    updateUser({ savingsAllocation: draft });
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        intro: { ...typography.caption, fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
        /* Wave 7 correction D — Save is an INTERACTIVE action, not a
           completed positive outcome. `Button`'s own `primary` variant uses
           `colors.accent`, which is green in every theme; on a Wealth form
           that made "Save" look like a confirmation that had already
           happened. Scoped to this one control — the global Button
           primitive and every other screen are untouched. Green stays
           reserved for money genuinely received. */
        saveAction: { backgroundColor: semantic.interactive },
        footerButton: { flex: 1 },
      }),
    [colors, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title="Savings allocation"
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={{ ...styles.footerButton, ...styles.saveAction }} />
        </>
      }
    >
      <Text style={styles.intro}>This optional setting is used only in Nolie's estimates and can be changed at any time.</Text>
      {visible ? (
        <SavingsAllocationPickerBody value={draft} onChange={setDraft} hasRecurringIncome={hasRecurringIncome} monthlyIncome={data.user.monthlyIncome} />
      ) : null}
    </KeyboardSheet>
  );
}
