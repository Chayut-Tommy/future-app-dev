import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { designLayout, designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import { isAccessibilityText } from '../../lib/calculations/moneyComposition';
import i18n from '../../i18n';

/** The tone a section header's icon tile carries. Deliberately a small
 * closed set: a header exists to aid recognition, not to introduce a sixth
 * colour language. */
export type SectionHeaderTone = 'interactive' | 'info' | 'featured' | 'warm';

/**
 * Nolie Design 5.1 Wave 6 closure — ONE section header for Money.
 *
 * The four section titles were bare `<Text>` on a legacy style: no icon, no
 * shared spacing contract, and each screen-local. The root title had
 * already moved onto the Design 5.1 `titleScreen` role, which left the
 * headings beneath it looking like leftovers from the previous design.
 *
 * This is one component with one contract, so the four sections cannot
 * drift into four header designs. It is deliberately NOT a card: a header
 * that becomes a surface would add a fifth box to a page this wave spent
 * three passes shortening.
 */
export function MoneySectionHeader({
  icon,
  tone = 'interactive',
  title,
  definition,
  action,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: SectionHeaderTone;
  title: string;
  /** One concise line. Omitted where the section's own card already says it. */
  definition?: string | null;
  /** Optional trailing control — always a real 44pt target. */
  action?: { label?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; accessibilityLabel: string } | null;
  testID?: string;
}) {
  const { semantic } = useTheme();
  const { fontScale } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  // At accessibility sizes the trailing action drops below the title
  // rather than squeezing it.
  const stack = isAccessibilityText(fontScale);

  const tint = (() => {
    switch (tone) {
      case 'info':
        return { bg: semantic.infoTint, ink: semantic.infoText };
      case 'featured':
        return { bg: semantic.interactiveTint, ink: semantic.interactive };
      case 'warm':
        return { bg: semantic.warningTint, ink: semantic.warning };
      case 'interactive':
      default:
        return { bg: semantic.interactiveTint, ink: semantic.interactive };
    }
  })();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginTop: designLayout.sectionGap, marginBottom: designSpacing.sm },
        row: {
          flexDirection: stack ? 'column' : 'row',
          alignItems: stack ? 'flex-start' : 'center',
          gap: designSpacing.md,
        },
        tile: {
          width: TILE_SIZE,
          height: TILE_SIZE,
          borderRadius: designRadius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint.bg,
        },
        titleBlock: { flex: stack ? undefined : 1 },
        // Title case, Figtree, through the shipped resolver — never an
        // all-caps eyebrow and never the platform default.
        title: { ...typeStyle('titleSection', locale), color: semantic.textTitle },
        definition: { ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: 2 },
        action: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.xs,
          minHeight: designLayout.touchTargetMin,
          justifyContent: 'center',
        },
        actionText: { ...typeStyle('labelButton', locale), color: semantic.interactive },
      }),
    [semantic, locale, stack, tint.bg]
  );

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.row}>
        <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name={icon} size={GLYPH_SIZE} color={tint.ink} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {definition ? <Text style={styles.definition}>{definition}</Text> : null}
        </View>
        {action ? (
          <TouchableOpacity
            style={styles.action}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            testID={testID ? `${testID}-action` : undefined}
          >
            {action.label ? <Text style={styles.actionText}>{action.label}</Text> : null}
            {action.icon ? <Ionicons name={action.icon} size={18} color={semantic.interactive} importantForAccessibility="no" /> : null}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** Matches the identity tiles the Today and Money heroes already use, so
 * the page has one tile rhythm rather than several. */
const TILE_SIZE = 32;
const GLYPH_SIZE = 17;
