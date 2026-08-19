/**
 * Nolie Design 5.1 Wave 4 closure — the ONE goal field system, shared by
 * creating a goal and editing an existing one.
 *
 * The recorded defect: creating a goal used the modern Wave 4 form (purpose
 * cards, `MonthYearField`, segmented priority, fixed footer) while opening an
 * EXISTING goal dropped into the legacy editor — raw `MM`/`YYYY` boxes, an
 * isolated `Set` button for the target amount, emoji priority chips and a
 * Close-only footer. Two designs for the same five fields.
 *
 * This component is the fields themselves and nothing else. It owns no
 * persistence, no calculation and no chrome: the create adapter
 * (`AddGoalModal`) and the edit adapter (`GoalDetailSheet`) each hold their
 * own state and decide what saving means, which is what keeps their genuinely
 * different commit contracts intact.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { LifeGoalType, GoalPriority } from '../../types/models';
import { TextField } from '../shared/fields/TextField';
import { CurrencyField } from '../shared/fields/CurrencyField';
import { MonthYearField } from '../shared/fields/MonthYearField';
import { Segmented } from '../shared/Segmented';
import { AddIcon } from '../shared/AddIcon';
import { goalPurposeIcon } from '../../lib/addIcons';
import { GOAL_PURPOSES } from '../../lib/goalFormState';

/** A goal-purpose card is a primary choice, not a chip. Taller than the 44pt
 * touch minimum so the tinted icon tile and the label both have room. */
export const GOAL_TILE_MIN_HEIGHT = 56;
/** Below this width, or at this font scale, two columns clip the longer
 * labels ("Financial freedom"), so the cards go full width instead. */
export const GOAL_TILE_COMPACT_MAX_WIDTH = 360;
export const GOAL_TILE_COMPACT_FONT_SCALE = 1.3;

/** The SAME three values and the same stored meanings in both modes, shown
 * as one labelled segmented control. Plain labels — no emoji. */
export const GOAL_PRIORITY_OPTIONS: { value: GoalPriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'flexible', label: 'Flexible' },
];

export interface GoalFormValues {
  purpose: LifeGoalType | null;
  name: string;
  targetAmount: string;
  targetMonth: string;
  targetYear: string;
  priority: GoalPriority;
}

export function GoalFormFields({
  values,
  onChangePurpose,
  onChangeName,
  onChangeTargetAmount,
  onChangeTargetDate,
  onChangePriority,
  today,
  amountMessage,
  dateMessage,
  amountHelper,
  testIDPrefix = 'goal',
}: {
  values: GoalFormValues;
  /** The adapter applies the shared generated-name rule; this only reports
   * the tap, so create and edit cannot diverge on naming. */
  onChangePurpose: (next: LifeGoalType) => void;
  onChangeName: (next: string) => void;
  onChangeTargetAmount: (next: string) => void;
  onChangeTargetDate: (next: { month: number | null; year: number | null }) => void;
  onChangePriority: (next: GoalPriority) => void;
  today: Date;
  amountMessage?: string | null;
  dateMessage?: string | null;
  amountHelper?: string | null;
  testIDPrefix?: string;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const compactTiles = windowWidth <= GOAL_TILE_COMPACT_MAX_WIDTH || fontScale >= GOAL_TILE_COMPACT_FONT_SCALE;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionHeading: { ...typography.heading, fontSize: 15, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm },
        grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
        tile: {
          minHeight: GOAL_TILE_MIN_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
        },
        tileTwoColumn: { width: '48%' },
        tileOneColumn: { width: '100%' },
        // Selection is signalled by the border, the fill AND the tick, never
        // by colour alone.
        tileActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1 },
        tileLabel: { ...typography.body, fontSize: 14, color: colors.textSecondary, flex: 1, flexShrink: 1 },
        tileLabelActive: { color: colors.accentStrong, fontWeight: '600' },
        helperText: { ...typography.micro, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <>
      {/* ---- Section 1 — What are you working towards? ------------------ */}
      <Text style={styles.sectionHeading} accessibilityRole="header">
        What are you working towards?
      </Text>
      <View style={styles.grid}>
        {GOAL_PURPOSES.map((g) => {
          const active = values.purpose === g.value;
          return (
            <TouchableOpacity
              key={g.value}
              style={[styles.tile, compactTiles ? styles.tileOneColumn : styles.tileTwoColumn, active ? styles.tileActive : null]}
              onPress={() => onChangePurpose(g.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, selected: active }}
              accessibilityLabel={g.label}
              testID={`${testIDPrefix}-purpose-${g.value}`}
            >
              <AddIcon icon={goalPurposeIcon(g.value)} tile emphasis={active ? 'selected' : 'domain'} />
              <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{g.label}</Text>
              {active ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ---- Section 2 — Goal details ----------------------------------- */}
      <Text style={styles.sectionHeading} accessibilityRole="header">
        Goal details
      </Text>
      <TextField
        label="Goal name"
        required
        placeholder="e.g. House deposit"
        value={values.name}
        onChangeText={onChangeName}
        returnKeyType="next"
        testID={`${testIDPrefix}-name`}
      />

      {/* The target amount is a FIELD, in the form — never an isolated
          "Set" interaction the customer has to discover and press. */}
      <CurrencyField
        label="Target amount — optional"
        accessibilityLabel="Target amount, optional"
        allowZero
        large
        placeholder="$0"
        value={values.targetAmount}
        onChangeText={onChangeTargetAmount}
        message={amountMessage ?? null}
        testID={`${testIDPrefix}-target-amount`}
      />
      {amountHelper ? <Text style={styles.helperText}>{amountHelper}</Text> : null}

      {/* ---- Section 3 — Timing and priority ---------------------------- */}
      <Text style={styles.sectionHeading} accessibilityRole="header">
        Timing and priority
      </Text>
      <MonthYearField
        label="Target date — optional"
        today={today}
        value={{
          month: values.targetMonth.trim() === '' ? null : parseInt(values.targetMonth, 10),
          year: values.targetYear.trim() === '' ? null : parseInt(values.targetYear, 10),
        }}
        onChange={onChangeTargetDate}
        message={dateMessage ?? null}
        testID={`${testIDPrefix}-target-date`}
      />

      <Text style={styles.label}>Priority</Text>
      <Segmented
        accessibilityLabel="Priority"
        options={GOAL_PRIORITY_OPTIONS}
        value={values.priority}
        onChange={onChangePriority}
        testID={`${testIDPrefix}-priority`}
      />
    </>
  );
}
