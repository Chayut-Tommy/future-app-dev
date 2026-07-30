import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from './Button';

/**
 * B2.0C — the app-wide "your change is showing but not yet on disk"
 * surface. Rendered once, from App.tsx's AppShell, as a sibling to
 * RootNavigator — not from any individual screen — because no screen-local
 * state can be trusted to still be the right context by the time a
 * persistence failure is known (regression-protection review, B2.0C
 * corrected design §3/§4: the action that failed to persist has often
 * already closed its own sheet/dismissed its own card by the time this
 * renders). Visible only while AppStateContext's persistenceState.status is
 * `'error'` with no reset outstanding — hidden during `'saving'`/`'idle'`,
 * so the common, fast, successful case is never interrupted.
 *
 * Deliberately non-blocking (unlike ResetPendingOverlay) — an ordinary
 * write failure never prevents continued in-memory use of the app; it only
 * needs to stay visible and offer a retry until the latest state is known
 * durable.
 */
export function UnsavedChangesBanner({ onRetry }: { onRetry: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          position: 'absolute',
          left: spacing.md,
          right: spacing.md,
          bottom: Math.max(insets.bottom, spacing.md),
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.warningSoft,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.warning,
          padding: spacing.md,
        },
        iconBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
        textBlock: { flex: 1 },
        body: { ...typography.caption, fontSize: 12, color: colors.textPrimary, lineHeight: 16 },
        button: { paddingHorizontal: spacing.md, minHeight: 0, paddingVertical: 8 },
      }),
    [colors, insets.bottom, radius, spacing, typography]
  );

  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.iconBadge}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.body}>Your change is showing for now, but it hasn't been saved on this device yet. Try again before closing Navilo.</Text>
      </View>
      <Button label="Try saving again" variant="secondary" onPress={onRetry} style={styles.button} />
    </View>
  );
}
