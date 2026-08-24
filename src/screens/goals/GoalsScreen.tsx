import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { ProgressBar } from '../../components/shared/ProgressBar';
import { AddGoalModal } from '../../components/goals/AddGoalModal';
import { GoalDetailSheet } from '../../components/goals/GoalDetailSheet';
import { Screen } from '../../components/shared/Screen';
import { EmptyState } from '../../components/shared/EmptyState';
import { Button } from '../../components/shared/Button';
import { Goal } from '../../types/models';
import { brand } from '../../lib/brand';

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function GoalsScreen() {
  const { data } = useAppState();
  const navigation = useNavigation<any>();
  const [visible, setVisible] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const { colors, spacing, typography, cardShadow } = useTheme();
  // Wave 9b — the shipped role resolver; tokens.typography carries no fontFamily.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const completedGoals = data.goals.filter((g) => g.status === 'completed');
  // Goals the user archived from an already-completed goal's detail sheet
  // (GoalDetailSheet's "Archive" action) — shown here, separately from
  // active/completed, so Archive organises a goal rather than making it
  // disappear (Goals-to-Grow visibility correction). Same authoritative
  // data.goals array, same array order, no new status or field.
  const archivedGoals = data.goals.filter((g) => g.status === 'archived');
  // Derived live from data.goals by id, not a snapshot taken at tap-time —
  // otherwise a contribution that completes a goal wouldn't be reflected
  // in the already-open sheet (PRD bug report: "still behaves like active"
  // right after reaching 100%).
  const selectedGoal = data.goals.find((g) => g.id === selectedGoalId) ?? null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        emptyContainer: { flexGrow: 1, justifyContent: 'center' },
        sectionTitle: { ...typeStyle('titleCard', locale), fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.lg },
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: spacing.md,
          marginBottom: spacing.sm,
          ...cardShadow,
        },
        cardBody: { flex: 1, marginRight: spacing.sm },
        cardTitle: {
          ...typeStyle('titleCard', locale),
          fontSize: 15,
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        cardSubtitle: {
          ...typeStyle('meta', locale),
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: spacing.xs,
        },
        completedCard: { backgroundColor: colors.goldSoft },
        completedIcon: { marginRight: spacing.sm },
      }),
    [colors, spacing, typography, locale, cardShadow]
  );

  function renderGoalCard(item: Goal, completed: boolean) {
    const progressLabel = item.targetAmount
      ? `${formatMoney(item.currentAmount)} of ${formatMoney(item.targetAmount)}`
      : completed
      ? 'Completed'
      : 'No target set yet';
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, completed ? styles.completedCard : null]}
        activeOpacity={0.7}
        onPress={() => setSelectedGoalId(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${progressLabel}`}
        accessibilityHint="Opens goal details"
      >
        {completed ? <Ionicons name="trophy" size={18} color={colors.gold} style={styles.completedIcon} /> : null}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {!completed ? <ProgressBar progress={item.targetAmount ? item.currentAmount / item.targetAmount : 0} /> : null}
          <Text style={styles.cardSubtitle}>{progressLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} importantForAccessibility="no" />
      </TouchableOpacity>
    );
  }

  return (
    <Screen
      title={`${brand.name} Goals`}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      headerRight={<Button label="+ New" onPress={() => setVisible(true)} />}
    >
      {data.goals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="flag-outline"
            title="No goals yet"
            body={`Set a target — an emergency fund, a house deposit, a trip — and ${brand.name} will track your progress toward it.`}
            actionLabel="Create a goal"
            onAction={() => setVisible(true)}
          />
        </View>
      ) : (
        <>
          {activeGoals.length > 0 ? activeGoals.map((g) => renderGoalCard(g, false)) : null}

          {completedGoals.length > 0 ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">🎉 Completed Goals</Text>
              {completedGoals.map((g) => renderGoalCard(g, true))}
            </>
          ) : null}

          {/* Archived goals stay visible and tappable here — Archive
              organises a goal (out of the active/completed lists), it does
              not remove it from the user's data (Goals-to-Grow visibility
              correction). Rendered with the same (non-"completed") card
              styling as an active row, since an archived goal isn't
              necessarily completed. */}
          {archivedGoals.length > 0 ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">Archived goals</Text>
              {archivedGoals.map((g) => renderGoalCard(g, false))}
            </>
          ) : null}
        </>
      )}

      <AddGoalModal visible={visible} onClose={() => setVisible(false)} />
      <GoalDetailSheet goal={selectedGoal} onClose={() => setSelectedGoalId(null)} onCreateAnother={() => setVisible(true)} />
    </Screen>
  );
}
