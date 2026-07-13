import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { Button } from '../../components/shared/Button';
import { brand } from '../../lib/brand';

const DELETED_ITEMS = ['Income', 'Assets', 'Goals', 'Transactions', 'Bills', `${brand.name}'s progress`];

/**
 * A genuinely destructive, hard-to-reverse action, so it gets its own full
 * confirmation screen rather than a quick alert (PRD ask: "do not make
 * accidental reset possible"). Resetting also clears `hasSeenIntro`, so the
 * user lands back on the welcome flow and truly starts over.
 */
export function ResetLuluScreen() {
  const navigation = useNavigation<any>();
  const { resetAllData } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        iconBadge: {
          alignSelf: 'center',
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.dangerSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: spacing.xl,
          marginBottom: spacing.lg,
        },
        title: { ...typography.title, fontSize: 22, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
        body: { ...typography.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
        listBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.control, padding: spacing.lg, marginBottom: spacing.xl },
        listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
        listText: { ...typography.body, fontSize: 14, color: colors.textPrimary },
        startOverText: { ...typography.caption, fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 18 },
        footer: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
        footerButton: { flex: 1 },
        resetButton: { flex: 1, backgroundColor: colors.danger },
      }),
    [colors, radius, spacing, typography]
  );

  function handleReset() {
    resetAllData();
  }

  return (
    <Screen title={`Reset ${brand.name}`} onBack={() => navigation.goBack()}>
      <View style={styles.iconBadge}>
        <Ionicons name="warning" size={32} color={colors.danger} />
      </View>
      <Text style={styles.title}>Are you sure?</Text>
      <Text style={styles.body}>This will permanently delete your:</Text>

      <View style={styles.listBox}>
        {DELETED_ITEMS.map((item) => (
          <View key={item} style={styles.listRow}>
            <Ionicons name="close-circle" size={16} color={colors.danger} />
            <Text style={styles.listText}>{item}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.startOverText}>You'll need to start your {brand.name} journey again.</Text>

      <View style={styles.footer}>
        <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} style={styles.footerButton} />
        <Button label={`Reset my ${brand.name}`} onPress={handleReset} style={styles.resetButton} />
      </View>
    </Screen>
  );
}
