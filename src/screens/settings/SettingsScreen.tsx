import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Screen } from '../../components/shared/Screen';
import { SectionCard } from '../../components/shared/SectionCard';
import { EditProfileModal } from '../../components/settings/EditProfileModal';
import { InfoSheet } from '../../components/shared/InfoSheet';
import { MONEY_GOALS, CONFIDENCE_LEVELS } from '../../lib/profileOptions';
import { ThemePreference } from '../../types/models';
import { brand } from '../../lib/brand';
import { MoneyPersona, MONEY_PERSONA_LABEL, resolveMoneyPersona } from '../../lib/calculations/moneyPersona';

const MONEY_PERSONA_OPTIONS: MoneyPersona[] = ['employee', 'freelancer', 'retiree', 'investor', 'business_owner'];

type LegalSheetKey = 'disclaimer' | 'assumptions' | 'privacy' | 'terms' | 'financialServices' | 'region' | null;

const LEGAL_CONTENT: Record<Exclude<LegalSheetKey, null>, { title: string; body: string }> = {
  disclaimer: {
    title: 'Educational information disclaimer',
    body: `${brand.name} provides educational information, estimates and money-planning tools based on the details you enter. It does not consider every aspect of your circumstances and does not provide personal financial advice. Results are estimates, and you remain responsible for your financial decisions. Consider seeking advice from a qualified professional where appropriate.`,
  },
  assumptions: {
    title: 'Calculation assumptions',
    body: `Figures shown throughout ${brand.name} — including projections, "${brand.scoreName}," and repayment scenarios — are calculated deterministically from the information you enter, using clearly-stated illustrative assumptions (e.g. an assumed annual return, an assumed or entered interest rate). They are estimates, not guarantees, and don't account for taxes, fees, or market conditions not entered.`,
  },
  privacy: {
    title: 'Privacy policy',
    body: `${brand.name} stores your financial information locally on this device. It is not uploaded to a server or shared with third parties by this app. A full privacy policy will be published before wider release.`,
  },
  terms: {
    title: 'Terms',
    body: `Terms of use will be published before wider release. Using ${brand.name} today is provided as-is, for personal educational use.`,
  },
  financialServices: {
    title: 'Financial-services disclosure',
    body: `${brand.name} is not a licensed financial adviser, bank, lender or credit provider. It does not hold or move your money, and nothing in the app is a personal recommendation to buy, sell, invest in, or apply for any financial product.`,
  },
  region: {
    title: 'Region and country applicability',
    body: `${brand.name} is currently designed for general, region-agnostic use and does not tailor its educational content to a specific country's tax, lending, or retirement rules. Where region matters (e.g. retirement account types), check the specifics for your own country.`,
  },
};

const LANGUAGE_LABELS: Record<string, string> = { en: 'language.english', th: 'language.thai', system: 'language.matchDevice' };

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'contrast-outline' },
];

const CARD_THEME_OPTIONS: { value: 'purple' | 'blue'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'purple', label: 'Purple', icon: 'sparkles-outline' },
  { value: 'blue', label: 'Ocean Blue', icon: 'water-outline' },
];

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { data, updateUser } = useAppState();
  const { t } = useTranslation();
  const { colors, radius, spacing, typography, preference, setPreference } = useTheme();
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [legalSheet, setLegalSheet] = useState<LegalSheetKey>(null);
  const languageLabel = t(LANGUAGE_LABELS[data.user.language ?? 'system']);
  const cardTheme = data.user.luluCardTheme ?? 'blue';

  const moneyGoalLabel = MONEY_GOALS.find((g) => g.value === data.user.moneyGoal)?.label ?? 'Not set';
  const confidenceLabel = CONFIDENCE_LEVELS.find((c) => c.value === data.user.confidenceLevel)?.label ?? 'Not set';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionTitle: { ...typography.heading, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm },
        optionRow: { flexDirection: 'row', gap: spacing.sm },
        option: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        optionActive: { backgroundColor: colors.accentSoft },
        optionLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 4 },
        optionLabelActive: { color: colors.accentStrong, fontWeight: '600' },
        row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
        rowLabel: { ...typography.body, fontSize: 14, color: colors.textPrimary },
        rowValue: { ...typography.caption, fontSize: 12, color: colors.textMuted },
        rowValueActive: { ...typography.caption, fontSize: 13, color: colors.accent, fontWeight: '600' },
        rowValueLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        legalBody: { ...typography.body, fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
        guestBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md, marginBottom: spacing.sm, alignSelf: 'flex-start' },
        guestBadgeText: { ...typography.micro, color: colors.accentStrong, fontWeight: '700' },
        dangerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
        dangerRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        dangerRowLabel: { ...typography.body, fontSize: 14, color: colors.danger, fontWeight: '600' },
      }),
    [colors, radius, spacing, typography]
  );

  return (
    <Screen title={t('settings.title')} onBack={() => navigation.goBack()}>
      <SectionCard>
        <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
        <View style={styles.optionRow}>
          {OPTIONS.map((opt) => {
            const active = preference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, active ? styles.optionActive : null]}
                onPress={() => setPreference(opt.value)}
              >
                <Ionicons name={opt.icon} size={20} color={active ? colors.accentStrong : colors.textSecondary} />
                <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Language')} activeOpacity={0.7}>
          <Text style={styles.rowLabel}>{t('settings.language')}</Text>
          <View style={styles.rowValueLink}>
            <Text style={styles.rowValueActive}>{languageLabel}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.rowLabel, { marginTop: spacing.md, marginBottom: spacing.sm }]}>{brand.scoreName} card style</Text>
        <View style={styles.optionRow}>
          {CARD_THEME_OPTIONS.map((opt) => {
            const active = cardTheme === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, active ? styles.optionActive : null]}
                onPress={() => updateUser({ luluCardTheme: opt.value })}
              >
                <Ionicons name={opt.icon} size={20} color={active ? colors.accentStrong : colors.textSecondary} />
                <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>{t('settings.profile')}</Text>
        <TouchableOpacity style={styles.row} onPress={() => setProfileModalVisible(true)} activeOpacity={0.7}>
          <Text style={styles.rowLabel}>Name</Text>
          <View style={styles.rowValueLink}>
            <Text style={styles.rowValueActive}>{data.user.name || 'Not set'}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => setProfileModalVisible(true)} activeOpacity={0.7}>
          <Text style={styles.rowLabel}>Age</Text>
          <View style={styles.rowValueLink}>
            <Text style={styles.rowValueActive}>{data.user.age ?? 'Not set'}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => setProfileModalVisible(true)} activeOpacity={0.7}>
          <Text style={styles.rowLabel}>Main money goal</Text>
          <View style={styles.rowValueLink}>
            <Text style={styles.rowValueActive}>{moneyGoalLabel}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => setProfileModalVisible(true)} activeOpacity={0.7}>
          <Text style={styles.rowLabel}>Money confidence</Text>
          <View style={styles.rowValueLink}>
            <Text style={styles.rowValueActive}>{confidenceLabel}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>How would you describe your income?</Text>
        <Text style={styles.rowValue}>{brand.name} uses this to choose wording for the Money tab only — calculations never change.</Text>
        {MONEY_PERSONA_OPTIONS.map((p) => {
          const active = (data.user.moneyPersona ?? resolveMoneyPersona(data.user)) === p;
          return (
            <TouchableOpacity key={p} style={styles.row} activeOpacity={0.7} onPress={() => updateUser({ moneyPersona: p })}>
              <Text style={styles.rowLabel}>{MONEY_PERSONA_LABEL[p]}</Text>
              {active ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
            </TouchableOpacity>
          );
        })}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        <View style={styles.guestBadge}>
          <Ionicons name="person-outline" size={13} color={colors.accentStrong} />
          <Text style={styles.guestBadgeText}>Guest mode</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Cloud sync & backup</Text>
          <Text style={styles.rowValue}>Coming soon</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Subscription</Text>
          <Text style={styles.rowValue}>Free plan</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Data & privacy</Text>
          <Text style={styles.rowValue}>Coming soon</Text>
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>{t('settings.security')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Face ID</Text>
          <Text style={styles.rowValue}>Coming soon</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>PIN unlock</Text>
          <Text style={styles.rowValue}>Coming soon</Text>
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>About and legal</Text>
        {(Object.keys(LEGAL_CONTENT) as Exclude<LegalSheetKey, null>[]).map((key) => (
          <TouchableOpacity key={key} style={styles.row} activeOpacity={0.7} onPress={() => setLegalSheet(key)}>
            <Text style={styles.rowLabel}>{LEGAL_CONTENT[key].title}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </SectionCard>

      <SectionCard>
        <TouchableOpacity style={styles.dangerRow} onPress={() => navigation.navigate('ResetLulu')} activeOpacity={0.7}>
          <View style={styles.dangerRowLeft}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.dangerRowLabel}>Reset {brand.name}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.danger} />
        </TouchableOpacity>
      </SectionCard>

      <EditProfileModal visible={profileModalVisible} onClose={() => setProfileModalVisible(false)} />
      <InfoSheet
        visible={legalSheet !== null}
        onClose={() => setLegalSheet(null)}
        title={legalSheet ? LEGAL_CONTENT[legalSheet].title : ''}
      >
        <Text style={styles.legalBody}>{legalSheet ? LEGAL_CONTENT[legalSheet].body : ''}</Text>
      </InfoSheet>
    </Screen>
  );
}
