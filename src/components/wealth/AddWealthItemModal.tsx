import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Asset, AssetType, Liability, LiabilityType, PayFrequency } from '../../types/models';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { confirmDiscardIfDirty } from '../../lib/discardConfirmation';
import { brand } from '../../lib/brand';

const LOAN_BILL_LABELS: Partial<Record<LiabilityType, string>> = {
  mortgage: 'Home Loan Repayment',
  car_loan: 'Car Loan Repayment',
  personal_loan: 'Personal Loan Repayment',
};

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'savings', label: 'Savings' },
  { value: 'etf', label: 'ETF' },
  { value: 'shares', label: 'Shares' },
  { value: 'super', label: 'Retirement Savings' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'property', label: 'Property' },
  { value: 'car', label: 'Car' },
  { value: 'business', label: 'Business' },
  { value: 'furniture', label: 'Furniture/Valuables' },
  { value: 'collectibles', label: 'Collectibles/Luxury' },
  { value: 'other', label: 'Other' },
];

// A friendlier, grouped entry point (PRD ask: "beautiful selectable cards"
// instead of text-first) — picking a card lands on the matching type chip
// below, which still lets the user refine e.g. Investments into ETF vs.
// Shares vs. Crypto. Wealth Map calculations are untouched; this only
// changes how picking an asset type feels.
const ASSET_CARD_GROUPS: { value: AssetType; emoji: string; label: string; description: string }[] = [
  { value: 'cash', emoji: '💵', label: 'Cash', description: 'Money in your wallet' },
  { value: 'savings', emoji: '🏦', label: 'Savings', description: 'Money earning interest' },
  { value: 'etf', emoji: '📈', label: 'Investments', description: 'Stocks, ETFs, crypto, funds' },
  { value: 'property', emoji: '🏠', label: 'Property', description: 'Home or investment property' },
  { value: 'super', emoji: '🛡', label: 'Retirement Savings', description: 'Superannuation, 401(k), IRA, pension' },
  { value: 'car', emoji: '🚗', label: 'Vehicle', description: 'Car, motorbike, boat' },
  { value: 'other', emoji: '💎', label: 'Other assets', description: 'Everything else you own' },
];

const LIABILITY_TYPES: { value: LiabilityType; label: string }[] = [
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'car_loan', label: 'Car loan' },
  { value: 'personal_loan', label: 'Personal loan' },
  { value: 'other', label: 'Other' },
];

const REPAYMENT_FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

/** Never assume a repayment is due today or one month from today (PRD ask,
 * §B4) — this only runs once the user has actually chosen a day. */
function nextOccurrenceFromDay(dayOfMonth: number): string {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (candidate.getTime() < now.getTime()) candidate.setMonth(candidate.getMonth() + 1);
  return candidate.toISOString();
}

export function AddWealthItemModal({
  visible,
  kind,
  editAsset,
  editLiability,
  presetAssetType,
  presetLiabilityType,
  onSelectCreditCard,
  onClose,
}: {
  visible: boolean;
  kind: 'asset' | 'liability' | null;
  /** Present = editing this existing asset instead of creating a new one. */
  editAsset?: Asset | null;
  editLiability?: Liability | null;
  /** Pre-select a type when opening to add — e.g. tapping an empty "Property"
   * category on the Wealth Map lands straight on the Property type chip. */
  presetAssetType?: AssetType;
  /** Same idea for liabilities — e.g. Debt Coach's "what kind of debt?"
   * chooser lands straight on the matching type chip. */
  presetLiabilityType?: LiabilityType;
  /** Credit cards need their own fields (limit, due day, minimum payment)
   * that don't fit this generic form — picking "Credit card" here hands
   * off to the dedicated AddCreditCardModal instead (PRD ask: credit card
   * is just one of the liability types you can add, not a separate flow
   * to discover). */
  onSelectCreditCard?: () => void;
  onClose: () => void;
}) {
  const { data, addAsset, updateAsset, deleteAsset, addLiability, updateLiability, deleteLiability, linkBillToLiability, addMortgageWithProperty } =
    useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [liabilityInterestRate, setLiabilityInterestRate] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('cash');
  const [liabilityType, setLiabilityType] = useState<LiabilityType>('personal_loan');
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentFrequency, setRepaymentFrequency] = useState<PayFrequency>('monthly');
  // Never assume a repayment is due today or one month from today (PRD
  // ask, §B4) — the user picks a real day of month, or explicitly defers
  // scheduling it. Both start unset so nothing is silently pre-filled.
  const [repaymentDayOfMonth, setRepaymentDayOfMonth] = useState('');
  const [addRepaymentLater, setAddRepaymentLater] = useState(false);
  const [propertyLinkMode, setPropertyLinkMode] = useState<'none' | 'existing' | 'new'>('none');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [newPropertyValue, setNewPropertyValue] = useState('');
  // Category-first, like the other add flows (PRD ask) — only for a brand
  // new asset with no preset already chosen (most entry points already
  // preset a type, e.g. tapping "Property" on the Wealth Map, so there's
  // nothing to pick). Liabilities keep their existing single-step flow.
  const [formStep, setFormStep] = useState<'category' | 'details'>('details');
  const initialSnapshot = useRef({ label: '', value: '', interestRate: '' });

  const isNewLoan = kind === 'liability' && liabilityType in LOAN_BILL_LABELS && !editLiability;
  // A mortgage can be secured against a property (PRD ask: "$1M property,
  // $500k mortgage" is a very different picture than "$500k unsecured
  // debt"). New properties are only created on the add-mortgage path — the
  // atomic addMortgageWithProperty call needs a single persist(), and
  // editing an existing liability already has that guarantee via
  // updateLiability, so editing only re-links to an existing property.
  const isMortgage = kind === 'liability' && liabilityType === 'mortgage';
  const propertyAssets = data.assets.filter((a) => a.type === 'property');

  const isEditing = !!(editAsset || editLiability);
  const isDirty =
    label !== initialSnapshot.current.label ||
    value !== initialSnapshot.current.value ||
    interestRate !== initialSnapshot.current.interestRate;

  useEffect(() => {
    if (!visible) return;
    if (editAsset) {
      setLabel(editAsset.label);
      setValue(String(editAsset.currentValue));
      setAssetType(editAsset.type);
      const rate = editAsset.interestRate ? String(Math.round(editAsset.interestRate * 10000) / 100) : '';
      setInterestRate(rate);
      initialSnapshot.current = { label: editAsset.label, value: String(editAsset.currentValue), interestRate: rate };
    } else if (editLiability) {
      setLabel(editLiability.label);
      setValue(String(editLiability.currentBalance));
      setLiabilityType(editLiability.type);
      setLiabilityInterestRate(editLiability.interestRate ? String(Math.round(editLiability.interestRate * 10000) / 100) : '');
      setPropertyLinkMode(editLiability.linkedPropertyAssetId ? 'existing' : 'none');
      setSelectedPropertyId(editLiability.linkedPropertyAssetId ?? null);
      setNewPropertyValue('');
      initialSnapshot.current = { label: editLiability.label, value: String(editLiability.currentBalance), interestRate: '' };
    } else {
      setLabel('');
      setValue('');
      setInterestRate('');
      setLiabilityInterestRate('');
      setAssetType(presetAssetType ?? 'cash');
      setLiabilityType(presetLiabilityType ?? 'personal_loan');
      setRepaymentAmount('');
      setRepaymentFrequency('monthly');
      setRepaymentDayOfMonth('');
      setAddRepaymentLater(false);
      setPropertyLinkMode('none');
      setSelectedPropertyId(null);
      setNewPropertyValue('');
      initialSnapshot.current = { label: '', value: '', interestRate: '' };
    }
    setFormStep(kind === 'asset' && !editAsset && !presetAssetType ? 'category' : 'details');
  }, [visible, kind, editAsset, editLiability, presetAssetType, presetLiabilityType]);

  function chooseAssetCategory(type: AssetType) {
    setAssetType(type);
    setFormStep('details');
  }

  const canSave = label.trim().length > 0 && !isNaN(parseFloat(value));
  const title =
    kind === 'asset'
      ? assetType === 'savings'
        ? isEditing
          ? 'Update savings account'
          : 'Add savings account'
        : assetType === 'cash'
        ? isEditing
          ? 'Update cash account'
          : 'Add cash account'
        : isEditing
        ? 'Edit asset'
        : 'Add asset'
      : isEditing
      ? 'Edit liability'
      : 'Add liability';

  // Used for KeyboardSheet's own onClose prop — its internal swipe/tap-
  // outside handlers already gate on `isDirty` before calling this, so
  // this must stay a raw close (no second confirmation).
  function handleClose() {
    onClose();
  }

  // Used by the footer Cancel button, a separate dismiss path that bypasses
  // KeyboardSheet's gesture handling entirely — needs its own gate.
  function requestCancel() {
    confirmDiscardIfDirty(isDirty, onClose);
  }

  function handleSave() {
    const amount = parseFloat(value);
    if (!canSave) return;
    if (kind === 'asset') {
      const rateValue = parseFloat(interestRate);
      const interestRatePayload =
        (assetType === 'cash' || assetType === 'savings') && !isNaN(rateValue) && rateValue >= 0 ? rateValue / 100 : undefined;
      if (editAsset) {
        updateAsset(editAsset.id, { type: assetType, label: label.trim(), currentValue: amount, interestRate: interestRatePayload });
      } else {
        addAsset({ type: assetType, label: label.trim(), currentValue: amount, interestRate: interestRatePayload });
      }
    } else if (kind === 'liability') {
      const liabRateValue = parseFloat(liabilityInterestRate);
      const liabInterestRatePayload = !isNaN(liabRateValue) && liabRateValue >= 0 ? liabRateValue / 100 : undefined;
      if (editLiability) {
        updateLiability(editLiability.id, {
          type: liabilityType,
          label: label.trim(),
          currentBalance: amount,
          interestRate: liabInterestRatePayload,
          linkedPropertyAssetId: isMortgage && propertyLinkMode === 'existing' ? selectedPropertyId ?? undefined : undefined,
        });
      } else if (isMortgage) {
        const repaymentValue = parseFloat(repaymentAmount);
        const repaymentDayValue = parseInt(repaymentDayOfMonth, 10);
        // Only creates a repayment bill once the user has actually chosen a
        // day — never silently assumes "due one month from today" (PRD bug
        // report, §B4). "I'll add this later" creates just the liability.
        const hasRepaymentSchedule =
          !addRepaymentLater && !isNaN(repaymentValue) && repaymentValue > 0 && repaymentDayValue >= 1 && repaymentDayValue <= 31;
        const newPropertyValueNum = parseFloat(newPropertyValue);
        const propertyLink: Parameters<typeof addMortgageWithProperty>[1] =
          propertyLinkMode === 'existing' && selectedPropertyId
            ? { mode: 'existing', assetId: selectedPropertyId }
            : propertyLinkMode === 'new' && !isNaN(newPropertyValueNum) && newPropertyValueNum > 0
            ? { mode: 'new', value: newPropertyValueNum, label: 'Property' }
            : { mode: 'none' };
        addMortgageWithProperty(
          { label: label.trim(), currentBalance: amount, interestRate: liabInterestRatePayload },
          propertyLink,
          hasRepaymentSchedule
            ? {
                type: 'expense',
                label: LOAN_BILL_LABELS.mortgage ?? 'Home Loan Repayment',
                amount: repaymentValue,
                frequency: repaymentFrequency,
                nextDueDate: nextOccurrenceFromDay(repaymentDayValue),
                isFixed: true,
                active: true,
                // Filled 'home', not the outline icon Rent uses — a
                // mortgage bill must never be visually confused with rent
                // (PRD bug report, §B4).
                icon: 'home',
              }
            : undefined
        );
      } else {
        const isLoan = liabilityType in LOAN_BILL_LABELS;
        // Smarter loan flow (PRD ask): a repayment amount plus a real
        // chosen day auto-creates the matching recurring bill, linked back
        // to this liability. Never silently assumes a due date (PRD bug
        // report, §B4) — "I'll add this later" skips bill creation.
        const repaymentValue = parseFloat(repaymentAmount);
        const repaymentDayValue = parseInt(repaymentDayOfMonth, 10);
        const hasRepaymentSchedule =
          isLoan && !addRepaymentLater && !isNaN(repaymentValue) && repaymentValue > 0 && repaymentDayValue >= 1 && repaymentDayValue <= 31;
        if (hasRepaymentSchedule) {
          // Atomic: creates (or reuses, never duplicates) the liability and
          // links this bill to it in one state write — addLiability then
          // addRecurringItem back-to-back silently drops the liability
          // (PRD bug report: "liability does not appear in Wealth").
          linkBillToLiability(
            { type: liabilityType, label: label.trim(), currentBalance: amount, interestRate: liabInterestRatePayload },
            {
              type: 'expense',
              label: LOAN_BILL_LABELS[liabilityType] ?? 'Loan Repayment',
              amount: repaymentValue,
              frequency: repaymentFrequency,
              nextDueDate: nextOccurrenceFromDay(repaymentDayValue),
              isFixed: true,
              active: true,
              icon: liabilityType === 'car_loan' ? 'car-outline' : 'document-text-outline',
            }
          );
        } else {
          addLiability({
            type: liabilityType,
            label: label.trim(),
            currentBalance: amount,
            interestRate: liabInterestRatePayload,
            createdAt: isLoan ? new Date().toISOString() : undefined,
          });
        }
      }
    }
    onClose();
  }

  function handleDelete() {
    if (editAsset) deleteAsset(editAsset.id);
    if (editLiability) deleteLiability(editLiability.id);
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        typeChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
        typeChipActive: { backgroundColor: colors.accentSoft },
        typeChipText: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        typeChipTextActive: { color: colors.accentStrong, fontWeight: '600' },
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          marginBottom: spacing.md,
          color: colors.textPrimary,
        },
        footerButton: { flex: 1 },
        deleteButton: { marginTop: spacing.sm },
        deleteText: { ...typography.caption, color: colors.danger, textAlign: 'center', fontWeight: '600' },
        row: { flexDirection: 'row', gap: spacing.sm },
        rowInput: { flex: 1 },
        helperBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        helperText: { ...typography.caption, fontSize: 12, color: colors.accentStrong, lineHeight: 17 },
        freqRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        freqChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
        freqChipActive: { backgroundColor: colors.accentSoft },
        freqText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        freqTextActive: { color: colors.accentStrong },
        deferRepaymentLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.md },
        deferRepaymentText: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
        categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
        categoryCard: {
          flexBasis: '46%',
          flexGrow: 1,
          alignItems: 'center',
          paddingVertical: spacing.lg,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        categoryCardEmoji: { fontSize: 30, marginBottom: spacing.xs },
        categoryCardLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, fontWeight: '700', marginBottom: 2 },
        categoryCardDescription: { ...typography.micro, fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
      }),
    [colors, radius, spacing, typography]
  );

  if (kind === 'asset' && formStep === 'category') {
    return (
      <KeyboardSheet
        visible={visible}
        onClose={onClose}
        isDirty={false}
        title="💎 What are you adding?"
        footer={<Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />}
      >
        <View style={styles.categoryGrid}>
          {ASSET_CARD_GROUPS.map((g) => (
            <TouchableOpacity key={g.value} style={styles.categoryCard} activeOpacity={0.8} onPress={() => chooseAssetCategory(g.value)}>
              <Text style={styles.categoryCardEmoji}>{g.emoji}</Text>
              <Text style={styles.categoryCardLabel}>{g.label}</Text>
              <Text style={styles.categoryCardDescription}>{g.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardSheet>
    );
  }

  return (
    <KeyboardSheet
      visible={visible}
      onClose={handleClose}
      isDirty={isDirty}
      title={title}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={requestCancel} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} disabled={!canSave} style={styles.footerButton} />
        </>
      }
    >
      <View style={styles.typeRow}>
        {(kind === 'asset' ? ASSET_TYPES : LIABILITY_TYPES).map((t) => {
          const active = kind === 'asset' ? assetType === t.value : liabilityType === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, active ? styles.typeChipActive : null]}
              onPress={() => {
                if (kind === 'liability' && t.value === 'credit_card') {
                  onClose();
                  onSelectCreditCard?.();
                  return;
                }
                if (kind === 'asset') setAssetType(t.value as AssetType);
                else setLiabilityType(t.value as LiabilityType);
              }}
            >
              <Text style={[styles.typeChipText, active ? styles.typeChipTextActive : null]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.label}>Label</Text>
      <TextInput
        style={styles.input}
        placeholder={kind === 'asset' ? 'e.g. Vanguard ETF' : 'e.g. Home loan'}
        placeholderTextColor={colors.textMuted}
        value={label}
        onChangeText={setLabel}
      />
      <Text style={styles.label}>Value</Text>
      <TextInput
        style={styles.input}
        placeholder="$0"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={setValue}
        returnKeyType="done"
      />
      {kind === 'asset' && (assetType === 'cash' || assetType === 'savings') ? (
        <>
          <Text style={styles.label}>Interest rate % (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 4.50"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={interestRate}
            onChangeText={setInterestRate}
            returnKeyType="done"
          />
        </>
      ) : null}
      {kind === 'liability' ? (
        <>
          <Text style={styles.label}>Interest rate % (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 6.50"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={liabilityInterestRate}
            onChangeText={setLiabilityInterestRate}
            returnKeyType="done"
          />
        </>
      ) : null}
      {isMortgage ? (
        <>
          <Text style={styles.label}>Is this linked to a property?</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeChip, propertyLinkMode === 'none' ? styles.typeChipActive : null]}
              onPress={() => setPropertyLinkMode('none')}
            >
              <Text style={[styles.typeChipText, propertyLinkMode === 'none' ? styles.typeChipTextActive : null]}>Not linked</Text>
            </TouchableOpacity>
            {propertyAssets.length > 0 ? (
              <TouchableOpacity
                style={[styles.typeChip, propertyLinkMode === 'existing' ? styles.typeChipActive : null]}
                onPress={() => setPropertyLinkMode('existing')}
              >
                <Text style={[styles.typeChipText, propertyLinkMode === 'existing' ? styles.typeChipTextActive : null]}>Existing property</Text>
              </TouchableOpacity>
            ) : null}
            {!editLiability ? (
              <TouchableOpacity
                style={[styles.typeChip, propertyLinkMode === 'new' ? styles.typeChipActive : null]}
                onPress={() => setPropertyLinkMode('new')}
              >
                <Text style={[styles.typeChipText, propertyLinkMode === 'new' ? styles.typeChipTextActive : null]}>Add property value</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {propertyLinkMode === 'existing' ? (
            <View style={styles.typeRow}>
              {propertyAssets.map((p) => {
                const active = selectedPropertyId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.typeChip, active ? styles.typeChipActive : null]}
                    onPress={() => setSelectedPropertyId(p.id)}
                  >
                    <Text style={[styles.typeChipText, active ? styles.typeChipTextActive : null]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {propertyLinkMode === 'new' ? (
            <>
              <Text style={styles.label}>Property value</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1,000,000"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={newPropertyValue}
                onChangeText={setNewPropertyValue}
                returnKeyType="done"
              />
            </>
          ) : null}
        </>
      ) : null}
      {isNewLoan ? (
        <>
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              Add your repayment amount and next repayment date and {brand.name} will automatically add "{LOAN_BILL_LABELS[liabilityType]}" to your Bills
              Calendar.
            </Text>
          </View>
          <Text style={styles.label}>Repayment amount (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 3,000"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={repaymentAmount}
            onChangeText={setRepaymentAmount}
            returnKeyType="done"
          />
          <Text style={styles.label}>Repayment frequency</Text>
          <View style={styles.freqRow}>
            {REPAYMENT_FREQUENCIES.map((f) => {
              const active = repaymentFrequency === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.freqChip, active ? styles.freqChipActive : null]}
                  onPress={() => setRepaymentFrequency(f.value)}
                >
                  <Text style={[styles.freqText, active ? styles.freqTextActive : null]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!addRepaymentLater ? (
            <>
              <Text style={styles.label}>When is your next repayment? (day of month)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 15"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={repaymentDayOfMonth}
                onChangeText={setRepaymentDayOfMonth}
                returnKeyType="done"
              />
            </>
          ) : null}
          <TouchableOpacity onPress={() => setAddRepaymentLater((v) => !v)} style={styles.deferRepaymentLink}>
            <Ionicons
              name={addRepaymentLater ? 'checkbox' : 'square-outline'}
              size={16}
              color={addRepaymentLater ? colors.accentStrong : colors.textMuted}
            />
            <Text style={styles.deferRepaymentText}>I'll add the repayment schedule later</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {isEditing ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete {kind}</Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardSheet>
  );
}
