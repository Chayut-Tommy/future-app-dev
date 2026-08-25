import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { SavingsAllocationSetting } from '../../types/models';

const PERCENT_PRESETS = [0.05, 0.1, 0.15, 0.2];
const MAX_PERCENT = 1;

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/** Pure, host-callable validity check — the single source of truth both
 * `EditSavingsAllocationModal` and `SavingsAllocationPromptSheet` gate
 * their own Save button on, so the rule can never drift between the two
 * (PRD ask). Percent is bounded to (0, 100%] — 0/negative/empty/NaN all
 * fail, as does anything over 100% of income. */
export function isValidSetting(value: SavingsAllocationSetting, hasRecurringIncome: boolean): boolean {
  if (value.mode === 'off') return true;
  if (value.mode === 'percent') {
    const p = value.percent ?? 0;
    return hasRecurringIncome && p > 0 && p <= MAX_PERCENT;
  }
  if (value.mode === 'fixed') return (value.amount ?? 0) > 0;
  return false;
}

/**
 * The one shared off/percent/fixed picker body (PRD ask: "one shared
 * detail/edit flow... must not create a second implementation"). Fully
 * controlled — `value`/`onChange` carry the single resolved setting the
 * host owns as its draft; this component never persists anything itself.
 * Its only internal state is presentation-only (which percent
 * chip/custom-toggle is active, the raw text mid-typing) and never itself
 * becomes the source of truth — every keystroke that affects the actual
 * setting is immediately reflected out through `onChange`, so an invalid
 * or partial value never silently sits un-communicated to the host's
 * validity check.
 */
export function SavingsAllocationPickerBody({
  value,
  onChange,
  hasRecurringIncome,
  monthlyIncome,
}: {
  value: SavingsAllocationSetting;
  onChange: (setting: SavingsAllocationSetting) => void;
  hasRecurringIncome: boolean;
  monthlyIncome: number;
}) {
  const { colors, radius, spacing } = useTheme();
  // Wave 9c visual/checklist correction (Correction I) — the shared
  // off/percent/fixed picker (rendered by BOTH the one-time "Plan around
  // your income?" prompt and EditSavingsAllocationModal) resolves the
  // shipped semantic type roles with the live locale; percentages and
  // amounts stay tabular. Selection remains non-colour-only: the filled
  // radio dot carries it structurally. No validation rule, copy line or
  // allocation calculation changed.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const mode = value.mode;

  const [usingCustomPercent, setUsingCustomPercent] = useState(
    () => value.mode === 'percent' && value.percent !== undefined && !PERCENT_PRESETS.includes(value.percent)
  );
  const [percent, setPercent] = useState(() =>
    value.mode === 'percent' && value.percent !== undefined && PERCENT_PRESETS.includes(value.percent) ? value.percent : 0.1
  );
  const [customPercentText, setCustomPercentText] = useState(() =>
    value.mode === 'percent' && value.percent !== undefined && !PERCENT_PRESETS.includes(value.percent)
      ? String(Math.round(value.percent * 100))
      : ''
  );
  const [amountText, setAmountText] = useState(() => (value.mode === 'fixed' && value.amount !== undefined ? String(value.amount) : ''));

  function selectOff() {
    onChange({ mode: 'off' });
  }

  function selectPercentMode() {
    if (!hasRecurringIncome) return;
    const parsed = usingCustomPercent ? (customPercentText ? parseFloat(customPercentText) : NaN) : percent * 100;
    onChange({ mode: 'percent', percent: isNaN(parsed) ? 0 : parsed / 100 });
  }

  function selectPreset(p: number) {
    setUsingCustomPercent(false);
    setPercent(p);
    onChange({ mode: 'percent', percent: p });
  }

  function selectCustom() {
    setUsingCustomPercent(true);
    const parsed = customPercentText ? parseFloat(customPercentText) : NaN;
    onChange({ mode: 'percent', percent: isNaN(parsed) ? 0 : parsed / 100 });
  }

  function handleCustomPercentChange(text: string) {
    setCustomPercentText(text);
    const parsed = parseFloat(text);
    onChange({ mode: 'percent', percent: isNaN(parsed) ? 0 : parsed / 100 });
  }

  function selectFixedMode() {
    const parsed = amountText ? parseFloat(amountText) : NaN;
    onChange({ mode: 'fixed', amount: isNaN(parsed) ? 0 : parsed });
  }

  function handleAmountChange(text: string) {
    setAmountText(text);
    const parsed = parseFloat(text);
    onChange({ mode: 'fixed', amount: isNaN(parsed) ? 0 : parsed });
  }

  const effectivePercent = value.mode === 'percent' ? (value.percent ?? 0) : 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        optionRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
          marginBottom: spacing.sm,
        },
        optionRowDisabled: { opacity: 0.5 },
        radioOuter: {
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        },
        radioOuterActive: { borderColor: colors.accent },
        radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
        optionTextBlock: { flex: 1 },
        optionTitle: { ...typeStyle('body', locale), fontWeight: '700', color: colors.textPrimary },
        optionSub: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
        subSection: { marginTop: spacing.xs, marginBottom: spacing.md },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
        chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        chipActive: { backgroundColor: colors.accentSoft },
        chipText: { ...typeStyle('meta', locale), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        chipTextActive: { color: colors.accentStrong, fontWeight: '600' },
        input: {
          ...typeStyle('body', locale),
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 18,
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          fontVariant: ['tabular-nums'],
        },
        label: { ...typeStyle('meta', locale), color: colors.textSecondary, marginBottom: spacing.xs },
        calcOnlyText: { ...typeStyle('meta', locale), color: colors.textMuted, marginBottom: spacing.sm },
      }),
    [colors, radius, spacing, locale]
  );

  return (
    <>
      <TouchableOpacity style={styles.optionRow} onPress={selectOff} activeOpacity={0.7}>
        <View style={[styles.radioOuter, mode === 'off' ? styles.radioOuterActive : null]}>
          {mode === 'off' ? <View style={styles.radioInner} /> : null}
        </View>
        <View style={styles.optionTextBlock}>
          <Text style={styles.optionTitle}>No savings allocation</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.optionRow, !hasRecurringIncome ? styles.optionRowDisabled : null]}
        onPress={selectPercentMode}
        activeOpacity={hasRecurringIncome ? 0.7 : 1}
        disabled={!hasRecurringIncome}
      >
        <View style={[styles.radioOuter, mode === 'percent' ? styles.radioOuterActive : null]}>
          {mode === 'percent' ? <View style={styles.radioInner} /> : null}
        </View>
        <View style={styles.optionTextBlock}>
          <Text style={styles.optionTitle}>Percentage of expected recurring income</Text>
          {!hasRecurringIncome ? <Text style={styles.optionSub}>Requires recurring income to be set up first</Text> : null}
        </View>
      </TouchableOpacity>

      {mode === 'percent' && hasRecurringIncome ? (
        <View style={styles.subSection}>
          <View style={styles.chipRow}>
            {PERCENT_PRESETS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, !usingCustomPercent && percent === p ? styles.chipActive : null]}
                onPress={() => selectPreset(p)}
              >
                <Text style={[styles.chipText, !usingCustomPercent && percent === p ? styles.chipTextActive : null]}>
                  {Math.round(p * 100)}%
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.chip, usingCustomPercent ? styles.chipActive : null]} onPress={selectCustom}>
              <Text style={[styles.chipText, usingCustomPercent ? styles.chipTextActive : null]}>Custom</Text>
            </TouchableOpacity>
          </View>
          {usingCustomPercent ? (
            <TextInput
              style={styles.input}
              placeholder="e.g. 12"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={customPercentText}
              onChangeText={handleCustomPercentChange}
            />
          ) : null}
          <Text style={styles.calcOnlyText}>These are calculation options, not recommendations.</Text>
          {effectivePercent > 0 ? <Text style={styles.optionSub}>≈ {formatMoney(monthlyIncome * effectivePercent)}/month</Text> : null}
        </View>
      ) : null}

      <TouchableOpacity style={styles.optionRow} onPress={selectFixedMode} activeOpacity={0.7}>
        <View style={[styles.radioOuter, mode === 'fixed' ? styles.radioOuterActive : null]}>
          {mode === 'fixed' ? <View style={styles.radioInner} /> : null}
        </View>
        <View style={styles.optionTextBlock}>
          <Text style={styles.optionTitle}>Fixed monthly amount</Text>
          <Text style={styles.optionSub}>For example, $300 per month</Text>
        </View>
      </TouchableOpacity>

      {mode === 'fixed' ? (
        <View style={styles.subSection}>
          <Text style={styles.label}>Fixed monthly amount</Text>
          <TextInput
            style={styles.input}
            placeholder="$300 per month"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={amountText}
            onChangeText={handleAmountChange}
          />
          <Text style={styles.calcOnlyText}>
            Applied as a monthly figure, then shared out across your pay cycle — not the amount deducted from a single payday.
          </Text>
        </View>
      ) : null}
    </>
  );
}
