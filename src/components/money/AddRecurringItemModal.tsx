import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { RecurringItem, PayFrequency } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';

// Rent and Mortgage are deliberately separate presets, not one combined
// entry (PRD ask): rent is a pure expense, mortgage also builds/reduces a
// real liability, so only Mortgage triggers the loan-balance fields below.
const BILL_PRESETS: { label: string; icon: keyof typeof Ionicons.glyphMap; emoji: string }[] = [
  { label: 'Rent', icon: 'home-outline', emoji: '🏠' },
  { label: 'Mortgage', icon: 'home', emoji: '🏠' },
  { label: 'Utilities', icon: 'flash-outline', emoji: '⚡' },
  { label: 'Phone', icon: 'phone-portrait-outline', emoji: '📱' },
  { label: 'Internet', icon: 'wifi-outline', emoji: '🌐' },
  { label: 'Gym', icon: 'barbell-outline', emoji: '🏋️' },
  { label: 'Subscription', icon: 'play-circle-outline', emoji: '🎬' },
  { label: 'Car', icon: 'car-outline', emoji: '🚗' },
  { label: 'Insurance', icon: 'shield-checkmark-outline', emoji: '🛡️' },
  { label: 'Other', icon: 'ellipse-outline', emoji: '➕' },
];

const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

function nextOccurrence(dayOfMonth: number): string {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (candidate.getTime() < now.getTime()) candidate.setMonth(candidate.getMonth() + 1);
  return candidate.toISOString();
}

function dayOfMonthFrom(iso: string): string {
  return String(new Date(iso).getDate());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function AddRecurringItemModal({
  visible,
  onClose,
  editItem,
  onSelectMortgage,
}: {
  visible: boolean;
  onClose: () => void;
  /** Present = editing this existing bill instead of creating a new one. */
  editItem?: RecurringItem | null;
  /** A mortgage needs property linking and an explicit repayment date, not
   * this generic bill form — picking "Mortgage" here hands off to the one
   * shared mortgage flow (AddWealthItemModal) instead of duplicating
   * mortgage-specific logic in two places (PRD ask, §B4: "all entry points
   * should use one shared mortgage creation/update function"). */
  onSelectMortgage?: () => void;
}) {
  const { addRecurringItem, updateRecurringItem, deleteRecurringItem } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>('home-outline');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<PayFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  // Only meaningful for weekly/fortnightly — a "day of month" can't express
  // a real weekly/fortnightly cadence (PRD bug report: a fortnightly bill
  // with "day of month = 10" silently behaved like a monthly one). Mirrors
  // Income's own "Next expected payday" picker for the same frequencies.
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Category-first, like the other add flows (PRD ask) — picking what kind
  // of bill this is comes before the amount/date details. Editing an
  // existing bill already has a type, so it skips straight to details.
  const [formStep, setFormStep] = useState<'category' | 'details'>('category');

  const isEditing = !!editItem;
  const usesDayOfMonth = frequency === 'monthly';

  useEffect(() => {
    if (!visible) return;
    if (editItem) {
      const itemFrequency = editItem.frequency === 'irregular' ? 'monthly' : editItem.frequency;
      setIcon((editItem.icon as keyof typeof Ionicons.glyphMap) ?? 'home-outline');
      setLabel(editItem.label);
      setAmount(String(editItem.amount));
      setFrequency(itemFrequency);
      setDayOfMonth(dayOfMonthFrom(editItem.nextDueDate));
      setNextDueDate(itemFrequency === 'monthly' ? null : editItem.nextDueDate);
      setFormStep('details');
    } else {
      setIcon('home-outline');
      setLabel('');
      setAmount('');
      setFrequency('monthly');
      setDayOfMonth('1');
      setNextDueDate(null);
      setFormStep('category');
    }
    setPickerOpen(false);
  }, [visible, editItem]);

  function chooseFrequency(f: PayFrequency) {
    setFrequency(f);
    // Switching frequency invalidates whatever date/day was picked under the
    // old schedule — never leave a stale value sitting behind a newly-chosen
    // frequency (same rule Income already follows).
    setDayOfMonth('1');
    setNextDueDate(null);
    setPickerOpen(false);
  }

  const amountValue = parseFloat(amount);
  const dayValue = parseInt(dayOfMonth, 10);
  const canSave =
    label.trim().length > 0 &&
    !isNaN(amountValue) &&
    amountValue > 0 &&
    (usesDayOfMonth ? dayValue >= 1 && dayValue <= 31 : !!nextDueDate);

  function chooseBillType(p: (typeof BILL_PRESETS)[number]) {
    // Mortgage needs property linking and an explicit repayment date — one
    // shared flow handles that (AddWealthItemModal), so hand off instead
    // of duplicating mortgage logic here (PRD ask, §B4).
    if (p.label === 'Mortgage') {
      onClose();
      onSelectMortgage?.();
      return;
    }
    setIcon(p.icon);
    setLabel(p.label);
    setFormStep('details');
  }

  function handleSave() {
    if (!canSave) return;
    const payload = {
      type: 'expense' as const,
      label: label.trim(),
      amount: amountValue,
      frequency,
      nextDueDate: usesDayOfMonth ? nextOccurrence(dayValue) : (nextDueDate as string),
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
        chipRow: { flexDirection: 'row', gap: spacing.sm },
        chip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        chipActive: { backgroundColor: colors.accentSoft },
        chipText: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
        chipTextActive: { color: colors.accentStrong, fontWeight: '600' },
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
        dateHint: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
        footerButton: { flex: 1 },
        deleteButton: { alignSelf: 'center', marginTop: spacing.lg },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        categoryCard: {
          flexBasis: '30%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        categoryCardEmoji: { fontSize: 26, marginBottom: spacing.xs },
        categoryCardLabel: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
        selectedTypeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        selectedTypeEmoji: { fontSize: 20 },
        selectedTypeLabel: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '700', flex: 1 },
        selectedTypeChange: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  const selectedPreset = BILL_PRESETS.find((p) => p.icon === icon) ?? null;

  if (formStep === 'category') {
    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="📅 What's this bill for?"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        <View style={styles.categoryGrid}>
          {BILL_PRESETS.map((p) => (
            <TouchableOpacity key={p.label} style={styles.categoryCard} activeOpacity={0.8} onPress={() => chooseBillType(p)}>
              <Text style={styles.categoryCardEmoji}>{p.emoji}</Text>
              <Text style={styles.categoryCardLabel}>{p.label}</Text>
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
      title={isEditing ? 'Edit bill' : 'Add a bill'}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      <View style={styles.selectedTypeRow}>
        <Text style={styles.selectedTypeEmoji}>{selectedPreset?.emoji ?? '📅'}</Text>
        <Text style={styles.selectedTypeLabel}>{selectedPreset?.label ?? 'Bill'}</Text>
        <TouchableOpacity onPress={() => setFormStep('category')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.selectedTypeChange}>Change</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} placeholder="e.g. Netflix" placeholderTextColor={colors.textMuted} value={label} onChangeText={setLabel} />

      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} placeholder="$0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />

      <Text style={styles.label}>How often</Text>
      <View style={styles.chipRow}>
        {FREQUENCIES.map((f) => {
          const active = frequency === f.value;
          return (
            <TouchableOpacity key={f.value} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => chooseFrequency(f.value)}>
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {usesDayOfMonth ? (
        <>
          <Text style={styles.label}>Day of month due</Text>
          <TextInput style={styles.input} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={dayOfMonth} onChangeText={setDayOfMonth} returnKeyType="done" />
        </>
      ) : (
        <>
          <Text style={styles.label}>Next due date</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setPickerOpen(true)}>
            <Text style={[styles.dateButtonText, !nextDueDate ? styles.dateButtonPlaceholder : null]}>
              {nextDueDate ? formatDate(nextDueDate) : 'Choose a date'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.dateHint}>
            {frequency === 'weekly' ? 'Repeats every 7 days from this date.' : 'Repeats every 14 days from this date.'}
          </Text>
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
      )}

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete bill</Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardSheet>
  );
}
