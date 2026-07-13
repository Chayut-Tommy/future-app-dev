import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { AskLuluSheet } from './AskLuluSheet';

// Matches the tab bar height set in MainTabNavigator (88 iOS / 64 Android)
// plus a comfortable gap, so the button always floats just above the tabs
// regardless of device safe-area inset.
const TAB_BAR_CLEARANCE = Platform.OS === 'ios' ? 104 : 80;

/**
 * Persistent floating "Talk to Lulu" bubble — never a tab (PRD §3.5).
 * Deliberately smaller and icon-only, and now in its own bottom-right
 * corner rather than beside the "+" button, since "+" moved to the
 * horizontal centre between the tab pairs to read as the single primary
 * action (PRD ask, §13) — keeping Lulu here avoids the two competing for
 * the same visual slot. Rendered at the root, outside the tab navigator,
 * so it survives tab switches.
 */
export function FloatingLuluButton() {
  const { spacing, glow, aiAccentColor, aiCardGradient, onAiAccent } = useTheme();
  const [sheetVisible, setSheetVisible] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          position: 'absolute',
          right: spacing.lg,
          bottom: TAB_BAR_CLEARANCE,
        },
        button: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          ...glow(aiAccentColor),
        },
      }),
    [spacing, glow, aiAccentColor]
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      <TouchableOpacity onPress={() => setSheetVisible(true)} activeOpacity={0.85}>
        <LinearGradient colors={aiCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          <Ionicons name="sparkles" size={18} color={onAiAccent} />
        </LinearGradient>
      </TouchableOpacity>
      <AskLuluSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}
