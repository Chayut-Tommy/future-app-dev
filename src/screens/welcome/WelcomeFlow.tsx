import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAppState } from '../../state/AppStateContext';
import { Button } from '../../components/shared/Button';
import { ConfidenceLevel, MoneyGoal, UserProfile } from '../../types/models';
import { MONEY_GOALS, CONFIDENCE_LEVELS } from '../../lib/profileOptions';
import { brand } from '../../lib/brand';

type Step = 'welcome' | 'preview' | 'name' | 'goal' | 'confidence' | 'disclosure';

const DISCLOSURE_TEXT = `${brand.name} provides educational information, estimates and money-planning tools based on the details you enter. It does not consider every aspect of your circumstances and does not provide personal financial advice. Results are estimates, and you remain responsible for your financial decisions. Consider seeking advice from a qualified professional where appropriate.`;

// Purely decorative — a stylised stand-in for the Today screen, not the
// real component (PRD ask: "beautiful mock-up," not a live data view this
// early). Callout copy matches the PRD's suggested set exactly.
const PREVIEW_CALLOUTS: { emoji: string; label: string; corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center' }[] = [
  { emoji: '🤖', label: 'AI Financial Coach', corner: 'topLeft' },
  { emoji: '💰', label: 'Safe to Spend', corner: 'topRight' },
  { emoji: '📈', label: 'Wealth Tracking', corner: 'bottomLeft' },
  { emoji: '🎯', label: 'Financial Goals', corner: 'bottomRight' },
  { emoji: '💡', label: 'Smart Opportunities', corner: 'center' },
];

/**
 * First-launch experience (PRD ask: emotional connection from day one, and
 * enough for the app to personalise immediately). Every step after the name
 * is skippable — this stays a warm hello, not a forced wizard — except the
 * final disclosure, which must be acknowledged before onboarding can finish
 * (PRD ask, §6A). Detailed Wealth Map data entry (cash/savings/investments/
 * property/debt) was deliberately removed from this flow (PRD ask, §3A):
 * the main app has a more polished, contextual place to add those records,
 * and a long financial form here just duplicated that friction-free.
 */
function calloutOffset(corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight') {
  switch (corner) {
    case 'topLeft':
      return { top: -10, left: -34 };
    case 'topRight':
      return { top: 44, right: -40 };
    case 'bottomLeft':
      return { bottom: 56, left: -38 };
    case 'bottomRight':
      return { bottom: -10, right: -22 };
  }
}

export function WelcomeFlow() {
  const { completeOnboarding } = useAppState();
  const { colors, spacing, typography, radius, aiCardGradient, aiAccentColor, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [moneyGoal, setMoneyGoal] = useState<MoneyGoal | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Onboarding must be a single atomic write (PRD bug report: calling
  // several updateUser calls back-to-back each closed over the same
  // pre-update `data`, so only the very last persist() call actually
  // stuck). Every onboarding exit path funnels through completeOnboarding
  // so there's exactly one write.
  function baseUserPatch(): Partial<UserProfile> {
    return {
      hasSeenIntro: true,
      firstOpenedAt: new Date().toISOString(),
      disclosureAcknowledgedAt: new Date().toISOString(),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(moneyGoal ? { moneyGoal } : {}),
      ...(confidence ? { confidenceLevel: confidence } : {}),
    };
  }

  function finish() {
    completeOnboarding(baseUserPatch(), [], []);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Vertically centered, not pinned-to-top-with-a-spacer (PRD ask:
        // "welcome text feels too high" — a stronger emotional first
        // impression when the whole message reads as one centered block).
        container: {
          flex: 1,
          justifyContent: 'center',
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
        },
        welcomeButton: { marginTop: spacing.xxl },
        iconBadge: {
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: 'rgba(255,255,255,0.18)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xl,
        },
        title: { ...typography.title, fontSize: 28, color: '#fff', marginBottom: spacing.md },
        subtitle: { ...typography.heading, fontSize: 17, color: 'rgba(255,255,255,0.95)', fontWeight: '700', marginBottom: spacing.sm },
        body: { ...typography.body, fontSize: 16, color: 'rgba(255,255,255,0.9)', lineHeight: 24, marginBottom: spacing.md },
        plainContainer: { flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.xxl, paddingHorizontal: spacing.xl },
        previewContainer: {
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
          justifyContent: 'space-between',
        },
        previewHeading: { ...typography.title, fontSize: 24, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
        previewSubheading: { ...typography.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
        mockupOuter: { alignItems: 'center', paddingHorizontal: 46, paddingVertical: spacing.md },
        mockupWrap: { width: 220, position: 'relative' },
        mockupCard: {
          width: 220,
          borderRadius: 28,
          backgroundColor: colors.surface,
          padding: spacing.md,
          ...cardShadow,
        },
        mockupGreetingLine: { width: 92, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, marginBottom: 6 },
        mockupGreetingLineShort: { width: 60, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md },
        mockupAiCard: { borderRadius: 18, padding: spacing.md, marginBottom: spacing.md },
        mockupAiTopLine: { width: 80, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.85)', marginBottom: 10 },
        mockupRingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        mockupRing: {
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 4,
          borderColor: 'rgba(255,255,255,0.9)',
          borderRightColor: 'rgba(255,255,255,0.35)',
          borderBottomColor: 'rgba(255,255,255,0.35)',
        },
        mockupAiTextBlock: { flex: 1, gap: 6 },
        mockupAiLine: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.7)' },
        mockupStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
        mockupStatLabel: { width: 64, height: 7, borderRadius: 4, backgroundColor: colors.surfaceMuted },
        mockupStatValue: { width: 40, height: 10, borderRadius: 4 },
        mockupDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
        calloutChip: {
          position: 'absolute',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
          maxWidth: 168,
          ...cardShadow,
        },
        calloutEmoji: { fontSize: 15 },
        calloutLabel: { ...typography.micro, fontSize: 11, color: colors.textPrimary, fontWeight: '700', flexShrink: 1 },
        centerChipRow: { alignItems: 'center', marginTop: spacing.lg },
        stepLabel: { ...typography.title, fontSize: 22, color: colors.textPrimary, marginBottom: spacing.sm },
        stepHint: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.xl },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.lg,
          paddingVertical: 16,
          fontSize: 18,
          color: colors.textPrimary,
          marginBottom: spacing.lg,
        },
        disclosureText: {
          ...typography.caption,
          fontSize: 13,
          color: colors.textSecondary,
          lineHeight: 20,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        },
        ackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
        ackText: { ...typography.body, fontSize: 14, color: colors.textPrimary, flex: 1 },
        skipButton: { alignSelf: 'center', marginTop: spacing.md },
        skipText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
        tileGrid: { gap: spacing.sm, marginBottom: spacing.md },
        tile: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        tileActive: { backgroundColor: colors.accentSoft },
        tileEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
        tileLabel: { ...typography.body, fontSize: 15, color: colors.textPrimary, flex: 1 },
        tileLabelActive: { color: colors.accentStrong, fontWeight: '700' },
        confidenceRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
        confidenceTile: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: spacing.lg,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceMuted,
        },
        confidenceTileActive: { backgroundColor: colors.accentSoft },
        confidenceEmoji: { fontSize: 28, marginBottom: spacing.xs },
        confidenceLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
        confidenceLabelActive: { color: colors.accentStrong },
      }),
    [colors, spacing, typography, radius, insets]
  );

  if (step === 'welcome') {
    return (
      <LinearGradient colors={aiCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
        <View style={[styles.iconBadge, { alignSelf: 'center' }]}>
          <Ionicons name="sparkles" size={32} color="#fff" />
        </View>
        <Text style={[styles.title, { textAlign: 'center' }]}>Meet {brand.name}</Text>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>Your money has a story.</Text>
        <Text style={[styles.body, { textAlign: 'center' }]}>
          {brand.name} helps you understand where you are today and what small steps could improve tomorrow.
        </Text>
        <Button label="Start my journey" variant="secondary" onPress={() => setStep('preview')} style={styles.welcomeButton} />
      </LinearGradient>
    );
  }

  if (step === 'preview') {
    const cornerCallouts = PREVIEW_CALLOUTS.filter(
      (c): c is typeof c & { corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' } => c.corner !== 'center'
    );
    const centerCallout = PREVIEW_CALLOUTS.find((c) => c.corner === 'center');
    return (
      <View style={styles.previewContainer}>
        <View>
          <Text style={styles.previewHeading}>This is {brand.name}</Text>
          <Text style={styles.previewSubheading}>A daily snapshot of your money — before you enter a single number.</Text>
          <View style={styles.mockupOuter}>
            <View style={styles.mockupWrap}>
              <View style={styles.mockupCard}>
                <View style={styles.mockupGreetingLine} />
                <View style={styles.mockupGreetingLineShort} />
                <LinearGradient colors={aiCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mockupAiCard}>
                  <View style={styles.mockupAiTopLine} />
                  <View style={styles.mockupRingRow}>
                    <View style={styles.mockupRing} />
                    <View style={styles.mockupAiTextBlock}>
                      <View style={[styles.mockupAiLine, { width: '70%' }]} />
                      <View style={[styles.mockupAiLine, { width: '45%' }]} />
                    </View>
                  </View>
                </LinearGradient>
                <View style={styles.mockupStatRow}>
                  <View style={styles.mockupStatLabel} />
                  <View style={[styles.mockupStatValue, { backgroundColor: colors.accent, width: 56 }]} />
                </View>
                <View style={styles.mockupDivider} />
                <View style={styles.mockupStatRow}>
                  <View style={styles.mockupStatLabel} />
                  <View style={[styles.mockupStatValue, { backgroundColor: colors.navy, width: 48 }]} />
                </View>
                <View style={styles.mockupDivider} />
                <View style={styles.mockupStatRow}>
                  <View style={styles.mockupStatLabel} />
                  <View style={[styles.mockupStatValue, { backgroundColor: colors.gold, width: 40 }]} />
                </View>
              </View>
              {cornerCallouts.map((c) => (
                <View key={c.label} style={[styles.calloutChip, calloutOffset(c.corner)]}>
                  <Text style={styles.calloutEmoji}>{c.emoji}</Text>
                  <Text style={styles.calloutLabel} numberOfLines={1}>
                    {c.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          {centerCallout ? (
            <View style={styles.centerChipRow}>
              <View style={[styles.calloutChip, { position: 'relative', maxWidth: undefined }]}>
                <Text style={styles.calloutEmoji}>{centerCallout.emoji}</Text>
                <Text style={styles.calloutLabel}>{centerCallout.label}</Text>
              </View>
            </View>
          ) : null}
        </View>
        <Button label="Continue" onPress={() => setStep('name')} />
      </View>
    );
  }

  if (step === 'name') {
    return (
      <KeyboardAvoidingView style={styles.plainContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.stepLabel}>What should {brand.name} call you?</Text>
        <Text style={styles.stepHint}>Everything else is optional — you can add it whenever you're ready.</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => setStep('goal')}
        />
        <Button label="Continue" onPress={() => setStep('goal')} disabled={name.trim().length === 0} />
        <TouchableOpacity style={styles.skipButton} onPress={finish}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'goal') {
    return (
      <View style={styles.plainContainer}>
        <Text style={styles.stepLabel}>What's your main money goal?</Text>
        <Text style={styles.stepHint}>{brand.name} will use this to personalise what you see first.</Text>
        <View style={styles.tileGrid}>
          {MONEY_GOALS.map((g) => {
            const active = moneyGoal === g.value;
            return (
              <TouchableOpacity key={g.value} style={[styles.tile, active ? styles.tileActive : null]} onPress={() => setMoneyGoal(g.value)}>
                <Ionicons name={g.icon} size={20} color={active ? colors.accentStrong : colors.textSecondary} />
                <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{g.label}</Text>
                {active ? <Ionicons name="checkmark-circle" size={20} color={colors.accentStrong} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <Button label="Continue" onPress={() => setStep('confidence')} disabled={!moneyGoal} />
        <TouchableOpacity style={styles.skipButton} onPress={finish}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'confidence') {
    return (
      <View style={styles.plainContainer}>
        <Text style={styles.stepLabel}>How confident do you feel with money?</Text>
        <Text style={styles.stepHint}>There's no wrong answer — this just shapes {brand.name}'s tone with you.</Text>
        <View style={styles.confidenceRow}>
          {CONFIDENCE_LEVELS.map((c) => {
            const active = confidence === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                style={[styles.confidenceTile, active ? styles.confidenceTileActive : null]}
                onPress={() => setConfidence(c.value)}
              >
                <Text style={styles.confidenceEmoji}>{c.emoji}</Text>
                <Text style={[styles.confidenceLabel, active ? styles.confidenceLabelActive : null]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Button label="Continue" onPress={() => setStep('disclosure')} disabled={!confidence} />
        <TouchableOpacity style={styles.skipButton} onPress={() => setStep('disclosure')}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Required — not skippable (PRD ask, §6A: "require acknowledgement before
  // finishing onboarding"). Every other step in this flow can be skipped;
  // this one can't, since it's the one piece of legal/safety context the
  // rest of the app's non-prescriptive language design assumes is in place.
  return (
    <View style={styles.plainContainer}>
      <Text style={styles.stepLabel}>Before you get started</Text>
      <Text style={styles.stepHint}>Please read and acknowledge the following.</Text>
      <Text style={styles.disclosureText}>{DISCLOSURE_TEXT}</Text>
      <TouchableOpacity style={styles.ackRow} onPress={() => setAcknowledged((v) => !v)} activeOpacity={0.8}>
        <Ionicons name={acknowledged ? 'checkbox' : 'square-outline'} size={22} color={acknowledged ? colors.accentStrong : colors.textMuted} />
        <Text style={styles.ackText}>I understand and acknowledge this</Text>
      </TouchableOpacity>
      <Button label="Get started" onPress={finish} disabled={!acknowledged} />
    </View>
  );
}
