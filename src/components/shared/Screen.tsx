import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RefObject } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';

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
          paddingBottom: spacing.xxl * 2,
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
      }),
    [colors, spacing, typography]
  );

  const header = title ? (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backButton}>
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
      {overlay}
    </View>
  );
}
