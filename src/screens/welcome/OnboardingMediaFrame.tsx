import React, { useMemo } from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Wave 9c final correction pass, Correction F — the Step 2 media slot.
 *
 * The owner intends to replace the current product-preview illustration
 * with a real promotional image of the finished product. This frame is the
 * CONTRACT that makes that swap a one-line change with zero layout impact:
 *
 * - a stable portrait-friendly 4:5 aspect ratio at full available width,
 *   so the surrounding composition never reflows when the asset changes
 *   and cropping stays predictable from 320pt up;
 * - a rounded, clipped premium surface (`overflow: 'hidden'` +
 *   `resizeMode="cover"`), so any source fills the frame edge-to-edge;
 * - `source` must be a LOCAL asset (`require(...)`) — never a remote URL;
 * - `accessibilityLabel` when the image communicates information, or
 *   `decorative` to hide a purely visual one from assistive tech;
 * - until a source exists, `children` renders as the placeholder inside
 *   the SAME frame — today that is the existing skeleton illustration.
 */
export function OnboardingMediaFrame({
  source,
  accessibilityLabel,
  decorative = false,
  children,
}: {
  source?: ImageSourcePropType;
  accessibilityLabel?: string;
  decorative?: boolean;
  children?: React.ReactNode;
}) {
  const { colors, radius, cardShadow } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        frame: {
          width: '100%',
          aspectRatio: 4 / 5,
          borderRadius: radius.card,
          overflow: 'hidden',
          // A calm bordered surface (Correction H) — the stronger ambient
          // backdrop must frame the future product image, never compete
          // with it.
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          ...cardShadow,
        },
        media: { width: '100%', height: '100%' },
        placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      }),
    [colors, radius, cardShadow]
  );

  return (
    <View style={styles.frame} testID="onboarding-media-frame">
      {source ? (
        <Image
          source={source}
          style={styles.media}
          resizeMode="cover"
          accessible={!decorative}
          accessibilityLabel={decorative ? undefined : accessibilityLabel}
          accessibilityElementsHidden={decorative}
          importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
        />
      ) : (
        <View style={styles.placeholder}>{children}</View>
      )}
    </View>
  );
}
