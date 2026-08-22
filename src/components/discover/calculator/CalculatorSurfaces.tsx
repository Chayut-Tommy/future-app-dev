/**
 * Nolie Design 5.1 Wave 9a — the one presentation kit all four calculator
 * screens share.
 *
 * Repository inspection proved the duplication this replaces: every
 * calculator screen carried its own copy of the same disclaimer box, the
 * same gradient "hero" result card (each with its own emoji eyebrow), the
 * same label/input styles and the same frequency chips — four hand-rolled
 * versions of one structure. These primitives own PRESENTATION ONLY:
 * no calculator formula, no cross-calculator state, no financial rule and
 * no validator lives here (validity is classified by
 * calculatorInputPresentation.ts against the shared money grammar, and
 * every result figure arrives already computed by its engine).
 *
 * The canonical hierarchy they build (doc A, Wave 9a): title →
 * introduction → inputs → guidance → ONE result surface only while a valid
 * result exists → breakdown rows → factual provenance line.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { designLayout, designRadius, designSpacing } from '../../../theme/semanticTokens';
import { typeStyle } from '../../../theme/textStyle';
import type { AppLocale } from '../../../theme/typography';
import { fontFamilyForWeight } from '../../../theme/typography';
import i18n from '../../../i18n';

export function useCalculatorLocale(): AppLocale {
  return (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
}

/**
 * Blur-gated field guidance, matching CurrencyField's own contract: a field
 * never argues while the customer is typing. The message is computed on
 * blur and cleared the moment they start correcting it.
 */
export function useBlurFieldMessage(describe: () => string | null): {
  message: string | null;
  onBlur: () => void;
  onChangeClear: () => void;
} {
  const [message, setMessage] = useState<string | null>(null);
  return {
    message,
    onBlur: () => setMessage(describe()),
    onChangeClear: () => setMessage((current) => (current === null ? current : null)),
  };
}

/** One concise factual line under the screen title — what this calculator
 * does and whose numbers it uses. */
export function CalculatorIntro({ text }: { text: string }) {
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        text: { ...typeStyle('support', locale), color: semantic.textSecondary, marginBottom: designSpacing.lg },
      }),
    [semantic, locale]
  );
  return <Text style={styles.text}>{text}</Text>;
}

/** A flat Design 5.1 card — bgSurface, hairline border, no shadow. The
 * ordinary supporting surface every non-hero section sits on. */
export function CalculatorSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: semantic.bgSurface,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
        },
        title: { ...typeStyle('titleCard', locale), color: semantic.textTitle, marginBottom: designSpacing.sm },
      }),
    [semantic, locale]
  );
  return (
    <View style={styles.card}>
      {title ? (
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** The calm line shown in the result's place while the inputs are not
 * ready — guidance, never an error state and never a fabricated zero. */
export function CalculatorGuidance({ text, testID }: { text: string; testID?: string }) {
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        box: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.sm,
          backgroundColor: semantic.bgRaised,
          borderRadius: designRadius.control,
          padding: designLayout.cardPadding,
          marginBottom: designLayout.cardGap,
          minHeight: designLayout.touchTargetMin,
        },
        text: { ...typeStyle('support', locale), color: semantic.textSecondary, flex: 1 },
      }),
    [semantic, locale]
  );
  return (
    <View style={styles.box} testID={testID}>
      <Ionicons name="information-circle-outline" size={18} color={semantic.textTertiary} importantForAccessibility="no" />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

/**
 * The ONE result surface a calculator may show, and only while a valid
 * result exists. Uses the style-scoped hero surface (the single Premium
 * Expressive card the design allows a screen) with the ocean-blue figure
 * ink — a key figure on a near-white surface, not white-on-navy shouting.
 */
export function CalculatorResult({
  eyebrow,
  figure,
  caption,
  accessibilityLabel,
  children,
  testID,
}: {
  /** Short factual label above the figure, e.g. "Estimated value". */
  eyebrow: string;
  /** The already-formatted figure, e.g. "$12,480" or "3.5 months". */
  figure: string;
  caption?: string;
  /** The whole surface reads as one coherent sentence. */
  accessibilityLabel: string;
  /** Breakdown rows, rendered inside the surface below the figure. */
  children?: React.ReactNode;
  testID?: string;
}) {
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderRadius: designRadius.hero,
          borderWidth: 1,
          borderColor: semantic.heroBorder,
          padding: designLayout.heroPadding,
          marginBottom: designLayout.cardGap,
        },
        eyebrow: { ...typeStyle('eyebrow', locale), color: semantic.textSecondary, marginBottom: designSpacing.xs },
        figure: { ...typeStyle('figureLarge', locale), color: semantic.textFigure },
        caption: { ...typeStyle('support', locale), color: semantic.textSecondary, marginTop: 2 },
      }),
    [semantic, locale]
  );
  return (
    <LinearGradient
      colors={[...semantic.heroSurface] as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.card}
      testID={testID}
    >
      <View accessible accessibilityLabel={accessibilityLabel}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.figure} maxFontSizeMultiplier={1.6}>
          {figure}
        </Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      {children}
    </LinearGradient>
  );
}

/** A supporting label + figure row inside or under the result surface.
 * Reads as one sentence, and the amount never truncates — the row grows. */
export function CalculatorBreakdownRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: 56,
          gap: designSpacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: semantic.heroBorder,
        },
        label: { ...typeStyle('support', locale), color: semantic.textSecondary, flexShrink: 1 },
        value: { ...typeStyle('figureRow', locale), color: semantic.textPrimary },
      }),
    [semantic, locale]
  );
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value}`} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** The factual estimate/provenance line that closes every calculator. */
export function CalculatorDisclaimer({ text }: { text: string }) {
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: designSpacing.sm,
          marginTop: designSpacing.xs,
          marginBottom: designSpacing.lg,
        },
        text: { ...typeStyle('meta', locale), color: semantic.textTertiary, flex: 1 },
      }),
    [semantic, locale]
  );
  return (
    <View style={styles.row}>
      <Ionicons name="information-circle-outline" size={16} color={semantic.textTertiary} importantForAccessibility="no" />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

/**
 * Cadence selection, preserved from the existing screens as plain chips.
 * Selection is never colour-only: the selected chip changes border weight
 * and label weight, and announces itself through accessibilityState.
 */
export function FrequencyChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { semantic } = useTheme();
  const locale = useCalculatorLocale();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', gap: designSpacing.sm },
        chip: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: designLayout.touchTargetMin,
          borderRadius: designRadius.control,
          backgroundColor: semantic.bgRaised,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: semantic.border,
          paddingHorizontal: designSpacing.sm,
        },
        chipActive: {
          backgroundColor: semantic.interactiveTint,
          borderWidth: 1.5,
          borderColor: semantic.interactive,
        },
        label: { ...typeStyle('support', locale), color: semantic.textSecondary },
        labelActive: {
          ...typeStyle('support', locale),
          fontFamily: fontFamilyForWeight(600, locale),
          fontWeight: '600',
          color: semantic.interactive,
        },
      }),
    [semantic, locale]
  );
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.chip, active ? styles.chipActive : null]}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
          >
            <Text style={active ? styles.labelActive : styles.label}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
