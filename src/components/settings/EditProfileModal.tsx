import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { KeyboardSheet } from '../shared/KeyboardSheet';
import { Button } from '../shared/Button';

/**
 * Settings' Profile editor — the same money-goal/confidence questions asked
 * at onboarding, editable later (people skip onboarding steps, or their
 * situation changes). Also where age lives, since it directly personalises
 * Your Future's projection ages.
 */
export function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateUser } = useAppState();
  const { colors, radius, spacing, typography } = useTheme();
  // Wave 9b — the shipped role resolver; tokens.typography carries no fontFamily.
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const [name, setName] = useState('');
  const [age, setAge] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(data.user.name);
    setAge(data.user.age ? String(data.user.age) : '');
  }, [visible, data.user]);

  function handleSave() {
    const ageValue = parseInt(age, 10);
    updateUser({
      name: name.trim(),
      age: !isNaN(ageValue) && ageValue > 0 ? ageValue : undefined,
    });
    onClose();
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: { ...typeStyle('meta', locale), fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.textPrimary,
        },
        tile: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        footerButton: { flex: 1 },
      }),
    [colors, radius, spacing, typography, locale]
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

      {/* Wave 9b — "Main money goal" and "Money confidence" were retired
          here. The first was a profile ENUM that looked like a trackable
          goal but never connected to the customer's real Goals; Settings now
          links to the authoritative Goals journey instead. The second showed
          a judgemental status ("Beginner") that drives no calculation, Score,
          eligibility or content anywhere. Both stored fields are preserved
          untouched for backward compatibility — only their editors are gone,
          and nothing is migrated or deleted. */}
    </KeyboardSheet>
  );
}
