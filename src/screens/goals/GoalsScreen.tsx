import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
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

  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const completedGoals = data.goals.filter((g) => g.status === 'completed');
  // Derived live from data.goals by id, not a snapshot taken at tap-time —
  // otherwise a contribution that completes a goal wouldn't be reflected
  // in the already-open sheet (PRD bug report: "still behaves like active"
  // right after reaching 100%).
  const selectedGoal = data.goals.find((g) => g.id === selectedGoalId) ?? null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        emptyContainer: { flexGrow: 1, justifyContent: 'center' },
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.lg },
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
          ...typography.heading,
          fontSize: 15,
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        cardSubtitle: {
          ...typography.caption,
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: spacing.xs,
        },
        completedCard: { backgroundColor: colors.goldSoft },
        completedIcon: { marginRight: spacing.sm },
      }),
    [colors, spacing, typography, cardShadow]
  );

  function renderGoalCard(item: Goal, completed: boolean) {
    return (
      <TouchableOpacity key={item.id} style={[styles.card, completed ? styles.completedCard : null]} activeOpacity={0.7} onPress={() => setSelectedGoalId(item.id)}>
        {completed ? <Ionicons name="trophy" size={18} color={colors.gold} style={styles.completedIcon} /> : null}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {!completed ? <ProgressBar progress={item.targetAmount ? item.currentAmount / item.targetAmount : 0} /> : null}
          <Text style={styles.cardSubtitle}>
            {item.targetAmount
              ? `${formatMoney(item.currentAmount)} of ${formatMoney(item.targetAmount)}`
              : completed
              ? 'Completed'
              : 'No target set yet'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
              <Text style={styles.sectionTitle}>🎉 Completed Goals</Text>
              {completedGoals.map((g) => renderGoalCard(g, true))}
            </>
          ) : null}
        </>
      )}

      <AddGoalModal visible={visible} onClose={() => setVisible(false)} />
      <GoalDetailSheet goal={selectedGoal} onClose={() => setSelectedGoalId(null)} onCreateAnother={() => setVisible(true)} />
    </Screen>
  );
}
