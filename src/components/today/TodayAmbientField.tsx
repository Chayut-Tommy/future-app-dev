import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { ambientFieldHeight, ambientGradientLocations } from '../../lib/calculations/todayComposition';

/**
 * Design 5.1 Wave 5 — Today's ambient field.
 *
 * The `ambient` semantic role is the only style-scoped role that paints
 * behind the header and hero, and it is defined as ordered stops running
 * light-to-canvas, resolved by 220pt. That definition does all the work:
 * this component just places it, so the tint can never disagree with the
 * theme, and Purple/Sunrise retint it without a line changing here.
 *
 * Three deliberate properties:
 *  - It is a colour field, not a block. The stops are eased (t²) so the
 *    tint is strongest at the very top and has mostly resolved by
 *    two-thirds down — light falling on the page rather than a coloured
 *    band with a visible edge.
 *  - It ends AT the canvas colour, which is the last stop of the role
 *    itself. Nothing below 220pt (plus the safe-area inset above the
 *    content) is tinted at all.
 *  - It cannot be touched. It is mounted into Screen's ambient slot, which
 *    is already `pointerEvents="none"`, and it sets its own as well —
 *    two independent guarantees, because a full-bleed layer that ate taps
 *    would silently break every control beneath it.
 *
 * No image, no bitmap, no new dependency (expo-linear-gradient is already
 * a direct dependency used by the Briefing and Worth Knowing today), no
 * entrance animation, and no raw colour.
 */
export function TodayAmbientField() {
  const { semantic } = useTheme();
  const insets = useSafeAreaInsets();

  const stops = semantic.ambient;
  const locations = useMemo(() => ambientGradientLocations(stops.length), [stops.length]);
  const height = ambientFieldHeight(insets.top);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        field: { ...StyleSheet.absoluteFillObject, height },
      }),
    [height]
  );

  // A single stop cannot express a fade; render nothing rather than a flat
  // coloured block, which is exactly what Design 5.1 forbids here.
  if (stops.length < 2) return null;

  return (
    <View style={styles.field} pointerEvents="none" testID="today-ambient-field" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient
        colors={stops as unknown as readonly [string, string, ...string[]]}
        locations={locations as unknown as readonly [number, number, ...number[]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}
