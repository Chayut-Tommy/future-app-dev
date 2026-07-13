import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';
import { MONEY_GOALS, CONFIDENCE_LEVELS } from '../../lib/profileOptions';
import { ConfidenceLevel, MoneyGoal } from '../../types/models';

/**
 * Settings' Profile editor — the same money-goal/confidence questions asked
 * at onboarding, editable later (people skip onboarding steps, or their
 * situation changes). Also where age lives, since it directly personalises
 * Your Future's projection ages.
 */
export function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [moneyGoal, setMoneyGoal] = useState<MoneyGoal | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(data.user.name);
    setAge(data.user.age ? String(data.user.age) : '');
    setMoneyGoal(data.user.moneyGoal ?? null);
    setConfidence(data.user.confidenceLevel ?? null);
  }, [visible, data.user]);

  function handleSave() {
    const ageValue = parseInt(age, 10);
    updateUser({
      name: name.trim(),
      age: !isNaN(ageValue) && ageValue > 0 ? ageValue : undefined,
      ...(moneyGoal ? { moneyGoal } : {}),
      ...(confidence ? { confidenceLevel: confidence } : {}),
    });
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
        },
        tileGrid: { gap: spacing.sm },
        tile: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        tileActive: { backgroundColor: colors.accentSoft },
        tileLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary, flex: 1 },
        tileLabelActive: { color: colors.accentStrong, fontWeight: '700' },
        confidenceRow: { flexDirection: 'row', gap: spacing.sm },
        confidenceTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
        confidenceTileActive: { backgroundColor: colors.accentSoft },
        confidenceEmoji: { fontSize: 22, marginBottom: 4 },
        confidenceLabel: { ...typography.caption, fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
        confidenceLabelActive: { color: colors.accentStrong },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <KeyboardSheet
      visible={visible}
      onClose={onClose}
      title="Edit profile"
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
          <Button label="Save" onPress={handleSave} style={styles.footerButton} />
        </>
      }
    >
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} clearButtonMode="while-editing" />

      <Text style={styles.label}>Age (optional — personalises Your Future)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 32"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        value={age}
        onChangeText={setAge}
        clearButtonMode="while-editing"
      />

      <Text style={styles.label}>Main money goal</Text>
      <View style={styles.tileGrid}>
        {MONEY_GOALS.map((g) => {
          const active = moneyGoal === g.value;
          return (
            <TouchableOpacity key={g.value} style={[styles.tile, active ? styles.tileActive : null]} onPress={() => setMoneyGoal(g.value)}>
              <Ionicons name={g.icon} size={18} color={active ? colors.accentStrong : colors.textSecondary} />
              <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{g.label}</Text>
              {active ? <Ionicons name="checkmark-circle" size={18} color={colors.accentStrong} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Money confidence</Text>
      <View style={styles.confidenceRow}>
        {CONFIDENCE_LEVELS.map((c) => {
          const active = confidence === c.value;
          return (
            <TouchableOpacity key={c.value} style={[styles.confidenceTile, active ? styles.confidenceTileActive : null]} onPress={() => setConfidence(c.value)}>
              <Text style={styles.confidenceEmoji}>{c.emoji}</Text>
              <Text style={[styles.confidenceLabel, active ? styles.confidenceLabelActive : null]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </KeyboardSheet>
  );
}
