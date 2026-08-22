import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { Button } from '../../components/shared/Button';
import { KeyboardSheet } from '../../components/shared/KeyboardSheet';
import { TextField } from '../../components/shared/fields/TextField';
import { CurrencyField } from '../../components/shared/fields/CurrencyField';
import {
  CalculatorGuidance,
  CalculatorIntro,
  CalculatorSection,
  useCalculatorLocale,
} from '../../components/discover/calculator/CalculatorSurfaces';
import { findSavingsAsset, computeSavingsSummary, rankSavingsOptions, computePotentialImprovement } from '../../lib/calculations/savingsCoach';
import {
  calculatorGuidance,
  classifyMoneyInput,
  classifyNumberInput,
  combineCalculatorFields,
} from '../../lib/calculations/calculatorInputPresentation';
import { SavingsComparisonEntry } from '../../types/models';
import { EducationalNote } from '../../components/shared/EducationalNote';
import { brand } from '../../lib/brand';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import { fontFamilyForWeight } from '../../theme/typography';

/**
 * Savings Comparison — Design 5.1 Wave 9a.
 *
 * The comparison engine (savingsCoach.ts), the account/rate behaviour, the
 * add/edit/delete flow and its existing Save validation contract are all
 * untouched. Presentation changed: the screen states up front that it
 * compares rates the customer entered themselves (no live bank rates, no
 * product recommendation), the medal emoji become restrained rank markers,
 * the inline interest calculator shows guidance instead of a fabricated $0
 * for empty or unreadable input, and everything speaks the semantic type
 * and colour roles through the accepted shared field system.
 */
export function SavingsComparisonScreen() {
  const { data, addSavingsComparison, updateSavingsComparison, deleteSavingsComparison } = useAppState();
  const navigation = useNavigation<any>();
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
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

  // Structured classification for the inline calculator — never
  // parseFloat, never a fabricated $0 for empty or unreadable input. The
  // same annual-interest arithmetic as before runs only on valid values.
  const balanceState = classifyMoneyInput(calcBalance, { allowZero: true });
  const rateState = classifyNumberInput(calcRate, { allowZero: true });
  const calcReadiness = combineCalculatorFields([balanceState, rateState]);
  const calcGuidance = calculatorGuidance(calcReadiness);
  const calcAnnual =
    balanceState.status === 'valid' && rateState.status === 'valid' ? balanceState.value * (rateState.value / 100) : null;

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
        sectionHeaderRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: designSpacing.md,
          marginTop: designSpacing.xl,
          marginBottom: designSpacing.sm,
          minHeight: designLayout.touchTargetMin,
        },
        sectionTitle: { ...typeStyle('titleSection', locale), color: semantic.textTitle, flexShrink: 1 },
        addAction: {
          minHeight: designLayout.touchTargetMin,
          minWidth: designLayout.touchTargetMin,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: designSpacing.sm,
        },
        addActionText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
        calcRow: { flexDirection: 'row', gap: designSpacing.sm },
        calcField: { flex: 1 },
        calcResultLabel: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginBottom: 2 },
        calcResult: { ...typeStyle('figureLarge', locale), color: semantic.textFigure },
        emptyText: { ...typeStyle('support', locale), color: semantic.textSecondary },
        entryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.md,
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
          minHeight: 56,
        },
        entryRowCurrent: { borderWidth: 1.5, borderColor: semantic.interactive },
        rankTile: {
          width: 28,
          height: 28,
          borderRadius: designRadius.tile,
          backgroundColor: semantic.bgRaised,
          alignItems: 'center',
          justifyContent: 'center',
        },
        rankText: { ...typeStyle('meta', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600', color: semantic.textSecondary },
        entryBody: { flex: 1 },
        entryBank: { ...typeStyle('titleCard', locale), color: semantic.textPrimary },
        entryDetail: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
        currentBadge: {
          ...typeStyle('eyebrow', locale),
          color: semantic.interactive,
          marginTop: designSpacing.xs,
        },
        improvementBox: {
          backgroundColor: semantic.interactiveTint,
          borderRadius: designRadius.control,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
        },
        improvementTitle: {
          ...typeStyle('support', locale),
          fontFamily: fontFamilyForWeight(700, locale),
          fontWeight: '700',
          color: semantic.interactive,
          marginBottom: 2,
        },
        improvementBody: { ...typeStyle('support', locale), color: semantic.textSecondary },
        footerButton: { flex: 1 },
        deleteButton: {
          alignSelf: 'center',
          marginTop: designSpacing.lg,
          minHeight: designLayout.touchTargetMin,
          justifyContent: 'center',
          paddingHorizontal: designSpacing.lg,
        },
        deleteText: { ...typeStyle('support', locale), fontFamily: fontFamilyForWeight(600, locale), fontWeight: '600', color: semantic.urgentText },
      }),
    [semantic, locale]
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
      <CalculatorIntro
        text={`Compares savings rates you enter yourself — ${brand.name} doesn't have live bank rates. Add accounts you've researched and ${brand.name} will do the maths.`}
      />
      <EducationalNote text="Educational comparison only — not a personal product recommendation." />

      <CalculatorSection title="Monthly interest calculator">
        <View style={styles.calcRow}>
          <CurrencyField
            label="Balance"
            value={calcBalance}
            onChangeText={setCalcBalance}
            allowZero
            containerStyle={styles.calcField}
            accessibilityLabel="Balance in dollars"
          />
          <TextField
            label="Rate %"
            value={calcRate}
            onChangeText={setCalcRate}
            figures
            keyboardType="decimal-pad"
            returnKeyType="done"
            containerStyle={styles.calcField}
            accessibilityLabel="Interest rate in percent per year"
          />
        </View>
        {calcAnnual !== null ? (
          <View accessible accessibilityLabel={`Estimated interest $${Math.round(calcAnnual).toLocaleString()} per year, $${Math.round(calcAnnual / 12).toLocaleString()} per month`}>
            <Text style={styles.calcResultLabel}>Estimated interest</Text>
            <Text style={styles.calcResult} testID="savings-calc-result">
              ${Math.round(calcAnnual).toLocaleString()}/yr · ${Math.round(calcAnnual / 12).toLocaleString()}/mo
            </Text>
          </View>
        ) : calcGuidance ? (
          <CalculatorGuidance text={calcGuidance} testID="savings-calc-guidance" />
        ) : null}
      </CalculatorSection>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Accounts you're comparing
        </Text>
        <TouchableOpacity
          style={styles.addAction}
          onPress={() => setAddVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Add an account to compare"
        >
          <Text style={styles.addActionText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {data.savingsComparisons.length === 0 ? (
        <CalculatorSection>
          <Text style={styles.emptyText}>Add a bank and rate you've found to see how it stacks up against your current account.</Text>
        </CalculatorSection>
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
                {index < 3 ? (
                  <View style={styles.rankTile} importantForAccessibility="no-hide-descendants">
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                ) : null}
                <View style={styles.entryBody}>
                  <Text style={styles.entryBank}>{option.label}</Text>
                  <Text style={styles.entryDetail}>
                    {(option.rate * 100).toFixed(2)}% · ${Math.round(option.annualInterest).toLocaleString()}/year interest
                    {comparisonEntry?.notes ? ` · ${comparisonEntry.notes}` : ''}
                  </Text>
                  {option.isCurrent ? <Text style={styles.currentBadge}>Your current account</Text> : null}
                </View>
                {comparisonEntry ? <Ionicons name="chevron-forward" size={16} color={semantic.textTertiary} importantForAccessibility="no" /> : null}
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
        <TextField
          label="Bank / account name"
          placeholder="e.g. Bank X — Online Saver"
          value={bankName}
          onChangeText={setBankName}
          clearButtonMode="while-editing"
        />
        <TextField
          label="Interest rate (%)"
          placeholder="4.85"
          figures
          keyboardType="decimal-pad"
          value={rate}
          onChangeText={setRate}
          clearButtonMode="while-editing"
        />
        <TextField
          label="Bonus conditions (optional)"
          placeholder="e.g. requires $1k monthly deposit"
          value={notes}
          onChangeText={setNotes}
          returnKeyType="done"
          clearButtonMode="while-editing"
        />
        {isEditing ? (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete account">
            <Text style={styles.deleteText}>Delete account</Text>
          </TouchableOpacity>
        ) : null}
      </KeyboardSheet>
    </Screen>
  );
}
