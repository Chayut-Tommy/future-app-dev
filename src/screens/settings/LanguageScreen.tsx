import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { resolveDeviceLanguage } from '../../i18n';
import { brand } from '../../lib/brand';

type LanguageOption = 'en' | 'th' | 'system';

/**
 * The English and Thai preview lines here are fixed, bilingual-by-design —
 * they exist to let the user compare what Lulu sounds like in each
 * language, so they stay in their own language regardless of which locale
 * is currently active (PRD ask: Thai copy is warm and natural, not a
 * literal translation, so it can't be generated from the English string).
 */
const OPTIONS: { value: LanguageOption; labelKey: string; previewGreeting?: string; previewBody?: string }[] = [
  { value: 'en', labelKey: 'language.english', previewGreeting: 'Hello Tommy 👋', previewBody: "Let's build your financial future." },
  { value: 'th', labelKey: 'language.thai', previewGreeting: 'สวัสดี Tommy 👋', previewBody: `${brand.name} จะช่วยดูแลเรื่องเงินของคุณ` },
  { value: 'system', labelKey: 'language.matchDevice' },
];

export function LanguageScreen() {
  const navigation = useNavigation<any>();
  const { data, updateUser } = useAppState();
  const { t } = useTranslation();
  const { colors, radius, spacing, typography, cardShadow } = useTheme();

  const current: LanguageOption = data.user.language ?? 'system';
  const deviceLanguageLabel = resolveDeviceLanguage() === 'th' ? t('language.thai') : t('language.english');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { ...typography.title, fontSize: 22, color: colors.textPrimary, marginBottom: spacing.xs },
        subtitle: { ...typography.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.xl },
        option: {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          padding: spacing.lg,
          marginBottom: spacing.sm,
          borderWidth: 2,
          borderColor: 'transparent',
          ...cardShadow,
        },
        optionActive: { borderColor: colors.accent },
        optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
        optionLabel: { ...typography.heading, fontSize: 15, color: colors.textPrimary },
        previewGreeting: { ...typography.body, fontSize: 14, color: colors.textPrimary, marginTop: spacing.sm, fontWeight: '600' },
        previewBody: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
        deviceCaption: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: 4 },
      }),
    [colors, radius, spacing, typography, cardShadow]
  );

  return (
    <Screen title={t('settings.language')} onBack={() => navigation.goBack()}>
      <Text style={styles.title}>{t('language.title')}</Text>
      <Text style={styles.subtitle}>{t('language.subtitle')}</Text>

      {OPTIONS.map((opt) => {
        const active = current === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.option, active ? styles.optionActive : null]}
            activeOpacity={0.8}
            onPress={() => updateUser({ language: opt.value })}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionLabel}>{t(opt.labelKey)}</Text>
              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={active ? colors.accent : colors.textMuted}
              />
            </View>
            {opt.previewGreeting ? (
              <>
                <Text style={styles.previewGreeting}>{opt.previewGreeting}</Text>
                <Text style={styles.previewBody}>{opt.previewBody}</Text>
              </>
            ) : (
              <Text style={styles.deviceCaption}>{t('language.matchDeviceCurrent', { language: deviceLanguageLabel })}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </Screen>
  );
}
