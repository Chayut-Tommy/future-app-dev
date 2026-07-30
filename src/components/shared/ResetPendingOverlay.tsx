import React, { useMemo } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from './Button';
import { brand } from '../../lib/brand';
import { ResetState } from '../../lib/persistenceState';

/**
 * B2.0C mandatory correction 1 — resetAllData's navigation switch to the
 * Welcome flow happens the instant the fresh in-memory state commits, before
 * the reset write has even started, let alone settled. This overlay is what
 * keeps the app from *appearing* fully reset before that write is durable:
 * a real native Modal (blocks all touches to whatever's behind it — the
 * Welcome flow, in practice — by construction, not by convention), rendered
 * from App.tsx's AppShell so it survives the navigation switch that tore
 * down ResetLuluScreen itself.
 *
 * Visible for the entire `'pending'`→`'failed'`(→retry→`'pending'`)→`'none'`
 * lifecycle of a reset write. No dismiss/cancel affordance is offered on
 * either state — onboarding and other data entry must stay blocked until
 * the reset genuinely lands on disk (or the process is force-quit, which is
 * the one boundary this overlay cannot close — see the caller's honest
 * force-quit boundary note).
 */
export function ResetPendingOverlay({ resetState, onRetry }: { resetState: Exclude<ResetState, 'none'>; onRetry: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const isFailed = resetState === 'failed';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        iconBadge: {
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: isFailed ? colors.dangerSoft : colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.lg,
        },
        title: { ...typography.title, fontSize: 18, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
        body: { ...typography.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
        button: { alignSelf: 'stretch', maxWidth: 320 },
      }),
    [colors, insets.bottom, insets.top, isFailed, radius, spacing, typography]
  );

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop} accessibilityViewIsModal accessibilityLiveRegion="polite">
        <View style={styles.iconBadge}>
          {isFailed ? (
            <Ionicons name="warning" size={32} color={colors.danger} />
          ) : (
            <ActivityIndicator size="large" color={colors.accent} />
          )}
        </View>
        {isFailed ? (
          <>
            <Text style={styles.title}>Reset didn't finish</Text>
            <Text style={styles.body}>
              {`${brand.name} couldn't finish removing your data from this device yet. Try again before closing the app.`}
            </Text>
            <Button label="Try again" onPress={onRetry} style={styles.button} />
          </>
        ) : (
          <>
            <Text style={styles.title}>Removing your data from this device…</Text>
            <Text style={styles.body}>This only takes a moment. Please don't close {brand.name} yet.</Text>
          </>
        )}
      </View>
    </Modal>
  );
}
