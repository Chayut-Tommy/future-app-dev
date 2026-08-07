import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { AddAnythingSheet } from './AddAnythingSheet';

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
 *
 * Full-workspace extension — every one of AddAnythingSheet's thirteen
 * tiles now transitions, inside that one persistent sheet, into its own
 * embedded destination form. This component no longer owns any of the
 * eight separate standalone Modals (Income/Expense/Income received/Bill/
 * Transfer/Liability handoff/Wealth/Credit card/Goal) it used to mount
 * alongside AddAnythingSheet as a dismiss-and-defer fallback — that
 * mechanism, and the onSelect callback it depended on, are fully retired.
 */
export function FloatingAddButton() {
  const { colors, glow } = useTheme();
  const [sheetVisible, setSheetVisible] = useState(false);

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
    [colors, glow]
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      <TouchableOpacity style={styles.button} onPress={() => setSheetVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={34} color={colors.onAccent} />
      </TouchableOpacity>
      <AddAnythingSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}
