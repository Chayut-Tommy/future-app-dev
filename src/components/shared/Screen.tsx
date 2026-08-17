import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RefObject } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { screenBottomClearance } from '../../navigation/floatingNavGeometry';

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
}) {
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography } = useTheme();

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
          paddingHorizontal: spacing.lg,
          // Floating navigation design pass — the dock/FAB assembly now
          // floats over the bottom of every screen; content needs at least
          // its own clearance to stay fully reachable rather than ending
          // flush behind it. screenBottomClearance already includes a
          // cushion beyond the assembly's own height, so this replaces
          // (not adds to) the previous flat spacing.xxl*2 value.
          paddingBottom: screenBottomClearance(insets.bottom),
        },
        paddedFlexContent: {
          paddingHorizontal: spacing.lg,
          flex: 1,
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
        title: {
          ...typography.title,
          color: colors.textPrimary,
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
    [colors, spacing, typography, insets.bottom]
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Pass 2E — rendered before the scroll/content block so assistive-
       * technology focus order matches the visual order (overlay content is
       * absolutely positioned, so this reorder has no layout effect).
       * Wrapped for correct touch precedence — see styles.overlayLayer. */}
      <View style={styles.overlayLayer} pointerEvents="box-none">
        {overlay}
      </View>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[contentPadding && styles.paddedContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flexFill, contentPadding && styles.paddedFlexContent]}>
          {header}
          {children}
        </View>
      )}
    </View>
  );
}
