import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, PixelRatio, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { BriefingTile, computeBriefingLayout } from '../../lib/calculations/briefingTiles';

const TILE_MIN_WIDTH = 92;

/**
 * Pass 2B correction §2/§3/§4 — the Briefing's responsive tile
 * composition. Replaces the old large white inner card with up to three
 * lightweight, translucent tiles sitting directly on the hero gradient.
 *
 * Responsive contract, third correction round — `computeBriefingLayout`
 * (a pure, unit-tested function) now decides BOTH the column count and,
 * for the 3-column case specifically, the exact tile pixel width, from
 * tile count + this row's own REAL measured width (captured via onLayout
 * below, never a guessed/hard-coded device width) + the device's current
 * font scale. This replaced a percentage-flexBasis-only approach that
 * could wrap the third tile even when 3 columns were the intended,
 * selected outcome — see computeBriefingLayout's own doc comment for the
 * full root-cause explanation. The 1-/2-column fallback paths are
 * unchanged: still percentage flexBasis + flexGrow, exactly as before.
 * Width-based responsiveness is still never a single hard-coded device
 * width — it's the row's own measured layout width — so a viewport too
 * narrow for 3 columns still safely falls back, and a tile can never be
 * pushed outside the row's own bounds. No horizontal scrolling is ever
 * used for these tiles.
 *
 * Every tile renders only what BriefingTile itself carries — one icon, one
 * short label, one value, at most one supporting line — this component
 * never reads reminder/event source data directly, so it structurally
 * cannot re-introduce a long question, an account-choice control, or an
 * unbounded row (the exact defect this correction fixes).
 */
export function BriefingTileRow({ tiles, onPressTile }: { tiles: BriefingTile[]; onPressTile: (tile: BriefingTile) => void }) {
  const { spacing, radius, typography, naviloPalette } = useTheme();
  const fontScale = PixelRatio.getFontScale();
  // 0 until the row's own first layout pass — computeBriefingLayout treats
  // that as "not yet measured" and returns the safest possible interim
  // decision (1 column), so this never guesses or overflows before a real
  // measurement exists.
  const [rowWidth, setRowWidth] = useState(0);
  const { columns, tileWidth } = computeBriefingLayout(tiles.length, rowWidth, fontScale, spacing.sm, TILE_MIN_WIDTH);
  const basisPercent = columns === 1 ? 100 : 48;
  const isFixedThreeColumn = columns === 3 && tileWidth !== null;

  function handleRowLayout(e: LayoutChangeEvent) {
    setRowWidth(e.nativeEvent.layout.width);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        tile: {
          // Fixed-pixel 3-column tiles never grow/shrink — their width was
          // already computed to sum exactly to the measured row width
          // (minus both gaps), so nothing can wrap or stretch. The 1-/2-
          // column fallback keeps the original flexGrow behaviour, so a
          // lone leftover tile still fills its row exactly as before.
          flexGrow: isFixedThreeColumn ? 0 : 1,
          flexShrink: isFixedThreeColumn ? 0 : 1,
          flexBasis: isFixedThreeColumn ? undefined : `${basisPercent}%`,
          width: isFixedThreeColumn ? (tileWidth as number) : undefined,
          minWidth: TILE_MIN_WIDTH,
          maxWidth: isFixedThreeColumn ? (tileWidth as number) : '100%',
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          padding: spacing.sm,
          backgroundColor: naviloPalette.tileSurface,
          borderColor: naviloPalette.tileBorder,
        },
        iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
        label: { ...typography.micro, fontSize: 10, fontWeight: '700', color: naviloPalette.heroForeground, letterSpacing: 0.3, flexShrink: 1 },
        value: { ...typography.body, fontSize: 15, fontWeight: '800', color: naviloPalette.heroForeground, marginTop: 2 },
        supportingLine: { ...typography.micro, fontSize: 10, color: naviloPalette.heroForeground, marginTop: 2 },
      }),
    [spacing, radius, typography, naviloPalette, basisPercent, isFixedThreeColumn, tileWidth]
  );

  return (
    <View style={styles.row} onLayout={handleRowLayout}>
      {tiles.map((tile) => (
        <TouchableOpacity
          key={tile.key}
          style={styles.tile}
          onPress={() => onPressTile(tile)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={tile.accessibilityLabel}
          accessibilityHint="Opens details"
        >
          <View style={styles.iconRow}>
            <Ionicons name={tile.icon} size={13} color={tile.tone === 'attention' ? naviloPalette.attentionAccent : naviloPalette.tileIconForeground} />
            <Text style={[styles.label, { opacity: 0.8 }]} numberOfLines={2}>
              {tile.label}
            </Text>
          </View>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {tile.value}
          </Text>
          {tile.supportingLine ? (
            <Text style={[styles.supportingLine, { opacity: 0.8 }]} numberOfLines={2}>
              {tile.supportingLine}
            </Text>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}
