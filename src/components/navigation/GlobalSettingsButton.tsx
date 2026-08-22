import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { HORIZONTAL_MARGIN } from '../../navigation/floatingNavGeometry';
import { SETTINGS_ACTION_SIZE, SETTINGS_TOP_OFFSET } from '../../navigation/globalSettingsGeometry';

/**
 * Nolie Design 5.1 Wave 8 correction — the ONE Settings action.
 *
 * ROOT CAUSE it fixes. Settings was reachable only from Today, through a
 * gear that TodayScreen owned and positioned itself. A customer on Money,
 * Wealth or Grow had no route to Settings at all, and on Today the gear sat
 * over scrolling content.
 *
 * WHY A ROOT SINGLETON. `RootNavigator` already resolves ONE `assembly`
 * from `resolveRootNavAssembly`, and both the dock and the "+" read it —
 * that is the app's single visibility authority for the persistent shell.
 * This control reads the SAME projection, so it can never disagree with
 * them about whether the shell exists: it is visible on exactly the routes
 * the dock is visible on (the four roots plus the six passive detail
 * routes), and hidden wherever the matrix already hides the assembly —
 * Settings itself, Language, Reset, the four calculators, Onboarding, any
 * blocking overlay, and whenever the keyboard is up.
 *
 * No new route list, no second selected-tab writer, no navigation ref.
 *
 * It is deliberately NOT a bare floating gear: it sits on an opaque
 * theme-aware surface with its own border, and `Screen` reserves matching
 * width in its title row (see `SETTINGS_HEADER_INSET`), so it never covers
 * a title, an amount, a Back control or the status bar.
 */
export function GlobalSettingsButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const { colors, semantic, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        /* Wave 8 closure — the control is a SELF-CONTAINED chip, not a
           band.

           The previous pass masked the whole top of the screen with a
           full-width `colors.background` gradient so scrolled content could
           not read through. On every root tab whose own top surface differs
           — Today's ambient field, Money's and Wealth's own headers — that
           painted a grey strip with a visible fade seam across the page and
           clipped the headings underneath. The mask was solving a problem
           the chip already solves: it is opaque, it sits above content in
           z-order, so nothing is legible or touchable beneath the gear
           itself, and `SETTINGS_HEADER_INSET` keeps every title clear of
           it. No decorative gradient, no seam. */
        layer: {
          position: 'absolute',
          top: insets.top + SETTINGS_TOP_OFFSET,
          right: HORIZONTAL_MARGIN,
          zIndex: 20,
          elevation: 20,
        },
        layerHidden: { opacity: 0 },
        button: {
          width: SETTINGS_ACTION_SIZE,
          height: SETTINGS_ACTION_SIZE,
          borderRadius: SETTINGS_ACTION_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          // Opaque, with its own edge — so it reads as a control sitting on
          // the surface rather than a glyph floating over whatever scrolls
          // beneath it.
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          // Lifts the chip off whatever scrolls beneath it, so it reads as
          // deliberate chrome at any scroll position — without painting
          // anything across the page.
          ...cardShadow,
        },
      }),
    [colors, cardShadow, insets.top]
  );

  /* Wave 8 closure — mounted always, gated visually, exactly like the dock
     and the "+". Unmounting made the three appear at different times. */
  return (
    <View
      style={[styles.layer, visible ? null : styles.layerHidden]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      testID="global-settings-layer"
    >
      <TouchableOpacity
        style={styles.button}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        accessibilityHint="Opens appearance, language and account settings."
        testID="global-settings-button"
      >
        <Ionicons name="settings-outline" size={20} color={semantic.interactive} accessibilityElementsHidden importantForAccessibility="no" />
      </TouchableOpacity>
    </View>
  );
}
