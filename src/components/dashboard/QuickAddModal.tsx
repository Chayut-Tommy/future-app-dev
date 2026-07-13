import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { PaymentSource, Transaction } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { categoryEmoji } from '../../lib/categoryEmoji';
import { brand } from '../../lib/brand';

const DATE_PRESETS = [
  { label: 'Today', daysAgo: 0 },
  { label: 'Yesterday', daysAgo: 1 },
  { label: '2 days ago', daysAgo: 2 },
  { label: 'Last week', daysAgo: 7 },
];

const PAYMENT_SOURCES: { value: PaymentSource; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'loan', label: 'Loan / debt' },
  { value: 'other', label: 'Other' },
];

function dateParts(date: Date): { day: string; month: string; year: string } {
  return { day: String(date.getDate()), month: String(date.getMonth() + 1), year: String(date.getFullYear()) };
}

export function QuickAddModal({
  visible,
  onClose,
  editTransaction,
  initialType,
}: {
  visible: boolean;
  onClose: () => void;
  /** Present = editing this existing transaction instead of creating a new one. */
  editTransaction?: Transaction | null;
  /** Opens straight into this segment — used for "Record income received"
   * (PRD ask, §2), a one-off/ad-hoc amount that only ever updates cash via
   * a normal income Transaction, and never touches user.monthlyIncome or
   * payFrequency the way "Add income source" does. */
  initialType?: 'income' | 'expense';
}) {
  const { data, addTransaction, updateTransaction, deleteTransaction } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [creditCardId, setCreditCardId] = useState<string | null>(null);
  const [liabilityId, setLiabilityId] = useState<string | null>(null);
  const [addCashVisible, setAddCashVisible] = useState(false);
  // Category-first flow (PRD ask: "adding money should feel quick and
  // satisfying, not like accounting software") — picking a category is its
  // own step with large tappable cards, then amount/date/payment source.
  // Editing an existing transaction already has a category, so it skips
  // straight to the details step.
  const [formStep, setFormStep] = useState<'category' | 'details'>('category');
  const initialSnapshot = useRef({ amount: '', categoryId: null as string | null });

  const isEditing = !!editTransaction;
  const hasCashAsset = data.assets.some((a) => a.type === 'cash');
  const nonCreditLiabilities = data.liabilities.filter((l) => l.type !== 'credit_card');
  const isDirty = amount !== initialSnapshot.current.amount || categoryId !== initialSnapshot.current.categoryId;

  useEffect(() => {
    if (!visible) return;
    if (editTransaction) {
      setType(editTransaction.type);
      setAmount(String(editTransaction.amount));
      setCategoryId(editTransaction.categoryId);
      const parts = dateParts(new Date(editTransaction.date));
      setDay(parts.day);
      setMonth(parts.month);
      setYear(parts.year);
      setPaymentSource(editTransaction.paymentSource ?? 'cash');
      setCreditCardId(editTransaction.creditCardId ?? null);
      setLiabilityId(editTransaction.liabilityId ?? null);
      initialSnapshot.current = { amount: String(editTransaction.amount), categoryId: editTransaction.categoryId };
      setFormStep('details');
    } else {
      setType(initialType ?? 'expense');
      setAmount('');
      setCategoryId(null);
      const parts = dateParts(new Date());
      setDay(parts.day);
      setMonth(parts.month);
      setYear(parts.year);
      setPaymentSource('cash');
      setCreditCardId(null);
      setLiabilityId(null);
      initialSnapshot.current = { amount: '', categoryId: null };
      setFormStep('category');
    }
  }, [visible, editTransaction, initialType]);

  function chooseCategory(id: string) {
    setCategoryId(id);
    setFormStep('details');
  }

  function applyDatePreset(daysAgo: number) {
    const parts = dateParts(new Date(Date.now() - daysAgo * 86400000));
    setDay(parts.day);
    setMonth(parts.month);
    setYear(parts.year);
  }

  const categories = data.categories.filter((c) => c.type === type);
  const amountValue = parseFloat(amount);
  const dayValue = parseInt(day, 10);
  const monthValue = parseInt(month, 10);
  const yearValue = parseInt(year, 10);
  const dateValid = !isNaN(dayValue) && !isNaN(monthValue) && !isNaN(yearValue) && dayValue >= 1 && dayValue <= 31 && monthValue >= 1 && monthValue <= 12;
  const canSave = !isNaN(amountValue) && amountValue > 0 && !!categoryId && dateValid;

  function handleSave() {
    if (!canSave || !categoryId) return;
    const isoDate = new Date(yearValue, monthValue - 1, dayValue).toISOString();
    const payload =
      type === 'expense'
        ? {
            type,
            amount: amountValue,
            categoryId,
            date: isoDate,
            paymentSource,
            creditCardId: paymentSource === 'credit_card' ? creditCardId ?? undefined : undefined,
            liabilityId: paymentSource === 'loan' ? liabilityId ?? undefined : undefined,
          }
        : { type, amount: amountValue, categoryId, date: isoDate };

    if (editTransaction) {
      // Amount/type/payment-source changes move real money in Wealth — the
      // user may have already spent or moved that cash elsewhere, so ask
      // rather than silently re-adjusting balances (PRD ask).
      const financiallyChanged =
        payload.amount !== editTransaction.amount ||
        payload.type !== editTransaction.type ||
        ('paymentSource' in payload && payload.paymentSource !== (editTransaction.paymentSource ?? 'cash')) ||
        ('creditCardId' in payload && payload.creditCardId !== editTransaction.creditCardId) ||
        ('liabilityId' in payload && payload.liabilityId !== editTransaction.liabilityId);

      if (financiallyChanged) {
        Alert.alert(
          `Should ${brand.name} also adjust your cash balance?`,
          `You changed the amount or how this was paid. ${brand.name} can update your Wealth picture to match, or just fix the record if you've already handled the money elsewhere.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'No, only update record', onPress: () => { updateTransaction(editTransaction.id, payload, false); onClose(); } },
            { text: 'Yes, adjust my balances', onPress: () => { updateTransaction(editTransaction.id, payload, true); onClose(); } },
          ]
        );
        return;
      }
      updateTransaction(editTransaction.id, payload);
    } else {
      addTransaction(payload);
    }
    onClose();
  }

  function handleDelete() {
    if (!editTransaction) return;
    Alert.alert(
      `Should ${brand.name} also adjust your cash balance?`,
      `This transaction affected your Wealth picture. If you've already spent or moved that money elsewhere, ${brand.name} can leave your balances as they are.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'No, only delete record', onPress: () => { deleteTransaction(editTransaction.id, false); onClose(); } },
        { text: 'Yes, reverse cash impact', onPress: () => { deleteTransaction(editTransaction.id, true); onClose(); } },
      ]
    );
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        segment: {
          flexDirection: 'row',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: 4,
          marginBottom: spacing.md,
        },
        segmentButton: {
          flex: 1,
          paddingVertical: 10,
          alignItems: 'center',
          borderRadius: radius.control - 2,
        },
        segmentActive: {
          backgroundColor: colors.surface,
        },
        segmentText: {
          ...typography.body,
          fontSize: 14,
          color: colors.textSecondary,
        },
        segmentTextActive: {
          color: colors.textPrimary,
          fontWeight: '600',
        },
        amountInput: {
          fontSize: 36,
          fontWeight: '700',
          textAlign: 'center',
          paddingVertical: spacing.md,
          color: colors.textPrimary,
        },
        sectionLabel: {
          ...typography.caption,
          fontSize: 12,
          color: colors.textSecondary,
          marginBottom: spacing.sm,
        },
        categoryRow: {
          marginBottom: spacing.md,
        },
        categoryChip: {
          paddingHorizontal: spacing.md,
          paddingVertical: 9,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
          marginRight: spacing.sm,
        },
        categoryChipActive: {
          backgroundColor: colors.accentSoft,
        },
        categoryText: {
          ...typography.caption,
          fontSize: 13,
          color: colors.textSecondary,
        },
        categoryTextActive: {
          color: colors.accentStrong,
          fontWeight: '600',
        },
        footerButton: {
          flex: 1,
        },
        deleteButton: { alignSelf: 'center', marginTop: spacing.sm },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
        presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
        presetChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        presetChipActive: { backgroundColor: colors.accentSoft },
        presetText: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        presetTextActive: { color: colors.accentStrong, fontWeight: '600' },
        dateRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        dateInput: {
          flex: 1,
          textAlign: 'center',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingVertical: 10,
          fontSize: 15,
          color: colors.textPrimary,
        },
        hintText: { ...typography.micro, color: colors.textSecondary, marginTop: -4, marginBottom: spacing.md, lineHeight: 15 },
        cashPromptBox: { backgroundColor: colors.warningSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        cashPromptTitle: { ...typography.caption, fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
        cashPromptBody: { ...typography.micro, color: colors.textSecondary, lineHeight: 16, marginBottom: spacing.sm },
        cashPromptButton: { paddingVertical: 9, alignItems: 'center' },
        cashPromptButtonPrimary: { backgroundColor: colors.surface, borderRadius: radius.control, marginBottom: spacing.xs },
        cashPromptButtonText: { ...typography.caption, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
        cashPromptButtonTextMuted: { ...typography.caption, fontSize: 13, color: colors.textSecondary },
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
        selectedCategoryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.accentSoft,
          borderRadius: radius.control,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        selectedCategoryEmoji: { fontSize: 20 },
        selectedCategoryLabel: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '700', flex: 1 },
        selectedCategoryChange: { ...typography.caption, fontSize: 12, color: colors.accentStrong, fontWeight: '700' },
      }),
    [colors, radius, spacing, typography]
  );

  const selectedCategory = categoryId ? data.categories.find((c) => c.id === categoryId) ?? null : null;

  if (formStep === 'category') {
    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="What's this for?"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segmentButton, type === 'expense' ? styles.segmentActive : null]}
            onPress={() => {
              setType('expense');
              setCategoryId(null);
            }}
          >
            <Text style={[styles.segmentText, type === 'expense' ? styles.segmentTextActive : null]}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, type === 'income' ? styles.segmentActive : null]}
            onPress={() => {
              setType('income');
              setCategoryId(null);
            }}
          >
            <Text style={[styles.segmentText, type === 'income' ? styles.segmentTextActive : null]}>Income</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.categoryGrid}>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} style={styles.categoryCard} activeOpacity={0.8} onPress={() => chooseCategory(c.id)}>
              <Text style={styles.categoryCardEmoji}>{categoryEmoji(c.id)}</Text>
              <Text style={styles.categoryCardLabel}>{c.name}</Text>
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
      title={isEditing ? 'Edit transaction' : 'Add transaction'}
      isDirty={isDirty}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={() => confirmDiscardIfDirty(isDirty, onClose)} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      <View style={styles.selectedCategoryRow}>
        <Text style={styles.selectedCategoryEmoji}>{selectedCategory ? categoryEmoji(selectedCategory.id) : '💰'}</Text>
        <Text style={styles.selectedCategoryLabel}>{selectedCategory?.name ?? 'Select a category'}</Text>
        <TouchableOpacity onPress={() => setFormStep('category')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.selectedCategoryChange}>Change</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.amountInput}
        placeholder="$0.00"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        autoFocus
        returnKeyType="done"
      />

      {type === 'expense' ? (
        <>
          <Text style={styles.sectionLabel}>Paid from</Text>
          <View style={styles.presetRow}>
            {PAYMENT_SOURCES.map((s) => {
              const active = paymentSource === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.presetChip, active ? styles.presetChipActive : null]}
                  onPress={() => setPaymentSource(s.value)}
                >
                  <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {paymentSource === 'cash' && !hasCashAsset ? (
            <View style={styles.cashPromptBox}>
              <Text style={styles.cashPromptTitle}>Add your cash balance first</Text>
              <Text style={styles.cashPromptBody}>{brand.name} needs to know how much cash you have before reducing it.</Text>
              <TouchableOpacity style={[styles.cashPromptButton, styles.cashPromptButtonPrimary]} onPress={() => setAddCashVisible(true)}>
                <Text style={styles.cashPromptButtonText}>Add cash balance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cashPromptButton} onPress={() => setPaymentSource('credit_card')}>
                <Text style={styles.cashPromptButtonTextMuted}>Use credit card instead</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cashPromptButton} onPress={() => setPaymentSource('other')}>
                <Text style={styles.cashPromptButtonTextMuted}>Record as spending only</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {paymentSource === 'credit_card' ? (
            data.creditCards.length > 0 ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {data.creditCards.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.categoryChip, creditCardId === c.id ? styles.categoryChipActive : null]}
                      onPress={() => setCreditCardId(c.id)}
                    >
                      <Text style={[styles.categoryText, creditCardId === c.id ? styles.categoryTextActive : null]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.hintText}>This card's balance will increase — {brand.name} keeps it in sync with your Wealth liabilities.</Text>
              </>
            ) : (
              <Text style={styles.hintText}>No cards added yet — add one in Wealth to link this expense to a card balance.</Text>
            )
          ) : null}

          {paymentSource === 'loan' ? (
            nonCreditLiabilities.length > 0 ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {nonCreditLiabilities.map((l) => (
                    <TouchableOpacity
                      key={l.id}
                      style={[styles.categoryChip, liabilityId === l.id ? styles.categoryChipActive : null]}
                      onPress={() => setLiabilityId(l.id)}
                    >
                      <Text style={[styles.categoryText, liabilityId === l.id ? styles.categoryTextActive : null]}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.hintText}>This liability's balance will increase to reflect the new debt.</Text>
              </>
            ) : (
              <Text style={styles.hintText}>No loans added yet — add one in Wealth to link this expense to a liability.</Text>
            )
          ) : null}
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Date</Text>
      <View style={styles.presetRow}>
        {DATE_PRESETS.map((preset) => {
          const presetParts = dateParts(new Date(Date.now() - preset.daysAgo * 86400000));
          const active = day === presetParts.day && month === presetParts.month && year === presetParts.year;
          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.presetChip, active ? styles.presetChipActive : null]}
              onPress={() => applyDatePreset(preset.daysAgo)}
            >
              <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>{preset.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.dateRow}>
        <TextInput style={styles.dateInput} placeholder="DD" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={day} onChangeText={setDay} maxLength={2} />
        <TextInput style={styles.dateInput} placeholder="MM" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={month} onChangeText={setMonth} maxLength={2} />
        <TextInput style={styles.dateInput} placeholder="YYYY" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={year} onChangeText={setYear} maxLength={4} returnKeyType="done" />
      </View>

      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete transaction</Text>
        </TouchableOpacity>
      ) : null}

      <AddWealthItemModal visible={addCashVisible} kind="asset" presetAssetType="cash" onClose={() => setAddCashVisible(false)} />
    </KeyboardSheet>
  );
}
