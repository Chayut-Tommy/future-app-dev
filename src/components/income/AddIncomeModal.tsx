import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { PayFrequency } from '../../types/models';
import { toMonthlyAmount } from '../../lib/calculations/incomeEngine';
import { categoryEmoji } from '../../lib/categoryEmoji';
import { brand } from '../../lib/brand';

const INCOME_SOURCE_IDS = ['cat-salary', 'cat-side-hustle', 'cat-investment-income', 'cat-rental-income', 'cat-gift', 'cat-other-income'];

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// "Irregular" is real, recurring-but-unpredictable income (freelance,
// casual shifts, commission) — distinct from a one-off amount, which is
// recorded as an income transaction instead (PRD ask, §1: "Record income
// received") and never touches these fields at all.
const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'irregular', label: 'Irregular recurring' },
];

export function AddIncomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [income, setIncome] = useState('');
  const [frequency, setFrequency] = useState<PayFrequency>('monthly');
  const [nextPayday, setNextPayday] = useState<string | null>(null);
  const [unknownPayday, setUnknownPayday] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [incomeSource, setIncomeSource] = useState<string | null>(null);
  // Category-first, like the transaction flow (PRD ask: "make it
  // friendlier") — picking what kind of income this is comes before the
  // amount. Editing already has a source, so it skips straight to details.
  const [formStep, setFormStep] = useState<'category' | 'details'>('category');

  const isEditing = data.user.monthlyIncome > 0;
  const incomeCategories = data.categories.filter((c) => c.type === 'income' && INCOME_SOURCE_IDS.includes(c.id));
  const isIrregular = frequency === 'irregular';

  useEffect(() => {
    if (!visible) return;
    if (data.user.monthlyIncome > 0) {
      // Prefer the raw amount the user actually typed (incomeAmount) so
      // re-opening this form shows back what they entered, not a
      // reverse-engineered monthly figure. Falls back to monthlyIncome for
      // data saved before this field existed.
      setIncome(String(data.user.incomeAmount ?? data.user.monthlyIncome));
      setFrequency(data.user.payFrequency);
      setNextPayday(data.user.nextPayday);
      setUnknownPayday(!data.user.nextPayday);
      setIncomeSource(data.user.incomeSource ?? null);
      setFormStep('details');
    } else {
      setIncome('');
      setFrequency('monthly');
      setNextPayday(null);
      setUnknownPayday(false);
      setIncomeSource(null);
      setFormStep('category');
    }
    setPickerOpen(false);
  }, [visible, data.user.monthlyIncome, data.user.incomeAmount, data.user.payFrequency, data.user.nextPayday, data.user.incomeSource]);

  const incomeNumber = parseFloat(income);
  // A known payday is required for regular/predictable frequencies (Lulu
  // needs a real date to schedule Money Plan and Available Until Payday
  // around) but is genuinely optional for irregular income — never invented
  // when the user says they don't know it (PRD ask, §1/§5).
  const canSave = !isNaN(incomeNumber) && incomeNumber > 0 && (isIrregular || unknownPayday || !!nextPayday);
  const monthlyPreview = !isNaN(incomeNumber) && incomeNumber > 0 ? toMonthlyAmount(incomeNumber, frequency) : null;

  function handleSave() {
    if (!canSave) return;
    // The raw amount is stored as incomeAmount; monthlyIncome always holds
    // the true monthly equivalent so every other calculation in the app
    // can keep assuming it's already normalized (PRD bug report).
    updateUser({
      incomeAmount: incomeNumber,
      monthlyIncome: toMonthlyAmount(incomeNumber, frequency),
      payFrequency: frequency,
      nextPayday: unknownPayday ? null : nextPayday,
      incomeSource: incomeSource ?? undefined,
    });
    onClose();
  }

  function handleRemove() {
    updateUser({ monthlyIncome: 0, incomeAmount: 0, nextPayday: null, incomeSource: undefined });
    onClose();
  }

  function chooseSource(id: string) {
    setIncomeSource(id);
    setFormStep('details');
  }

  function chooseFrequency(f: PayFrequency) {
    setFrequency(f);
    // Switching frequency invalidates any date picked under the old
    // schedule — never leave a stale "Monthly" payday sitting behind a
    // newly-chosen "Weekly" frequency (PRD ask, §5: "do not allow
    // contradictory states").
    setNextPayday(null);
    setUnknownPayday(f === 'irregular');
    setPickerOpen(false);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        amountInput: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 14,
          fontSize: 26,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        chip: { paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        chipActive: { backgroundColor: colors.accentSoft },
        chipText: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        chipTextActive: { color: colors.accentStrong, fontWeight: '600' },
        footerButton: { flex: 1 },
        removeButton: { alignSelf: 'center', marginTop: spacing.md },
        removeText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        preview: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.sm },
        sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        sourceCard: {
          flexBasis: '30%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        sourceCardEmoji: { fontSize: 26, marginBottom: spacing.xs },
        sourceCardLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
        selectedSourceRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        selectedSourceEmoji: { fontSize: 20 },
        selectedSourceLabel: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '700', flex: 1 },
        selectedSourceChange: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
        dateButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 14,
        },
        dateButtonText: { ...typography.body, fontSize: 15, color: colors.textPrimary },
        dateButtonPlaceholder: { color: colors.textMuted },
        toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
        toggleText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },
        irregularNote: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 15 },
      }),
    [colors, radius, spacing, typography]
  );

  const selectedSourceCategory = incomeSource ? data.categories.find((c) => c.id === incomeSource) ?? null : null;

  if (formStep === 'category') {
    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="💼 Add your income"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        <Text style={styles.preview}>Tell {brand.name} what comes in so we can build your money plan.</Text>
        <View style={styles.sourceGrid}>
          {incomeCategories.map((c) => (
            <TouchableOpacity key={c.id} style={styles.sourceCard} activeOpacity={0.8} onPress={() => chooseSource(c.id)}>
              <Text style={styles.sourceCardEmoji}>{categoryEmoji(c.id)}</Text>
              <Text style={styles.sourceCardLabel}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardSheet>
    );
  }

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit income source' : 'Add income source'}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      {selectedSourceCategory ? (
        <View style={styles.selectedSourceRow}>
          <Text style={styles.selectedSourceEmoji}>{categoryEmoji(selectedSourceCategory.id)}</Text>
          <Text style={styles.selectedSourceLabel}>{selectedSourceCategory.name}</Text>
          <TouchableOpacity onPress={() => setFormStep('category')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.selectedSourceChange}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.label}>{isIrregular ? 'Typical amount' : 'Income amount'}</Text>
      <TextInput
        style={styles.amountInput}
        placeholder="$6,000"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={income}
        onChangeText={setIncome}
        autoFocus
      />
      {monthlyPreview !== null && frequency !== 'monthly' ? (
        <Text style={styles.preview}>≈ {formatMoney(monthlyPreview)}/month estimated</Text>
      ) : null}

      <Text style={styles.label}>Pay frequency</Text>
      <View style={styles.row}>
        {FREQUENCIES.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.chip, frequency === f.value ? styles.chipActive : null]}
            onPress={() => chooseFrequency(f.value)}
          >
            <Text style={[styles.chipText, frequency === f.value ? styles.chipTextActive : null]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isIrregular ? (
        <>
          <Text style={styles.label}>Next expected payday</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setPickerOpen(true)}>
            <Text style={[styles.dateButtonText, !nextPayday ? styles.dateButtonPlaceholder : null]}>
              {nextPayday ? formatDate(nextPayday) : 'Choose a date'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {pickerOpen ? (
            <DateTimePicker
              value={nextPayday ? new Date(nextPayday) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS === 'android') setPickerOpen(false);
                if (event.type === 'dismissed') return;
                if (date) setNextPayday(date.toISOString());
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.label}>Expected date (optional)</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setPickerOpen(true)} disabled={unknownPayday}>
            <Text style={[styles.dateButtonText, (!nextPayday || unknownPayday) ? styles.dateButtonPlaceholder : null]}>
              {!unknownPayday && nextPayday ? formatDate(nextPayday) : 'No date set'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {pickerOpen && !unknownPayday ? (
            <DateTimePicker
              value={nextPayday ? new Date(nextPayday) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS === 'android') setPickerOpen(false);
                if (event.type === 'dismissed') return;
                if (date) setNextPayday(date.toISOString());
              }}
            />
          ) : null}
          <TouchableOpacity style={styles.toggleRow} onPress={() => { setUnknownPayday((v) => !v); setPickerOpen(false); if (!unknownPayday) setNextPayday(null); }}>
            <Ionicons name={unknownPayday ? 'checkbox' : 'square-outline'} size={20} color={unknownPayday ? colors.accentStrong : colors.textMuted} />
            <Text style={styles.toggleText}>I don't know when the next payment will arrive</Text>
          </TouchableOpacity>
          <Text style={styles.irregularNote}>
            {brand.name} won't guess a payday for irregular income — Available Until Payday will show a cash-runway estimate instead.
          </Text>
        </>
      )}

      {isEditing ? (
        <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
          <Text style={styles.removeText}>Remove income</Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardSheet>
  );
}
