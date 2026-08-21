import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { FlatListProps, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { RefObject } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { screenBottomClearance } from '../../navigation/floatingNavGeometry';
import { designLayout } from '../../theme/semanticTokens';
import { resolveTextStyle } from '../../theme/typography';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/** Design 5.1 doc A p.4 — the large title collapses to a compact pinned bar
 * once the content has scrolled past this distance. */
export const LARGE_TITLE_COLLAPSE_THRESHOLD = 56;
/** Height of the collapsed pinned bar. */
export const COLLAPSED_TITLE_BAR_HEIGHT = 44;

/**
 * Shared screen shell: handles the iPhone safe-area top inset (notch /
 * Dynamic Island) once, and standardizes the title row + horizontal padding
 * so every tab looks aligned the same way. Use `scroll={false}` for screens
 * that render their own FlatList (nesting a FlatList inside a ScrollView
 * breaks virtualization).
 */
export function Screen({
  title,
  headerRight,
  onBack,
  children,
  scroll = true,
  contentPadding = true,
  overlay,
  scrollRef,
  ambient,
  largeTitle = false,
  list,
}: {
  title?: string;
  headerRight?: React.ReactNode;
  /** Shows a back chevron to the left of the title, for screens pushed onto a stack. */
  onBack?: () => void;
  children: React.ReactNode;
  scroll?: boolean;
  contentPadding?: boolean;
  /** Rendered as a fixed sibling above the scroll content — e.g. a floating
   * action button — so it stays pinned to the screen instead of scrolling
   * away with the content. */
  overlay?: React.ReactNode;
  /** Forwarded to the internal ScrollView so a screen can scroll itself to
   * a section on demand (e.g. landing on a specific Discover category). */
  scrollRef?: RefObject<ScrollView | null>;
  /** Design 5.1 Wave 2 — full-bleed ambient field painted behind the header
   * and hero. Purely decorative and pointer-transparent; omitted by every
   * existing consumer, so their layout is byte-identical. */
  ambient?: React.ReactNode;
  /** Opt in to the large-title collapse. Default false, so existing screens
   * keep their current static title exactly as before. */
  largeTitle?: boolean;
  /** Design 5.1 Wave 2 — FlatList variant. When supplied, the shell renders
   * a FlatList (correctly virtualised) instead of a ScrollView, applying the
   * same padding, safe-area and bottom-clearance contract and mounting the
   * header as ListHeaderComponent. Omitted by every existing consumer. */
  list?: Omit<FlatListProps<any>, 'contentContainerStyle' | 'ListHeaderComponent'>;
}) {
  const insets = useSafeAreaInsets();
  const { colors, semantic, spacing, typography } = useTheme();
  const { width } = useWindowDimensions();
  const locale: AppLocale = i18n.language === 'th' ? 'th' : 'en';

  // Large-title collapse. STATE-DRIVEN, not animation-driven: `collapsed` is
  // derived from the scroll offset and is what every behaviour reads, so
  // Reduced Motion renders the identical state with no animation at all —
  // nothing waits for a fade to finish (doc C construction rule).
  const [collapsed, setCollapsed] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y >= LARGE_TITLE_COLLAPSE_THRESHOLD;
    if (next !== collapsed) setCollapsed(next);
  };
  // The bar's PRESENCE, visibility and accessibility all derive from
  // `collapsed` alone — deliberately with no Animated opacity in between.
  //
  // The first implementation faded an Animated.Value 0 -> 1 on collapse.
  // That made the bar's accessibility exposure depend on the fade having
  // finished: a fully transparent view is skipped by VoiceOver/TalkBack (and
  // by RNTL's hidden-element filter, which is how this was caught), so a
  // screen-reader user scrolling past the threshold would reach the pinned
  // title only once an animation they cannot perceive had completed. Doc C's
  // construction rule is explicit that no behaviour may depend on an
  // animation having run, and accessibility exposure is behaviour.
  //
  // An instant swap is also the correct presentation here: the bar replaces
  // a title that is scrolling away under it, so there is nothing to ease.
  // Reduced Motion is therefore identical by construction rather than by a
  // parallel branch.
  // The dock NEVER reads any of this — scroll must not drive dock
  // visibility (dockVisibility.ts owns that, from route/keyboard/overlay).

  const compact = width <= designLayout.breakpoints.compactMax;
  const tablet = width >= designLayout.breakpoints.tabletMin;
  const horizontalMargin = compact ? designLayout.screenMarginCompact : spacing.lg;
  const collapsedTitleType = resolveTextStyle('titleCard', locale);
  const screenTitleType = typeStyle('titleScreen', locale);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.background,
        },
        flexFill: {
          flex: 1,
        },
        paddedContent: {
          paddingHorizontal: horizontalMargin,
          // Floating navigation design pass — the dock/FAB assembly now
          // floats over the bottom of every screen; content needs at least
          // its own clearance to stay fully reachable rather than ending
          // flush behind it. screenBottomClearance already includes a
          // cushion beyond the assembly's own height, so this replaces
          // (not adds to) the previous flat spacing.xxl*2 value.
          paddingBottom: screenBottomClearance(insets.bottom),
        },
        paddedFlexContent: {
          paddingHorizontal: horizontalMargin,
          flex: 1,
        },
        // Tablet: content is capped and centred rather than stretched
        // (Tokens.json layout.contentMaxWidthTablet). No effect on phones.
        tabletWidth: {
          width: '100%',
          maxWidth: designLayout.contentMaxWidthTablet,
          alignSelf: 'center',
        },
        // Full-bleed, behind everything, never interactive.
        ambientLayer: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 0,
        },
        // The collapsed bar is an ABSOLUTE overlay, so the large title stays
        // in the scroll content and nothing reflows at the threshold —
        // that is what guarantees no layout jump.
        collapsedBar: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: COLLAPSED_TITLE_BAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: horizontalMargin,
          backgroundColor: semantic.bgSurface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: semantic.border,
          zIndex: 20,
          elevation: 20,
        },
        // Design 5.1 titleCard role. Only the RN-valid fields are applied:
        // the resolver also carries `maxScale` (a Dynamic Type policy, not a
        // style) and a readonly fontVariant tuple, neither of which belongs
        // in a TextStyle. New text, so it uses the locale-aware resolver
        // rather than a platform default (Wave 2 ratchet).
        collapsedTitle: {
          fontFamily: collapsedTitleType.fontFamily,
          fontSize: collapsedTitleType.fontSize,
          lineHeight: collapsedTitleType.lineHeight,
          color: semantic.textTitle,
          flexShrink: 1,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        },
        titleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 1,
        },
        backButton: {
          marginRight: spacing.xs,
          marginLeft: -spacing.xs,
        },
        backChevron: {
          fontSize: 30,
          fontWeight: '400',
          color: colors.accent,
          marginTop: -2,
        },
        // Wave 6 final pass — the shared screen title was still on the
        // LEGACY `typography.title` token: 24/700 in the platform default
        // font, which is why Money's root header did not match the Design
        // 5.1 headers beside it. It now uses the `titleScreen` role
        // through the shipped resolver, so it renders in Figtree at the
        // published size/weight/tracking and follows the Thai metrics like
        // every other 5.1 role.
        //
        // This is ONE shared style, not the deferred 68-file font
        // migration: every screen that passes a `title` inherits the
        // correction at once, and nothing else is touched.
        title: {
          ...screenTitleType,
          color: semantic.textTitle,
        },
        // Pass 2E correction — `overlay` is declared before the scroll/
        // content block (below) so assistive-technology focus order
        // matches visual order, but JSX sibling order alone also
        // determines native paint/hit-test order absent an explicit
        // zIndex — so the ScrollView, declared after, was silently
        // painting (and hit-testing) on top of the overlay's absolutely
        // positioned children, swallowing touches meant for them (e.g.
        // Today's Settings gear) even though they remained visually on
        // top. This wrapper restores correct touch precedence via
        // zIndex/elevation without reordering the JSX, so the a11y
        // traversal order this comment describes is unaffected.
        // `absoluteFillObject` keeps it out of layout flow (it never
        // pushes the ScrollView down), and `pointerEvents="box-none"` (set
        // on the View itself, below) means only the overlay's own
        // absolutely-positioned children capture touches — everywhere else
        // in this full-screen layer passes taps straight through to
        // whatever's underneath.
        overlayLayer: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 10,
          elevation: 10,
        },
      }),
    [colors, semantic, spacing, typography, insets.bottom, horizontalMargin, collapsedTitleType]
  );

  const header = title ? (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
          >
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {headerRight}
    </View>
  ) : null;

  const collapsedBar =
    largeTitle && title && collapsed ? (
      <View
        testID="screen-collapsed-title"
        style={[styles.collapsedBar, { top: insets.top }]}
        pointerEvents={collapsed ? 'auto' : 'none'}
        // Hidden from assistive tech while expanded so the title is never
        // announced twice; the large title in the content owns it until the
        // bar takes over.
        accessibilityElementsHidden={!collapsed}
        importantForAccessibility={collapsed ? 'yes' : 'no-hide-descendants'}
      >
        <Text style={styles.collapsedTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
    ) : null;

  const scrollableProps = largeTitle ? { onScroll, scrollEventThrottle: 16 } : {};

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Ambient field paints behind everything and never takes touches. */}
      {ambient ? (
        <View style={styles.ambientLayer} pointerEvents="none">
          {ambient}
        </View>
      ) : null}
      {collapsedBar}
      {/* Pass 2E — rendered before the scroll/content block so assistive-
       * technology focus order matches the visual order (overlay content is
       * absolutely positioned, so this reorder has no layout effect).
       * Wrapped for correct touch precedence — see styles.overlayLayer. */}
      <View style={styles.overlayLayer} pointerEvents="box-none">
        {overlay}
      </View>
      {list ? (
        <FlatList
          testID="screen-list"
          {...list}
          {...scrollableProps}
          contentContainerStyle={[contentPadding && styles.paddedContent, tablet && styles.tabletWidth]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
        />
      ) : scroll ? (
        <ScrollView
          testID="screen-scroll"
          ref={scrollRef}
          {...scrollableProps}
          contentContainerStyle={[contentPadding && styles.paddedContent, tablet && styles.tabletWidth]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flexFill, contentPadding && styles.paddedFlexContent, tablet && styles.tabletWidth]}>
          {header}
          {children}
        </View>
      )}
    </View>
  );
}
