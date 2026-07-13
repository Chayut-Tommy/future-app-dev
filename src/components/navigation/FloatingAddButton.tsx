import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { AddAnythingSheet, AddAnythingKind } from './AddAnythingSheet';
import { AddIncomeModal } from '../income/AddIncomeModal';
import { QuickAddModal } from '../dashboard/QuickAddModal';
import { AddRecurringItemModal } from '../money/AddRecurringItemModal';
import { AddWealthItemModal } from '../wealth/AddWealthItemModal';
import { AddCreditCardModal } from '../credit/AddCreditCardModal';
import { AddGoalModal } from '../goals/AddGoalModal';
import { TransferModal } from '../wealth/TransferModal';
import { AssetType } from '../../types/models';

const TAB_BAR_CLEARANCE = Platform.OS === 'ios' ? 104 : 80;
// Deliberately larger than any tab bar icon (22px) so "+" unmistakably
// reads as the primary action rather than a fifth tab (PRD ask, §13:
// "clearly the primary action").
const BUTTON_SIZE = 64;

/**
 * The global "+" — reachable from every tab, not just Today (PRD ask:
 * "adding info is core and should be accessible everywhere"). Centred on
 * the horizontal midpoint between the two left tabs (Today/Wealth) and the
 * two right tabs (Money/Grow) — the natural "primary action" slot in a
 * 4-tab layout — rather than tucked in a corner, so it's reachable with
 * one thumb from either hand and reads as deliberate, not an afterthought
 * (PRD ask, §13).
 */
export function FloatingAddButton() {
  const { spacing, colors, glow } = useTheme();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [incomeVisible, setIncomeVisible] = useState(false);
  const [incomeReceivedVisible, setIncomeReceivedVisible] = useState(false);
  const [expenseVisible, setExpenseVisible] = useState(false);
  const [billVisible, setBillVisible] = useState(false);
  const [transferVisible, setTransferVisible] = useState(false);
  const [goalVisible, setGoalVisible] = useState(false);
  const [creditCardVisible, setCreditCardVisible] = useState(false);
  const [mortgageVisible, setMortgageVisible] = useState(false);
  const [wealthModal, setWealthModal] = useState<{ kind: 'asset' | 'liability'; presetAssetType?: AssetType } | null>(null);

  function handleSelect(kind: AddAnythingKind) {
    switch (kind) {
      case 'income':
        setIncomeVisible(true);
        break;
      case 'income_received':
        setIncomeReceivedVisible(true);
        break;
      case 'expense':
        setExpenseVisible(true);
        break;
      case 'bill':
        setBillVisible(true);
        break;
      case 'transfer':
        setTransferVisible(true);
        break;
      case 'cash':
        setWealthModal({ kind: 'asset', presetAssetType: 'cash' });
        break;
      case 'savings':
        setWealthModal({ kind: 'asset', presetAssetType: 'savings' });
        break;
      case 'investment':
        setWealthModal({ kind: 'asset', presetAssetType: 'etf' });
        break;
      case 'property':
        setWealthModal({ kind: 'asset', presetAssetType: 'property' });
        break;
      case 'retirement':
        setWealthModal({ kind: 'asset', presetAssetType: 'super' });
        break;
      case 'liability':
        setWealthModal({ kind: 'liability' });
        break;
      case 'creditCard':
        setCreditCardVisible(true);
        break;
      case 'goal':
        setGoalVisible(true);
        break;
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          position: 'absolute',
          left: '50%',
          marginLeft: -BUTTON_SIZE / 2,
          bottom: TAB_BAR_CLEARANCE - 12,
        },
        button: {
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 4,
          borderColor: colors.background,
          ...glow(colors.accent),
        },
      }),
    [spacing, colors, glow]
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      <TouchableOpacity style={styles.button} onPress={() => setSheetVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={34} color={colors.onAccent} />
      </TouchableOpacity>
      <AddAnythingSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onSelect={handleSelect} />
      <AddIncomeModal visible={incomeVisible} onClose={() => setIncomeVisible(false)} />
      <QuickAddModal visible={expenseVisible} onClose={() => setExpenseVisible(false)} />
      <QuickAddModal visible={incomeReceivedVisible} onClose={() => setIncomeReceivedVisible(false)} initialType="income" />
      <AddRecurringItemModal visible={billVisible} onClose={() => setBillVisible(false)} onSelectMortgage={() => setMortgageVisible(true)} />
      <AddWealthItemModal visible={mortgageVisible} kind="liability" presetLiabilityType="mortgage" onClose={() => setMortgageVisible(false)} />
      <TransferModal visible={transferVisible} onClose={() => setTransferVisible(false)} />
      <AddGoalModal visible={goalVisible} onClose={() => setGoalVisible(false)} />
      <AddWealthItemModal
        visible={wealthModal !== null}
        kind={wealthModal?.kind ?? null}
        presetAssetType={wealthModal?.presetAssetType}
        onSelectCreditCard={() => {
          setWealthModal(null);
          setCreditCardVisible(true);
        }}
        onClose={() => setWealthModal(null)}
      />
      <AddCreditCardModal visible={creditCardVisible} onClose={() => setCreditCardVisible(false)} />
    </View>
  );
}
