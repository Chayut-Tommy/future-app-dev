import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';
import { useAppState } from '../../state/AppStateContext';
import { Button } from '../../components/shared/Button';
import { CurrencyField } from '../../components/shared/fields/CurrencyField';
import { TextField } from '../../components/shared/fields/TextField';
import { DateTriggerField } from '../../components/shared/fields/DateTriggerField';
import { InlineSelect } from '../../components/shared/fields/InlineSelect';
import { FocusedPickerProvider } from '../../components/shared/fields/FocusedPickerHost';
import { parseMoneyInput } from '../../lib/calculations/money';
import { Asset, PayFrequency, RecurringItem, UserProfile } from '../../types/models';
import { brand } from '../../lib/brand';
import { hapticWarning } from '../../lib/haptics';
import { useCelebration } from '../../state/CelebrationContext';
import { incomeSourceIcon } from '../../lib/addIcons';
import { INCOME_SOURCE_IDS, INCOME_SOURCE_LABEL, INCOME_SOURCE_RECORD_ICON } from '../../lib/incomeSources';
import { onFeaturedAlpha } from '../../theme/semanticTokens';
import { OnboardingAmbientCanvas } from './OnboardingAmbientCanvas';
import { OnboardingMediaFrame } from './OnboardingMediaFrame';
import {
  COMPLETION_FAILURE_COPY,
  ONBOARDING_CADENCES,
  OnboardingStep,
  PREVIEW_COPY,
  isAcceptableAgeInput,
  isValidName,
  nextStep,
  parseOptionalAge,
  previousStep,
  progressLabel,
  skipDestination,
} from '../../lib/onboardingFlow';

/**
 * Wave 9c — the legally blocked disclosure. This wording must remain
 * byte-for-byte identical; only its layout, semantics and interaction may
 * change. Exported so the byte-identity test compares the REAL constant.
 */
export const DISCLOSURE_TEXT = `${brand.name} provides educational information, estimates and money-planning tools based on the details you enter. It does not consider every aspect of your circumstances and does not provide personal financial advice. Results are estimates, and you remain responsible for your financial decisions. Consider seeking advice from a qualified professional where appropriate.`;

/** Correction A — the payday field's factual purpose, shown with the shared
 * date picker. Exported for the copy tests. */
export const PAYDAY_SUPPORT_COPY = `This helps ${brand.name} place your income in What happens next. You can update it later.`;

/**
 * First-launch experience: the canonical seven-state journey (Wave 9c) —
 * Welcome, Product preview, Name, Age, Pay cadence, optional Initial money
 * setup, and the mandatory Disclosure — rendered inside the ONE shared
 * "Light Ocean Ambient Canvas" (final correction pass, Correction E), so
 * the visual system carries through every state instead of vanishing after
 * the welcome screen.
 *
 * WHAT THE FINAL CORRECTION PASS CHANGES HERE:
 *
 * A — COMPLETE, SCHEDULABLE INCOME. The optional income block previously
 * persisted `nextDueDate: now, nextDueDateUnknown: true` for EVERY cadence
 * — the "customer genuinely doesn't know" representation that scheduling,
 * the Money timeline and reminders all (correctly) skip. So a fortnightly
 * salary existed (Wealth's monthly conversion was right) while Money still
 * asked for an expected payday and "What happens next" never showed it.
 * The block now collects the canonical minimum the real Add Income journey
 * requires — structured source (the same shared selector and ids), name,
 * exact amount, the state-4 cadence, and a real next expected payday via
 * the shared focused date picker. `nextDueDateUnknown` is stamped only for
 * an irregular cadence with no date — exactly the canonical semantics.
 *
 * G — FIELD-AWARE CALM VALIDATION. One shared `setupTouched` previously
 * marked the WHOLE step touched on the first blur, so leaving the name
 * field to type the amount immediately painted the amount row red. Now:
 * a field's own formatting problem may appear once THAT field blurs; a
 * missing sibling appears only after Continue is attempted; clearing a
 * block returns it to a valid skipped state; and FieldShell's reserved
 * message row keeps the layout still throughout. Nothing is coerced to 0.
 *
 * Preserved from the accepted rebuild: name required, one shared
 * jumpToDisclosure() skip path (states 3–5 only), byte-identical
 * disclosure, consent stamped only by the disclosure checkbox, and
 * WRITE-FIRST atomic completion with the inline failure banner + Retry.
 */
export function WelcomeFlow() {
  const { completeOnboarding } = useAppState();
  const { confirmSaveSuccess } = useCelebration();
  const { colors, semantic, spacing, radius, aiCardGradient, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;

  const [step, setStep] = useState<OnboardingStep>('welcome');
  // Drafts — all local; nothing persists before the atomic completion.
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [cadence, setCadence] = useState<PayFrequency | null>(null);
  const [incomeSourceId, setIncomeSourceId] = useState<string | null>(null);
  const [incomeLabel, setIncomeLabel] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomePayday, setIncomePayday] = useState<string | null>(null);
  const [balanceLabel, setBalanceLabel] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [everydayLabel, setEverydayLabel] = useState('');
  const [everydayProvider, setEverydayProvider] = useState('');
  const [everydayAmount, setEverydayAmount] = useState('');
  // Correction G — field-aware interaction state. `blurred` records which
  // individual fields the customer has actually left; `setupAttempted`
  // latches once Continue is pressed while a block is incomplete. A field's
  // own formatting error may show after ITS blur; a missing sibling shows
  // only after the attempt.
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const [setupAttempted, setSetupAttempted] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState(false);

  const headingRef = useRef<Text>(null);

  function markBlurred(key: string) {
    setBlurred((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }

  // Ref guard for rapid double-tap: `isSubmitting` state cannot block a
  // second press that lands in the same frame (setState has not applied
  // yet), so the ref is the authoritative in-flight latch.
  const inFlightRef = useRef(false);

  // Focus + one announcement per state change: the heading receives
  // accessibility focus and the truthful "Step N of 7" is spoken once.
  useEffect(() => {
    const handle = headingRef.current ? findNodeHandle(headingRef.current) : null;
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
    AccessibilityInfo.announceForAccessibility(progressLabel(step));
  }, [step]);

  const parsedIncome = parseMoneyInput(incomeAmount);
  const parsedBalance = parseMoneyInput(balanceAmount);
  const parsedEveryday = parseMoneyInput(everydayAmount);
  // "Started" is judged from the two CLEARABLE substance fields. The source
  // selector and the date picker have no unset affordance, so counting them
  // would make an accidental tap an unclearable trap; on their own they
  // form no record fragment (nothing is persisted without a name and
  // amount), and choosing a source prefills the name anyway.
  const incomeStarted = incomeLabel.trim().length > 0 || incomeAmount.trim().length > 0;
  const balanceStarted = balanceLabel.trim().length > 0 || balanceAmount.trim().length > 0;
  const everydayStarted = everydayLabel.trim().length > 0 || everydayAmount.trim().length > 0 || everydayProvider.trim().length > 0;
  // A partially-filled optional record blocks Continue rather than being
  // silently dropped or half-persisted. The income block's completeness IS
  // the canonical Add Income minimum: name, valid amount, cadence, and a
  // real payday for every predictable cadence (genuinely optional only for
  // irregular income — never invented, never defaulted to today/tomorrow/
  // month-end).
  const incomeDraftValid =
    !incomeStarted ||
    (incomeLabel.trim().length > 0 &&
      parsedIncome.valid &&
      parsedIncome.amount > 0 &&
      cadence !== null &&
      (cadence === 'irregular' || incomePayday !== null));
  const balanceDraftValid = !balanceStarted || (balanceLabel.trim().length > 0 && parsedBalance.valid && parsedBalance.amount > 0);
  const everydayDraftValid = !everydayStarted || (everydayLabel.trim().length > 0 && parsedEveryday.valid && parsedEveryday.amount > 0);

  /** Correction G's per-amount-field message: a formatting problem is the
   * field's own and may show once it blurs (or once Continue was attempted);
   * an EMPTY amount is a missing sibling and waits for the attempt. */
  function amountMessage(key: string, raw: string, parsed: { valid: boolean; amount?: number }, blockStarted: boolean): string | null {
    const hasContent = raw.trim().length > 0;
    const fieldSeen = blurred[key] || setupAttempted;
    if (hasContent && !parsed.valid && fieldSeen) return 'Enter an amount to the nearest cent (up to 2 decimal places).';
    if (hasContent && parsed.valid && (parsed.amount ?? 0) <= 0 && fieldSeen) return 'Enter an amount greater than zero.';
    if (!hasContent && setupAttempted && blockStarted) return 'Add an amount, or clear the block to skip it.';
    return null;
  }

  /** Missing-name messages only ever appear after an attempted Continue. */
  function nameMessage(raw: string, blockStarted: boolean): string | null {
    if (setupAttempted && blockStarted && raw.trim().length === 0) return 'Add a name, or clear the block to skip it.';
    return null;
  }

  /** Local midnight today for the shared future-date picker — the same
   * start-of-day rule the canonical income form uses, so "Today" stays
   * selectable regardless of the time of day. */
  const startOfTodayLocal = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  const incomeSourceOptions = useMemo(
    () => INCOME_SOURCE_IDS.map((id) => ({ value: id, label: INCOME_SOURCE_LABEL[id] ?? 'Income', icon: incomeSourceIcon(id) })),
    []
  );

  function chooseIncomeSource(nextSourceId: string) {
    setIncomeSourceId(nextSourceId);
    // The canonical prefill: the name is only ever filled when the customer
    // has not typed one — never overwritten.
    setIncomeLabel((prev) => prev || INCOME_SOURCE_LABEL[nextSourceId] || 'Income');
  }

  /** Correction A — the optional income draft is now the COMPLETE canonical
   * shape: the customer's exact amount, the state-4 cadence, the chosen
   * payday, and the same source-derived icon the real journey stamps.
   * `nextDueDateUnknown` is true only for irregular income with no date —
   * a valid canonical state — and never for a predictable cadence. */
  function incomeDrafts(): Omit<RecurringItem, 'id'>[] {
    if (!incomeStarted || !incomeDraftValid || !cadence) return [];
    const scheduled = incomePayday !== null;
    return [
      {
        type: 'income',
        label: incomeLabel.trim(),
        amount: parsedIncome.valid ? parsedIncome.amount : 0,
        frequency: cadence,
        nextDueDate: scheduled ? incomePayday : new Date().toISOString(),
        nextDueDateUnknown: !scheduled,
        isFixed: true,
        active: true,
        icon: incomeSourceId ? INCOME_SOURCE_RECORD_ICON[incomeSourceId] ?? 'cash-outline' : 'cash-outline',
      },
    ];
  }

  /** Optional balance drafts — the checklist's own accepted savings shape,
   * and the canonical Everyday `Asset` shape (name, optional provider,
   * exact-cents balance). Never an unnamed or $0 record.
   * `includeInMoneyCalculations` is deliberately omitted so the EXISTING
   * engine default applies (resolveIncludeInMoneyCalculations: everyday
   * defaults to included) — no silent per-onboarding override. */
  function balanceDrafts(): Omit<Asset, 'id'>[] {
    const drafts: Omit<Asset, 'id'>[] = [];
    if (balanceStarted && balanceDraftValid) {
      drafts.push({ type: 'savings', label: balanceLabel.trim(), currentValue: parsedBalance.valid ? parsedBalance.amount : 0 });
    }
    if (everydayStarted && everydayDraftValid) {
      drafts.push({
        type: 'everyday',
        label: everydayLabel.trim(),
        currentValue: parsedEveryday.valid ? parsedEveryday.amount : 0,
        ...(everydayProvider.trim() ? { provider: everydayProvider.trim() } : {}),
      });
    }
    return drafts;
  }

  /** THE one shared Skip path (states 3-5 only): straight to the
   * disclosure, never to the next optional question. */
  function jumpToDisclosure() {
    const destination = skipDestination(step);
    if (destination) setStep(destination);
  }

  /**
   * The atomic completion — invoked ONLY from the disclosure state with the
   * checkbox acknowledged. Consent is stamped here and nowhere else.
   * Failure persists nothing (write-first seam), keeps every draft and the
   * truthful checkbox state, shows the inline banner once, and Retry
   * re-invokes this same payload.
   */
  async function finish() {
    if (inFlightRef.current || !acknowledged) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setCompletionError(false);
    const incomes = incomeDrafts();
    const userPatch: Partial<UserProfile> = {
      hasSeenIntro: true,
      firstOpenedAt: new Date().toISOString(),
      disclosureAcknowledgedAt: new Date().toISOString(),
      name: name.trim(),
      ...(parseOptionalAge(age) !== undefined ? { age: parseOptionalAge(age) } : {}),
      ...(cadence ? { payFrequency: cadence } : {}),
      // The model's own designated setup-time field for the picked source —
      // presentational context, exactly like the canonical journey's icon
      // prefill; written only when an income is genuinely being created.
      ...(incomes.length > 0 && incomeSourceId ? { incomeSource: incomeSourceId } : {}),
    };
    try {
      await completeOnboarding(userPatch, balanceDrafts(), [], incomes);
      // Success: RootNavigator switches on the committed hasSeenIntro —
      // navigation happens only after persistence succeeded.
      // Wave 10 closure — completion IS an engine-confirmed save, so the
      // action fires its one softSuccess here, at its own authoritative
      // post-success boundary. No factual toast: the navigation change and
      // the arrival milestone are this action's visual feedback (that
      // later celebration is haptically silent, like every celebration).
      confirmSaveSuccess();
    } catch {
      setCompletionError(true);
      // Wave 10 four-event matrix: a save failure is the `warning` event.
      hapticWarning();
      AccessibilityInfo.announceForAccessibility(COMPLETION_FAILURE_COPY);
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        welcomeContainer: {
          flex: 1,
          justifyContent: 'center',
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
        },
        // The spark identity badge and the CTA carry the theme's own
        // INTERACTIVE identity (Ocean blue / Purple / Sunrise) — never the
        // legacy green accent, which read as success-mint on the pastel
        // canvas (Correction G).
        iconBadge: {
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: semantic.interactiveTint,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xl,
        },
        welcomeCta: { marginTop: spacing.xxl, backgroundColor: semantic.interactive },
        title: { ...typeStyle('titleScreen', locale), color: colors.textPrimary, marginBottom: spacing.md },
        subtitle: { ...typeStyle('titleCard', locale), color: colors.textPrimary, fontWeight: '700', marginBottom: spacing.sm },
        body: { ...typeStyle('body', locale), color: colors.textSecondary, marginBottom: spacing.md },
        plainContainer: { flex: 1 },
        plainContent: {
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
        },
        // Correction E — the calm content surface each form state sits on,
        // over the shared ambient canvas: field boundaries and contrast stay
        // exactly as the theme defines them, while the ambience stays
        // visible around the card instead of disappearing at Step 2.
        surfaceCard: {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.lg,
          ...cardShadow,
        },
        progress: { ...typeStyle('eyebrow', locale), color: colors.textMuted, marginBottom: spacing.sm },
        stepLabel: { ...typeStyle('titleSection', locale), color: colors.textPrimary, marginBottom: spacing.sm },
        stepHint: { ...typeStyle('support', locale), color: colors.textSecondary, marginBottom: spacing.xl },
        sectionLabel: { ...typeStyle('titleCard', locale), color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
        fieldSupport: { ...typeStyle('meta', locale), color: colors.textSecondary, marginTop: -spacing.xs, marginBottom: spacing.md },
        input: {
          ...typeStyle('body', locale),
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          paddingHorizontal: spacing.lg,
          paddingVertical: 16,
          fontSize: 18,
          color: colors.textPrimary,
          marginBottom: spacing.lg,
        },
        previewContainer: {
          flex: 1,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
          justifyContent: 'space-between',
        },
        previewHeading: { ...typeStyle('titleSection', locale), color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
        previewBody: { ...typeStyle('body', locale), color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
        mediaFrameWrap: { width: '100%', maxWidth: 320, alignSelf: 'center', paddingVertical: spacing.md },
        mockupCard: {
          width: 220,
          borderRadius: 28,
          backgroundColor: colors.surface,
          padding: spacing.md,
          ...cardShadow,
        },
        mockupGreetingLine: { width: 92, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, marginBottom: 6 },
        mockupGreetingLineShort: { width: 60, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md },
        mockupHeroCard: { borderRadius: 18, padding: spacing.md, marginBottom: spacing.md },
        mockupHeroTopLine: { width: 80, height: 7, borderRadius: 4, backgroundColor: onFeaturedAlpha(0.85), marginBottom: 10 },
        mockupRingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        mockupRing: {
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 4,
          borderColor: onFeaturedAlpha(0.9),
          borderRightColor: onFeaturedAlpha(0.35),
          borderBottomColor: onFeaturedAlpha(0.35),
        },
        mockupHeroTextBlock: { flex: 1, gap: 6 },
        mockupHeroLine: { height: 7, borderRadius: 4, backgroundColor: onFeaturedAlpha(0.7) },
        mockupStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
        mockupStatLabel: { width: 64, height: 7, borderRadius: 4, backgroundColor: colors.surfaceMuted },
        mockupStatValue: { width: 40, height: 10, borderRadius: 4 },
        mockupDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
        tileGrid: { gap: spacing.sm, marginBottom: spacing.lg },
        tile: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: 56,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
        },
        tileActive: { borderColor: colors.accentStrong, borderWidth: 2, backgroundColor: colors.surface },
        tileLabel: { ...typeStyle('body', locale), color: colors.textPrimary, flex: 1 },
        tileLabelActive: { color: colors.accentStrong, fontWeight: '700' },
        disclosureText: {
          ...typeStyle('support', locale),
          color: colors.textSecondary,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.control,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        },
        ackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginBottom: spacing.lg },
        ackText: { ...typeStyle('body', locale), color: colors.textPrimary, flex: 1 },
        errorBanner: {
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.danger,
          backgroundColor: colors.dangerSoft,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        errorText: { ...typeStyle('support', locale), color: colors.danger },
        skipButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg },
        skipText: { ...typeStyle('support', locale), color: colors.textMuted, fontWeight: '600' },
        backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: spacing.sm },
        backText: { ...typeStyle('support', locale), color: colors.textSecondary, fontWeight: '600' },
      }),
    [colors, semantic, spacing, radius, insets, locale, cardShadow]
  );

  /** Shared chrome for states 2-6: Back, truthful progress, and the focused
   * heading, on the calm surface card over the ambient canvas. One scroll
   * owner per state. A PLAIN render function, not a nested component — a
   * component defined inside render gets a new identity every render,
   * remounting its subtree and dropping keyboard focus on every keystroke. */
  function renderStep(title: string, hint: string, children: React.ReactNode) {
    return (
      <KeyboardAvoidingView style={styles.plainContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.plainContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStep(previousStep(step))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="onboarding-back"
          >
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.surfaceCard}>
            <Text style={styles.progress} testID="onboarding-progress">{progressLabel(step)}</Text>
            <Text ref={headingRef} style={styles.stepLabel} accessibilityRole="header" testID="onboarding-heading">
              {title}
            </Text>
            {hint ? <Text style={styles.stepHint}>{hint}</Text> : null}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderSkip() {
    if (!skipDestination(step)) return null;
    return (
      <TouchableOpacity
        style={styles.skipButton}
        onPress={jumpToDisclosure}
        accessibilityRole="button"
        accessibilityLabel="Skip for now"
        accessibilityHint="Skips to the disclosure step"
        testID="onboarding-skip"
      >
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    );
  }

  function renderCurrentStep() {
    if (step === 'welcome') {
      return (
        <View style={styles.welcomeContainer}>
          <View style={[styles.iconBadge, { alignSelf: 'center' }]}>
            <Ionicons name="sparkles" size={32} color={semantic.interactive} />
          </View>
          <Text ref={headingRef} style={[styles.title, { textAlign: 'center' }]} accessibilityRole="header">
            Meet {brand.name}
          </Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>{PREVIEW_COPY.heading}</Text>
          <Text style={[styles.body, { textAlign: 'center' }]}>{PREVIEW_COPY.body}</Text>
          {/* The canonical interactive colour, not the green accent —
              `onAccent` is white in light and near-black in dark, so the
              label keeps its contrast on the interactive blue in both
              schemes. */}
          <Button
            label="Get started"
            onPress={() => setStep(nextStep(step))}
            style={styles.welcomeCta}
            testID="onboarding-get-started"
          />
        </View>
      );
    }

    if (step === 'preview') {
      return (
        <View style={styles.previewContainer}>
          <View>
            <Text style={styles.progress} testID="onboarding-progress">{progressLabel(step)}</Text>
            <Text ref={headingRef} style={styles.previewHeading} accessibilityRole="header" testID="onboarding-heading">
              {PREVIEW_COPY.heading}
            </Text>
            <Text style={styles.previewBody}>{PREVIEW_COPY.body}</Text>
            {/* Correction F — the future promotional image's slot. Until the
                owner supplies that local asset, the accepted skeleton
                illustration is the placeholder inside the SAME frame, so the
                swap will change pixels and nothing else. */}
            <View style={styles.mediaFrameWrap}>
              <OnboardingMediaFrame>
                <View style={styles.mockupCard}>
                  <View style={styles.mockupGreetingLine} />
                  <View style={styles.mockupGreetingLineShort} />
                  <LinearGradient colors={aiCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mockupHeroCard}>
                    <View style={styles.mockupHeroTopLine} />
                    <View style={styles.mockupRingRow}>
                      <View style={styles.mockupRing} />
                      <View style={styles.mockupHeroTextBlock}>
                        <View style={[styles.mockupHeroLine, { width: '70%' }]} />
                        <View style={[styles.mockupHeroLine, { width: '45%' }]} />
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
              </OnboardingMediaFrame>
            </View>
          </View>
          <Button label="Continue" testID="onboarding-continue" onPress={() => setStep(nextStep(step))} />
        </View>
      );
    }

    if (step === 'name') {
      return renderStep(
        `What should ${brand.name} call you?`,
        'Just your name for now — the next few questions are optional.',
        <>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              if (isValidName(name)) setStep(nextStep(step));
            }}
            accessibilityLabel="Your name"
            testID="onboarding-name-input"
          />
          <Button label="Continue" testID="onboarding-continue" onPress={() => setStep(nextStep(step))} disabled={!isValidName(name)} />
        </>
      );
    }

    if (step === 'age') {
      return renderStep(
        'How old are you?',
        `Optional — ${brand.name} only uses it to label the illustrative Your Future timeline with ages.`,
        <>
          <TextInput
            style={styles.input}
            placeholder="Your age"
            placeholderTextColor={colors.textMuted}
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (isAcceptableAgeInput(age)) setStep(nextStep(step));
            }}
            accessibilityLabel="Your age, optional"
            testID="onboarding-age-input"
          />
          <Button label="Continue" testID="onboarding-continue" onPress={() => setStep(nextStep(step))} disabled={!isAcceptableAgeInput(age)} />
          {renderSkip()}
        </>
      );
    }

    if (step === 'cadence') {
      return renderStep(
        'How often are you paid?',
        'Optional — this shapes the Available until payday period. You can change it any time.',
        <>
          <View style={styles.tileGrid} accessibilityRole="radiogroup">
            {ONBOARDING_CADENCES.map((option) => {
              const active = cadence === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.tile, active ? styles.tileActive : null]}
                  onPress={() => setCadence(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option.label}
                  testID={`onboarding-cadence-${option.value}`}
                >
                  <Text style={[styles.tileLabel, active ? styles.tileLabelActive : null]}>{option.label}</Text>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={active ? colors.accentStrong : colors.textMuted}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          <Button label="Continue" testID="onboarding-continue" onPress={() => setStep(nextStep(step))} disabled={!cadence} />
          {renderSkip()}
        </>
      );
    }

    if (step === 'setup') {
      const setupValid = incomeDraftValid && balanceDraftValid && everydayDraftValid;
      return renderStep(
        'Add a starting point?',
        `Optional — anything you add gives ${brand.name} something real to show. Leave any block blank to skip it.`,
        <>
          <Text style={styles.sectionLabel} accessibilityRole="header">Regular income</Text>
          <InlineSelect
            label="Where does this income come from?"
            placeholder="Choose a source"
            value={incomeSourceId}
            onChange={chooseIncomeSource}
            options={incomeSourceOptions}
            testID="onboarding-income-source"
          />
          <TextField
            label="Name"
            placeholder="e.g. Salary"
            value={incomeLabel}
            onChangeText={setIncomeLabel}
            onBlur={() => markBlurred('incomeName')}
            message={nameMessage(incomeLabel, incomeStarted)}
          />
          <CurrencyField
            label={cadence ? `Amount per ${cadence === 'irregular' ? 'typical payment' : cadence.replace('ly', '')}` : 'Amount'}
            placeholder="$0"
            value={incomeAmount}
            onChangeText={setIncomeAmount}
            onBlur={() => markBlurred('incomeAmount')}
            message={amountMessage('incomeAmount', incomeAmount, parsedIncome, incomeStarted)}
          />
          <DateTriggerField
            label={cadence === 'irregular' ? 'Next expected payment (optional)' : 'Next expected payday'}
            direction="future"
            value={incomePayday ? new Date(incomePayday) : null}
            today={startOfTodayLocal}
            optional
            onChange={(next) => setIncomePayday(next.toISOString())}
            message={
              setupAttempted && incomeStarted && cadence !== null && cadence !== 'irregular' && incomePayday === null
                ? 'Choose your next expected payday, or clear the block to skip it.'
                : null
            }
            testID="onboarding-payday"
          />
          <Text style={styles.fieldSupport}>{PAYDAY_SUPPORT_COPY}</Text>

          <Text style={styles.sectionLabel} accessibilityRole="header">Everyday account</Text>
          <TextField
            label="Account name"
            placeholder="e.g. Everyday"
            value={everydayLabel}
            onChangeText={setEverydayLabel}
            onBlur={() => markBlurred('everydayName')}
            message={nameMessage(everydayLabel, everydayStarted)}
          />
          <TextField
            label="Bank or provider (optional)"
            placeholder="e.g. CBA"
            value={everydayProvider}
            onChangeText={setEverydayProvider}
            onBlur={() => markBlurred('everydayProvider')}
          />
          <CurrencyField
            label="Current balance"
            placeholder="$0"
            value={everydayAmount}
            onChangeText={setEverydayAmount}
            onBlur={() => markBlurred('everydayAmount')}
            message={amountMessage('everydayAmount', everydayAmount, parsedEveryday, everydayStarted)}
          />

          <Text style={styles.sectionLabel} accessibilityRole="header">Savings balance</Text>
          <TextField
            label="Account name"
            placeholder="e.g. Rainy day"
            value={balanceLabel}
            onChangeText={setBalanceLabel}
            onBlur={() => markBlurred('savingsName')}
            message={nameMessage(balanceLabel, balanceStarted)}
          />
          <CurrencyField
            label="Current balance"
            placeholder="$0"
            value={balanceAmount}
            onChangeText={setBalanceAmount}
            onBlur={() => markBlurred('savingsAmount')}
            message={amountMessage('savingsAmount', balanceAmount, parsedBalance, balanceStarted)}
          />
          {/* Continue stays PRESSABLE while a block is incomplete: pressing
              it surfaces the calm field-specific guidance (Correction G)
              rather than advancing — errors never appear mid-typing. */}
          <Button
            label="Continue"
            testID="onboarding-continue"
            onPress={() => {
              if (!setupValid) {
                setSetupAttempted(true);
                return;
              }
              setStep(nextStep(step));
            }}
          />
          {renderSkip()}
        </>
      );
    }

    // Mandatory disclosure — no Skip, no preselected consent, and completion
    // only after the write-first atomic persist succeeds.
    return renderStep(
      'Before you get started',
      'Please read and acknowledge the following.',
      <>
        <Text style={styles.disclosureText}>{DISCLOSURE_TEXT}</Text>
        {completionError ? (
          <View style={styles.errorBanner} testID="onboarding-error-banner">
            <Text style={styles.errorText}>{COMPLETION_FAILURE_COPY}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.ackRow}
          onPress={() => setAcknowledged((v) => !v)}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          accessibilityLabel="I understand and acknowledge this disclosure"
          testID="onboarding-acknowledge"
        >
          <Ionicons
            name={acknowledged ? 'checkbox' : 'square-outline'}
            size={22}
            color={acknowledged ? colors.accentStrong : colors.textMuted}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.ackText}>I understand and acknowledge this</Text>
        </TouchableOpacity>
        <Button
          label={completionError ? 'Try again' : 'Finish setup'}
          onPress={finish}
          disabled={!acknowledged || isSubmitting}
          loading={isSubmitting}
          testID="onboarding-finish"
        />
      </>
    );
  }

  // Correction E — every one of the seven states renders inside the SAME
  // ambient shell; only the welcome state animates it. The provider hosts
  // the shared focused date picker the income block's payday field uses.
  return (
    <FocusedPickerProvider>
      <OnboardingAmbientCanvas animated={step === 'welcome'}>{renderCurrentStep()}</OnboardingAmbientCanvas>
    </FocusedPickerProvider>
  );
}
