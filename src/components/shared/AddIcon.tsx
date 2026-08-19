/**
 * Nolie Design 5.1 Wave 4 device correction — the ONE renderer for every
 * icon in the Add experience.
 *
 * `lib/addIcons.ts` owns which glyph an item gets; this owns how it looks
 * and, just as importantly, how it is announced: never at all. An icon here
 * is decorative — it repeats information the row or card already carries in
 * text — so it is hidden from the accessibility tree and the PARENT owns the
 * complete accessible label. A screen reader must hear "Groceries, Weekly,
 * button", never "image, Groceries, Weekly, button".
 *
 * Two sizes only, both from the Design 5.1 scale:
 *   - the bare glyph at 20pt (rows, chips, inline affordances);
 *   - the glyph at 22pt inside a 36pt low-contrast semantic tint tile, for
 *     cards and account rows where the icon is a landmark rather than a hint.
 *
 * Colour comes exclusively from the semantic theme. There are no raw colour
 * values in this file: the six Add-icon tone families live in
 * `theme/semanticTokens.ts` and resolve per scheme, so an item keeps the
 * same identity tone in all six themes while remaining legible in each.
 *
 * Wave 4 closure — the owner's second recording showed the icon set reading
 * as uniformly grey/pale, with no way to scan a long catalogue. Each icon
 * now carries its DOMAIN tone: one hue per tile, a softly tinted background
 * and a stronger same-family glyph. No gradients, no multicolour glyphs, no
 * randomness — the tone is a property of the mapped item, so the same
 * concept looks the same everywhere it appears.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { AddIconSpec } from '../../lib/addIcons';
import { resolveAddIconTone } from '../../theme/semanticTokens';

/** Functional icon size — the bare glyph. */
export const ADD_ICON_SIZE = 20;
/** Functional icon size when it sits inside a tint tile. */
export const ADD_ICON_TILE_GLYPH_SIZE = 22;
/** The low-contrast semantic tint container. */
export const ADD_ICON_TILE_SIZE = 36;

/**
 * How strongly the icon is drawn. `domain` is the default and uses the
 * item's own tone family; `selected` and `muted` override it for states
 * where the surrounding control already carries the meaning.
 */
export type AddIconEmphasis = 'domain' | 'selected' | 'muted';

export function AddIcon({
  icon,
  emphasis = 'domain',
  tile = false,
  style,
}: {
  /** The mapped spec — glyph AND tone together, so a call site can never
   * take one without the other. */
  icon: AddIconSpec;
  emphasis?: AddIconEmphasis;
  /** Render inside the low-contrast tint container. */
  tile?: boolean;
  style?: ViewStyle;
}) {
  const { colors, radius, scheme } = useTheme();
  const tonePair = resolveAddIconTone(scheme, icon.tone);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tile: {
          width: ADD_ICON_TILE_SIZE,
          height: ADD_ICON_TILE_SIZE,
          borderRadius: radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          // One flat hue per tile — never a gradient.
          backgroundColor: tonePair.bg,
        },
        tileSelected: { backgroundColor: colors.accentSoft },
        tileMuted: { backgroundColor: colors.surfaceMuted },
      }),
    [colors, radius, tonePair]
  );

  // Selection and muting are states the parent control owns; only the
  // default emphasis expresses the item's own domain tone.
  const color = emphasis === 'selected' ? colors.accentStrong : emphasis === 'muted' ? colors.textMuted : tonePair.fg;

  // The single cast in the codebase from a mapped name to an Ionicons key.
  // Every name in `lib/addIcons.ts` is checked against Ionicons' own shipped
  // glyph map by `tests/design5-add-iconography.test.ts`, so this cast is
  // verified rather than assumed.
  const glyph = icon.name as keyof typeof Ionicons.glyphMap;

  if (!tile) {
    return (
      <Ionicons
        name={glyph}
        size={ADD_ICON_SIZE}
        color={color}
        style={style}
        // Decorative. The parent row/card carries the whole label.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }

  return (
    <View
      style={[styles.tile, emphasis === 'selected' && styles.tileSelected, emphasis === 'muted' && styles.tileMuted, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={glyph} size={ADD_ICON_TILE_GLYPH_SIZE} color={color} />
    </View>
  );
}
