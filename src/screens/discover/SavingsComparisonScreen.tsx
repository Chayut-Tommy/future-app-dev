import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { Button } from '../../components/shared/Button';
import { KeyboardSheet } from '../../components/shared/KeyboardSheet';
import { findSavingsAsset, computeSavingsSummary, rankSavingsOptions, computePotentialImprovement } from '../../lib/calculations/savingsCoach';
import { SavingsComparisonEntry } from '../../types/models';
import { EducationalNote } from '../../components/shared/EducationalNote';
import { brand } from '../../lib/brand';

export function SavingsComparisonScreen() {
  const { data, addSavingsComparison, updateSavingsComparison, deleteSavingsComparison } = useAppState();
  const navigation = useNavigation<any>();
  const { colors, radius, spacing, typography, cardShadow } = useTheme();
  const [editEntry, setEditEntry] = useState<SavingsComparisonEntry | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [bankName, setBankName] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  const isEditing = !!editEntry;

  // Standalone calculator — works even with no savings account added yet.
  const [calcBalance, setCalcBalance] = useState('');
  const [calcRate, setCalcRate] = useState('');

  const savingsAsset = findSavingsAsset(data.assets);
  const ranked = useMemo(() => rankSavingsOptions(data.assets, data.savingsComparisons), [data.assets, data.savingsComparisons]);
  const potentialImprovement = useMemo(() => computePotentialImprovement(ranked), [ranked]);
  const MEDALS = ['🥇', '🥈', '🥉'];

  const calcBalanceValue = parseFloat(calcBalance) || 0;
  const calcRateValue = (parseFloat(calcRate) || 0) / 100;
  const calcAnnual = calcBalanceValue * calcRateValue;

  const sheetVisible = addVisible || isEditing;

  useEffect(() => {
    if (!sheetVisible) return;
    if (editEntry) {
      setBankName(editEntry.bankName);
      setRate(String(Math.round(editEntry.rate * 10000) / 100));
      setNotes(editEntry.notes ?? '');
    } else {
      setBankName('');
      setRate('');
      setNotes('');
    }
  }, [sheetVisible, editEntry]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        disclaimer: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.md,
          marginBottom: spacing.lg,
        },
        disclaimerText: { ...typography.micro, color: colors.textSecondary, flex: 1 },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm },
        row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
        input: {
          flex: 1,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          fontSize: 15,
          color: colors.textPrimary,
        },
        calcResult: { ...typography.title, fontSize: 22, color: colors.textPrimary },
        calcResultLabel: { ...typography.micro, color: colors.textSecondary, marginBottom: 2 },
        entryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 14,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        entryRowCurrent: { borderWidth: 1.5, borderColor: colors.accent },
        entryMedal: { fontSize: 20, marginRight: spacing.sm },
        entryBody: { flex: 1 },
        entryBank: { ...typography.heading, fontSize: 14, color: colors.textPrimary },
        entryDetail: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
        entryDelta: { ...typography.heading, fontSize: 14, color: colors.success, marginRight: spacing.sm },
        currentBadge: { ...typography.micro, fontSize: 10, color: colors.accentStrong, fontWeight: '700', marginTop: 2 },
        improvementBox: { backgroundColor: colors.accentSoft, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md },
        improvementTitle: { ...typography.body, fontSize: 14, color: colors.accentStrong, fontWeight: '700', marginBottom: 2 },
        improvementBody: { ...typography.caption, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
        modalLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
        modalInput: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
        },
        footerButton: { flex: 1 },
        deleteButton: { alignSelf: 'center', marginTop: spacing.lg },
        deleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  function closeSheet() {
    setAddVisible(false);
    setEditEntry(null);
  }

  function handleSave() {
    const rateValue = parseFloat(rate);
    if (!bankName.trim() || isNaN(rateValue)) return;
    const payload = { bankName: bankName.trim(), rate: rateValue / 100, notes: notes.trim() || undefined };
    if (editEntry) updateSavingsComparison(editEntry.id, payload);
    else addSavingsComparison(payload);
    closeSheet();
  }

  function handleDelete() {
    if (editEntry) deleteSavingsComparison(editEntry.id);
    closeSheet();
  }

  return (
    <Screen title="Compare Savings" onBack={() => navigation.goBack()}>
      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.disclaimerText}>
          {brand.name} doesn't have live bank rates — add accounts you've researched yourself and {brand.name} will do the maths.
        </Text>
      </View>
      <EducationalNote text="Educational comparison only — not a personal product recommendation." />

      <SectionCard>
        <Text style={styles.sectionTitle}>Monthly interest calculator</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Balance"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={calcBalance}
            onChangeText={setCalcBalance}
            clearButtonMode="while-editing"
          />
          <TextInput
            style={styles.input}
            placeholder="Rate %"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={calcRate}
            onChangeText={setCalcRate}
            clearButtonMode="while-editing"
          />
        </View>
        <Text style={styles.calcResultLabel}>Estimated interest</Text>
        <Text style={styles.calcResult}>${Math.round(calcAnnual).toLocaleString()}/yr · ${Math.round(calcAnnual / 12).toLocaleString()}/mo</Text>
      </SectionCard>

      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg }]}>
        <Text style={styles.sectionTitle}>Accounts you're comparing</Text>
        <TouchableOpacity onPress={() => setAddVisible(true)}>
          <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {data.savingsComparisons.length === 0 ? (
        <SectionCard>
          <Text style={{ ...typography.caption, fontSize: 13, color: colors.textSecondary }}>
            Add a bank and rate you've found to see how it stacks up against your current account.
          </Text>
        </SectionCard>
      ) : (
        <>
          {potentialImprovement ? (
            <View style={styles.improvementBox}>
              <Text style={styles.improvementTitle}>Potential improvement: +${Math.round(potentialImprovement).toLocaleString()}/year</Text>
              <Text style={styles.improvementBody}>
                Switching to {ranked[0].label} could earn you approximately +${Math.round(potentialImprovement).toLocaleString()} extra
                a year, on your current balance.
              </Text>
            </View>
          ) : null}
          {ranked.map((option, index) => {
            const comparisonEntry = data.savingsComparisons.find((c) => c.id === option.id);
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.entryRow, option.isCurrent ? styles.entryRowCurrent : null]}
                activeOpacity={comparisonEntry ? 0.7 : 1}
                disabled={!comparisonEntry}
                onPress={() => comparisonEntry && setEditEntry(comparisonEntry)}
              >
                {index < 3 ? <Text style={styles.entryMedal}>{MEDALS[index]}</Text> : null}
                <View style={styles.entryBody}>
                  <Text style={styles.entryBank}>{option.label}</Text>
                  <Text style={styles.entryDetail}>
                    {(option.rate * 100).toFixed(2)}% · ${Math.round(option.annualInterest).toLocaleString()}/year interest
                    {comparisonEntry?.notes ? ` · ${comparisonEntry.notes}` : ''}
                  </Text>
                  {option.isCurrent ? <Text style={styles.currentBadge}>YOUR CURRENT ACCOUNT</Text> : null}
                </View>
                {comparisonEntry ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <KeyboardSheet
        visible={sheetVisible}
        onClose={closeSheet}
        title={isEditing ? 'Edit account' : 'Add an account to compare'}
        footer={
          <>
            <Button label="Cancel" variant="secondary" onPress={closeSheet} style={styles.footerButton} />
            <Button label="Save" onPress={handleSave} disabled={!bankName.trim() || isNaN(parseFloat(rate))} style={styles.footerButton} />
          </>
        }
      >
        <Text style={styles.modalLabel}>Bank / account name</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="e.g. Bank X — Online Saver"
          placeholderTextColor={colors.textMuted}
          value={bankName}
          onChangeText={setBankName}
          clearButtonMode="while-editing"
        />
        <Text style={styles.modalLabel}>Interest rate (%)</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="4.85"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={rate}
          onChangeText={setRate}
          clearButtonMode="while-editing"
        />
        <Text style={styles.modalLabel}>Bonus conditions (optional)</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="e.g. requires $1k monthly deposit"
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          returnKeyType="done"
          clearButtonMode="while-editing"
        />
        {isEditing ? (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete account</Text>
          </TouchableOpacity>
        ) : null}
      </KeyboardSheet>
    </Screen>
  );
}
