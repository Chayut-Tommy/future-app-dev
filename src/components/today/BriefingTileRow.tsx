import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PixelRatio, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RefObject } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { BriefingTile, computeBriefingLayout } from '../../lib/calculations/briefingTiles';
import { useReduceMotion } from '../../hooks/useReduceMotion';

const TILE_MIN_WIDTH = 92;
const CONTENT_FADE_DURATION_MS = 180;

/**
 * Pass 2E — the restrained fade for eligible Briefing content changing in
 * place (e.g. the AUP tile's amount updating, or the Reminder tile's status
 * changing after "Not yet"/completion). React already preserves this
 * component's own state across renders by `tile.key` (the same key the
 * parent's .map already used before this round), so comparing against the
 * PREVIOUS render's own committed value/supportingLine here — via a ref,
 * not re-derived by the parent — is sufficient to detect "this specific
 * tile's content changed in place" without any cross-tile diffing. A tile
 * newly mounting (composition change, not an in-place change) starts at
 * opacity 1 with no fade — only a genuine value change on an
 * already-mounted tile fades. The underlying data has already been
 * recomputed by the time this renders (selectBriefingTiles already ran) —
 * this only ever animates the PRESENTATION of an already-confirmed result,
 * never a live-tweened number that could imply a calculation is still in
 * progress.
 */
function BriefingTileButton({
  tile,
  onPress,
  styles,
  attentionColor,
  iconColor,
  focusRef,
}: {
  tile: BriefingTile;
  onPress: () => void;
  styles: { [key: string]: any };
  attentionColor: string;
  iconColor: string;
  /** Reminder focus/announcements task — set only for the 'reminder' tile
   * (see BriefingTileRow's own map below), so TodayScreen can restore
   * accessibility focus here when the Reminder sheet fully closes and this
   * exact tile is still the one that originated it. */
  focusRef?: RefObject<any>;
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const prevSignatureRef = useRef<string | null>(null);
  const signature = `${tile.value}|${tile.supportingLine ?? ''}`;

  useEffect(() => {
    if (prevSignatureRef.current === null) {
      // First mount for this key — no fade, nothing changed "in place" yet.
      prevSignatureRef.current = signature;
      return;
    }
    if (prevSignatureRef.current === signature) return;
    prevSignatureRef.current = signature;
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.35);
    Animated.timing(opacity, { toValue: 1, duration: CONTENT_FADE_DURATION_MS, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reduceMotion]);

  return (
    <Animated.View style={{ opacity }}>
      <TouchableOpacity
        ref={focusRef}
        style={styles.tile}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={tile.accessibilityLabel}
        accessibilityHint="Opens details"
      >
        <View style={styles.iconRow}>
          <Ionicons name={tile.icon} size={13} color={tile.tone === 'attention' ? attentionColor : iconColor} />
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
    </Animated.View>
  );
}

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
export function BriefingTileRow({
  tiles,
  onPressTile,
  reminderTileRef,
}: {
  tiles: BriefingTile[];
  onPressTile: (tile: BriefingTile) => void;
  /** Reminder focus/announcements task — attached only to the 'reminder'
   * tile (if present this render), so TodayScreen can restore accessibility
   * focus to it once the Reminder sheet fully closes. */
  reminderTileRef?: RefObject<any>;
}) {
  const { spacing, radius, typography, naviloPalette } = useTheme();
  // Wave 9b closure — tokens.typography carries no fontFamily, so every
  // reminder string rendered in the platform font. Resolve the shipped role.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
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
        label: { ...typeStyle('labelTab', locale), fontSize: 10, fontWeight: '700', color: naviloPalette.heroForeground, letterSpacing: 0.3, flexShrink: 1 },
        value: { ...typeStyle('body', locale), fontSize: 15, fontWeight: '800', color: naviloPalette.heroForeground, marginTop: 2 },
        supportingLine: { ...typeStyle('labelTab', locale), fontSize: 10, color: naviloPalette.heroForeground, marginTop: 2 },
      }),
    [spacing, radius, typography, locale, naviloPalette, basisPercent, isFixedThreeColumn, tileWidth]
  );

  return (
    <View style={styles.row} onLayout={handleRowLayout}>
      {tiles.map((tile) => (
        <BriefingTileButton
          key={tile.key}
          tile={tile}
          onPress={() => onPressTile(tile)}
          styles={styles}
          attentionColor={naviloPalette.attentionAccent}
          iconColor={naviloPalette.tileIconForeground}
          focusRef={tile.kind === 'reminder' ? reminderTileRef : undefined}
        />
      ))}
    </View>
  );
}
