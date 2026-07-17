import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useSavingsAllocationPrompt } from '../../state/SavingsAllocationPromptContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { PayFrequency, RecurringItem } from '../../types/models';
import { toMonthlyAmount } from '../../lib/calculations/incomeEngine';
import { categoryEmoji } from '../../lib/categoryEmoji';
import { brand } from '../../lib/brand';

const INCOME_SOURCE_IDS = ['cat-salary', 'cat-side-hustle', 'cat-investment-income', 'cat-rental-income', 'cat-gift', 'cat-other-income'];

const INCOME_SOURCE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  'cat-salary': 'briefcase-outline',
  'cat-side-hustle': 'laptop-outline',
  'cat-investment-income': 'trending-up-outline',
  'cat-rental-income': 'home-outline',
  'cat-gift': 'gift-outline',
  'cat-other-income': 'cash-outline',
};

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

/**
 * One income source, added/edited/deleted independently of every other one
 * (PRD ask, §3: "support multiple recurring income sources" — Salary,
 * rental, dividends, side business, etc., each with its own name, amount,
 * frequency and next expected payment). Each source is a `RecurringItem`
 * of type 'income', the same shape and CRUD bills already use — Money
 * Engine, Safe to Spend, Lulu Score, and everything else still only ever
 * see one aggregate `monthlyIncome`, kept in sync automatically in
 * AppStateContext (`syncIncomeAggregate`) from however many sources exist.
 */
export function AddIncomeModal({
  visible,
  onClose,
  editItem,
}: {
  visible: boolean;
  onClose: () => void;
  /** Present = editing this existing income source instead of adding a new one. */
  editItem?: RecurringItem | null;
}) {
  const { data, addRecurringItem, updateRecurringItem, deleteRecurringItem } = useAppState();
  const { requestPrompt } = useSavingsAllocationPrompt();
  const { colors, radius, spacing, typography } = useTheme();
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>('cash-outline');
  const [label, setLabel] = useState('');
  const [income, setIncome] = useState('');
  const [frequency, setFrequency] = useState<PayFrequency>('monthly');
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);
  const [unknownDate, setUnknownDate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Category-first, like the transaction flow (PRD ask: "make it
  // friendlier") — picking what kind of income this is comes before the
  // amount. Editing an existing source already has a name, so it skips
  // straight to details.
  const [formStep, setFormStep] = useState<'category' | 'details'>('category');

  const isEditing = !!editItem;
  const isIrregular = frequency === 'irregular';

  useEffect(() => {
    if (!visible) return;
    if (editItem) {
      setIcon((editItem.icon as keyof typeof Ionicons.glyphMap) ?? 'cash-outline');
      setLabel(editItem.label);
      setIncome(String(editItem.amount));
      setFrequency(editItem.frequency);
      setNextDueDate(editItem.nextDueDateUnknown ? null : editItem.nextDueDate);
      setUnknownDate(!!editItem.nextDueDateUnknown);
      setFormStep('details');
    } else {
      setIcon('cash-outline');
      setLabel('');
      setIncome('');
      setFrequency('monthly');
      setNextDueDate(null);
      setUnknownDate(false);
      setFormStep('category');
    }
    setPickerOpen(false);
  }, [visible, editItem]);

  const incomeNumber = parseFloat(income);
  // A known next payment is required for regular/predictable frequencies
  // (Navilo needs a real date to schedule Money Plan and Available Until
  // Payday around) but is genuinely optional for irregular income — never
  // invented when the user says they don't know it (PRD ask, §1/§5).
  const canSave = label.trim().length > 0 && !isNaN(incomeNumber) && incomeNumber > 0 && (isIrregular || unknownDate || !!nextDueDate);
  const monthlyPreview = !isNaN(incomeNumber) && incomeNumber > 0 ? toMonthlyAmount(incomeNumber, frequency) : null;

  function handleSave() {
    if (!canSave) return;
    // Qualification and the request itself are computed and fired
    // synchronously, before any state mutation below — the request must
    // survive regardless of what happens to this component afterward
    // (PRD ask: some hosts, e.g. MoneyPictureChecklistCard, can unmount
    // this modal abruptly as a side effect of the very save below, so the
    // signal cannot depend on this component's own close lifecycle
    // completing). Never applies to editing an existing source, only a
    // genuine 0 -> 1 active-income transition, and never re-fires once
    // the disclosure has been handled or a real allocation already exists.
    const activeIncomeCountBefore = data.recurringItems.filter((r) => r.type === 'income' && r.active).length;
    const qualifiesForSavingsAllocationPrompt =
      !editItem &&
      activeIncomeCountBefore === 0 &&
      !data.user.savingsAllocationPromptHandled &&
      (!data.user.savingsAllocation || data.user.savingsAllocation.mode === 'off');
    if (qualifiesForSavingsAllocationPrompt) requestPrompt();

    const payload = {
      type: 'income' as const,
      label: label.trim(),
      amount: incomeNumber,
      frequency,
      nextDueDate: unknownDate || !nextDueDate ? new Date().toISOString() : nextDueDate,
      nextDueDateUnknown: unknownDate,
      isFixed: true,
      active: true,
      icon,
    };
    if (editItem) {
      updateRecurringItem(editItem.id, payload);
    } else {
      addRecurringItem(payload);
    }
    onClose();
  }

  function handleDelete() {
    if (editItem) deleteRecurringItem(editItem.id);
    onClose();
  }

  function chooseSource(sourceId: string) {
    setIcon(INCOME_SOURCE_ICON[sourceId] ?? 'cash-outline');
    setLabel((prev) => prev || SOURCE_LABEL[sourceId] || 'Income');
    setFormStep('details');
  }

  function chooseFrequency(f: PayFrequency) {
    setFrequency(f);
    // Switching frequency invalidates whatever date was picked under the
    // old schedule — never leave a stale date sitting behind a newly-chosen
    // frequency (PRD ask, §5: "do not allow contradictory states").
    setNextDueDate(null);
    setUnknownDate(f === 'irregular');
    setPickerOpen(false);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
        },
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
        deleteButton: { alignSelf: 'center', marginTop: spacing.lg },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
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

  if (formStep === 'category') {
    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="💼 Add income source"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        <Text style={styles.preview}>Tell {brand.name} what comes in so it can build your money plan.</Text>
        <View style={styles.sourceGrid}>
          {INCOME_SOURCE_IDS.map((id) => (
            <TouchableOpacity key={id} style={styles.sourceCard} activeOpacity={0.8} onPress={() => chooseSource(id)}>
              <Text style={styles.sourceCardEmoji}>{categoryEmoji(id)}</Text>
              <Text style={styles.sourceCardLabel}>{SOURCE_LABEL[id]}</Text>
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
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} placeholder="e.g. Salary" placeholderTextColor={colors.textMuted} value={label} onChangeText={setLabel} />

      <Text style={styles.label}>{isIrregular ? 'Typical amount' : 'Amount'}</Text>
      <TextInput
        style={styles.amountInput}
        placeholder="$6,000"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={income}
        onChangeText={setIncome}
      />
      {monthlyPreview !== null && frequency !== 'monthly' ? <Text style={styles.preview}>≈ {formatMoney(monthlyPreview)}/month estimated</Text> : null}

      <Text style={styles.label}>Pay frequency</Text>
      <View style={styles.row}>
        {FREQUENCIES.map((f) => (
          <TouchableOpacity key={f.value} style={[styles.chip, frequency === f.value ? styles.chipActive : null]} onPress={() => chooseFrequency(f.value)}>
            <Text style={[styles.chipText, frequency === f.value ? styles.chipTextActive : null]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isIrregular ? (
        <>
          <Text style={styles.label}>Next expected payment</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setPickerOpen(true)}>
            <Text style={[styles.dateButtonText, !nextDueDate ? styles.dateButtonPlaceholder : null]}>
              {nextDueDate ? formatDate(nextDueDate) : 'Choose a date'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {pickerOpen ? (
            <DateTimePicker
              value={nextDueDate ? new Date(nextDueDate) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS === 'android') setPickerOpen(false);
                if (event.type === 'dismissed') return;
                if (date) setNextDueDate(date.toISOString());
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.label}>Expected date (optional)</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setPickerOpen(true)} disabled={unknownDate}>
            <Text style={[styles.dateButtonText, !nextDueDate || unknownDate ? styles.dateButtonPlaceholder : null]}>
              {!unknownDate && nextDueDate ? formatDate(nextDueDate) : 'No date set'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {pickerOpen && !unknownDate ? (
            <DateTimePicker
              value={nextDueDate ? new Date(nextDueDate) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS === 'android') setPickerOpen(false);
                if (event.type === 'dismissed') return;
                if (date) setNextDueDate(date.toISOString());
              }}
            />
          ) : null}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => {
              setUnknownDate((v) => !v);
              setPickerOpen(false);
              if (!unknownDate) setNextDueDate(null);
            }}
          >
            <Ionicons name={unknownDate ? 'checkbox' : 'square-outline'} size={20} color={unknownDate ? colors.accentStrong : colors.textMuted} />
            <Text style={styles.toggleText}>I don't know when the next payment will arrive</Text>
          </TouchableOpacity>
          <Text style={styles.irregularNote}>
            {brand.name} won't guess a payday for irregular income — Available Until Payday will show a cash-runway estimate instead.
          </Text>
        </>
      )}

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete income source</Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardSheet>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  'cat-salary': 'Salary',
  'cat-side-hustle': 'Side hustle',
  'cat-investment-income': 'Dividends',
  'cat-rental-income': 'Rental income',
  'cat-gift': 'Gift',
  'cat-other-income': 'Other',
};
