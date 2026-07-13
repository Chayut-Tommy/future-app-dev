import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { useCelebration } from '../../state/CelebrationContext';
import { SectionCard } from '../shared/SectionCard';
import { ProgressBar } from '../shared/ProgressBar';
import { OptionsSheet } from '../shared/OptionsSheet';
import { EditProfileModal } from '../settings/EditProfileModal';
import { AddIncomeModal } from '../income/AddIncomeModal';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { AddRecurringItemModal } from '../money/AddRecurringItemModal';
import { DebtCoachSheet } from '../debt/DebtCoachSheet';
import { brand } from '../../lib/brand';

/**
 * "Let's build your money picture" — real guided onboarding continuation
 * (PRD ask): after the welcome flow, a brand-new user otherwise only sees
 * a bare "Add income" prompt. Each step is derived from actual data (never
 * a fabricated percentage), and tapping a step opens exactly the flow that
 * completes it. Not every user has every component (a student may have no
 * income, a young saver may only have cash) — income/assets steps offer an
 * honest "I don't have this yet" alternative that completes the step
 * without forcing a fake entry (PRD ask). Disappears once acknowledged
 * after full completion.
 */
export function MoneyPictureChecklistCard() {
  const { data, updateUser } = useAppState();
  const { celebrate } = useCelebration();
  const { colors, radius, spacing, typography } = useTheme();
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [incomeModalVisible, setIncomeModalVisible] = useState(false);
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const [assetModalVisible, setAssetModalVisible] = useState(false);
  const [debtCoachVisible, setDebtCoachVisible] = useState(false);
  const [incomeSheetVisible, setIncomeSheetVisible] = useState(false);
  const [assetsSheetVisible, setAssetsSheetVisible] = useState(false);
  const [billsSheetVisible, setBillsSheetVisible] = useState(false);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [mortgageModalVisible, setMortgageModalVisible] = useState(false);

  const hasCash = data.assets.some((a) => (a.type === 'cash' || a.type === 'savings') && a.currentValue > 0);
  const hasOtherAssets = data.assets.some((a) => a.type !== 'cash' && a.type !== 'savings' && a.currentValue > 0);
  const hasDebtAnswer = data.liabilities.some((l) => l.currentBalance > 0) || data.creditCards.some((c) => c.currentBalance > 0) || !!data.user.confirmedNoDebt;
  const hasIncome = data.user.monthlyIncome > 0 || !!data.user.confirmedNoIncome;
  const hasAssetsAnswer = hasOtherAssets || !!data.user.confirmedCashOnly;
  const hasBillsAnswer = data.recurringItems.some((r) => r.type === 'expense') || !!data.user.confirmedBillsLater;

  function handleIncomeStep() {
    setIncomeSheetVisible(true);
  }

  function handleAssetsStep() {
    setAssetsSheetVisible(true);
  }

  function handleBillsStep() {
    setBillsSheetVisible(true);
  }

  function handleIncomeSheetSelect(key: string) {
    if (key === 'add') setIncomeModalVisible(true);
    else if (key === 'none') updateUser({ confirmedNoIncome: true });
  }

  function handleAssetsSheetSelect(key: string) {
    if (key === 'add') setAssetModalVisible(true);
    else if (key === 'cash_only') updateUser({ confirmedCashOnly: true });
  }

  function handleBillsSheetSelect(key: string) {
    if (key === 'add') setBillModalVisible(true);
    else if (key === 'later') updateUser({ confirmedBillsLater: true });
  }

  const steps = [
    { key: 'goal', label: 'Set your goal', done: !!data.user.moneyGoal, onPress: () => setGoalModalVisible(true) },
    {
      key: 'income',
      label: !data.user.monthlyIncome && data.user.confirmedNoIncome ? 'No income yet — that\'s okay' : 'Tell me about your income',
      done: hasIncome,
      onPress: handleIncomeStep,
    },
    { key: 'cash', label: 'Add your savings', done: hasCash, onPress: () => setCashModalVisible(true) },
    {
      key: 'bills',
      label: !data.recurringItems.some((r) => r.type === 'expense') && data.user.confirmedBillsLater ? "I'll add bills later" : 'Add your essential bills',
      done: hasBillsAnswer,
      onPress: handleBillsStep,
    },
    {
      key: 'assets',
      label: !hasOtherAssets && data.user.confirmedCashOnly ? 'Cash only for now — that\'s okay' : 'Tell me about your assets',
      done: hasAssetsAnswer,
      onPress: handleAssetsStep,
    },
    {
      key: 'debt',
      label: data.user.confirmedNoDebt ? 'Debt-free — nice!' : 'Tell me about any debt you have',
      done: hasDebtAnswer,
      onPress: () => setDebtCoachVisible(true),
    },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  // Once complete, this card's job is done — the Navilo Score card already
  // communicates "Navilo understands your money picture" from here on, so a
  // permanent success card would just be redundant, space-taking chrome
  // (PRD ask). A single light-touch toast confirms the moment, then the
  // card removes itself for good — `moneyPictureChecklistDismissed` flips
  // true in this same effect, so there's no separate "Got it" tap required
  // and this only ever fires once.
  useEffect(() => {
    if (allDone && !data.user.moneyPictureChecklistDismissed) {
      celebrate({ id: 'money_picture_complete', tier: 'small', icon: 'sparkles', title: `${brand.name} now understands your money picture.`, body: '' });
      updateUser({ moneyPictureChecklistDismissed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        title: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginBottom: 2, flex: 1 },
        subtitle: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
        progressWrap: { marginBottom: spacing.md },
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
        rowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, flex: 1 },
        rowLabelDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
      }),
    [colors, radius, spacing, typography]
  );

  if (data.user.moneyPictureChecklistDismissed || allDone) return null;

  return (
    <SectionCard>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Great start 👋 Let's build your money picture.</Text>
        <TouchableOpacity
          onPress={() => updateUser({ moneyPictureChecklistDismissed: true })}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>The more {brand.name} knows, the better it can guide you.</Text>
      <View style={styles.progressWrap}>
        <ProgressBar progress={completedCount / steps.length} />
      </View>
      {steps.map((s) => (
        <TouchableOpacity key={s.key} style={styles.row} activeOpacity={0.7} onPress={s.onPress}>
          <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={s.done ? colors.accent : colors.textMuted} />
          <Text style={[styles.rowLabel, s.done ? styles.rowLabelDone : null]}>{s.label}</Text>
          {!s.done ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
        </TouchableOpacity>
      ))}

      <EditProfileModal visible={goalModalVisible} onClose={() => setGoalModalVisible(false)} />
      <AddIncomeModal visible={incomeModalVisible} onClose={() => setIncomeModalVisible(false)} />
      <AddWealthItemModal visible={cashModalVisible} kind="asset" presetAssetType="savings" onClose={() => setCashModalVisible(false)} />
      <AddWealthItemModal visible={assetModalVisible} kind="asset" presetAssetType="etf" onClose={() => setAssetModalVisible(false)} />
      <AddRecurringItemModal
        visible={billModalVisible}
        onClose={() => setBillModalVisible(false)}
        onSelectMortgage={() => setMortgageModalVisible(true)}
      />
      <AddWealthItemModal
        visible={mortgageModalVisible}
        kind="liability"
        presetLiabilityType="mortgage"
        onClose={() => setMortgageModalVisible(false)}
      />
      <DebtCoachSheet visible={debtCoachVisible} onClose={() => setDebtCoachVisible(false)} />
      <OptionsSheet
        visible={incomeSheetVisible}
        onClose={() => setIncomeSheetVisible(false)}
        title="💼 Add your income"
        subtitle={`Tell ${brand.name} what comes in so we can build your money plan.`}
        options={[
          { key: 'add', icon: 'cash-outline', label: 'Add income', description: 'Salary, side income, or anything regular' },
          { key: 'none', icon: 'ellipse-outline', label: "I don't have income yet", description: `That's okay — ${brand.name} will adjust` },
        ]}
        onSelect={handleIncomeSheetSelect}
      />
      <OptionsSheet
        visible={assetsSheetVisible}
        onClose={() => setAssetsSheetVisible(false)}
        title="📈 Add your assets"
        subtitle="Investments, property, or anything else building your wealth."
        options={[
          { key: 'add', icon: 'trending-up-outline', label: 'Add assets', description: 'Investments, property, super, and more' },
          { key: 'cash_only', icon: 'wallet-outline', label: 'I only have cash right now', description: "That's a perfectly good place to start" },
        ]}
        onSelect={handleAssetsSheetSelect}
      />
      <OptionsSheet
        visible={billsSheetVisible}
        onClose={() => setBillsSheetVisible(false)}
        title="📅 Add your essential bills"
        subtitle={`Adding your regular bills helps ${brand.name} estimate what may remain before your next payday.`}
        options={[
          { key: 'add', icon: 'calendar-outline', label: 'Add a bill', description: 'Rent, subscriptions, or anything recurring' },
          { key: 'later', icon: 'ellipse-outline', label: "I'll add these later", description: 'No problem — you can add bills anytime' },
        ]}
        onSelect={handleBillsSheetSelect}
      />
    </SectionCard>
  );
}
