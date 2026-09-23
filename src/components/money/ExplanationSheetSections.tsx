import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { spokenSignedDisplay } from '../../lib/a11yStrings';
import { designRadius, designSpacing } from '../../theme/semanticTokens';
import { typeStyle } from '../../theme/textStyle';
import type { AppLocale } from '../../theme/typography';
import i18n from '../../i18n';

/**
 * Pass D.4 — the shared presentation of BOTH "Why this amount?" sheets (Available
 * until payday, and a selected date). One owner for the subtitle, summary panel,
 * ledger rows, section headings and notes, so the two modes cannot drift apart.
 *
 * Presentation only. Every string and amount arrives already decided by the pure
 * selectors; nothing here computes, rounds, formats money or reads state. There is
 * no configuration framework: these are the few pieces the two sheets share.
 */

const STACK_FONT_SCALE = 1.3;
const STACK_WIDTH = 360;

/** The dynamic mode line under the sheet title ("Until payday · 5 Oct" / "By 30 Sep 2026"). */
export function ExplanationSubtitle({ text, testID }: { text: string; testID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  return (
    <Text style={{ ...typeStyle('support', locale), color: semantic.textSecondary }} maxFontSizeMultiplier={2} testID={testID}>
      {text}
    </Text>
  );
}

export interface ExplanationFigure {
  label: string;
  value: string;
  /** Sub-caption under the value (e.g. the day count the guide covers). */
  caption?: string | null;
  /** Spoken form when the visible value would be read wrongly ("minus $1,910.00"). */
  spokenValue?: string;
  tone?: 'default' | 'warning' | 'muted';
  /** On the visible value. */
  testID?: string;
  /** On the accessible label+value+caption group (what a screen reader reads as one). */
  figureTestID?: string;
  captionTestID?: string;
}

/**
 * The summary panel: the main amount and the daily guide side by side, with one
 * caption beneath. At large text or on a narrow screen the columns stack as whole
 * units — values are never shrunk or truncated.
 */
export function ExplanationSummary({ left, right, caption, testID }: { left: ExplanationFigure; right?: ExplanationFigure | null; caption?: string | null; testID?: string }) {
  const { semantic } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const stacked = fontScale >= STACK_FONT_SCALE || width < STACK_WIDTH;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: {
          backgroundColor: semantic.interactiveTint,
          borderRadius: designRadius.card,
          padding: designSpacing.md,
          flexDirection: stacked ? 'column' : 'row',
          alignItems: 'stretch',
          gap: stacked ? designSpacing.md : designSpacing.lg,
        },
        column: { flex: stacked ? undefined : 1 },
        divider: stacked
          ? { height: StyleSheet.hairlineWidth, backgroundColor: semantic.border }
          : { width: StyleSheet.hairlineWidth, backgroundColor: semantic.border },
        label: { ...typeStyle('support', locale), color: semantic.textSecondary },
        caption: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: designSpacing.sm },
        figureCaption: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
      }),
    [semantic, locale, stacked]
  );
  const valueStyle = (tone: ExplanationFigure['tone']) => ({
    ...typeStyle('figureLarge', locale),
    color: tone === 'warning' ? semantic.warning : tone === 'muted' ? semantic.textSecondary : semantic.textFigure,
    marginTop: 2,
  });

  const column = (f: ExplanationFigure) => (
    <View style={styles.column} accessible accessibilityLabel={`${f.label}: ${f.spokenValue ?? spokenSignedDisplay(f.value)}${f.caption ? `. ${f.caption}` : ''}`} testID={f.figureTestID}>
      <Text style={styles.label} maxFontSizeMultiplier={2} importantForAccessibility="no">
        {f.label}
      </Text>
      <Text style={valueStyle(f.tone)} maxFontSizeMultiplier={1.6} importantForAccessibility="no" testID={f.testID}>
        {f.value}
      </Text>
      {f.caption ? (
        <Text style={styles.figureCaption} maxFontSizeMultiplier={2} importantForAccessibility="no" testID={f.captionTestID}>
          {f.caption}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View testID={testID}>
      <View style={styles.panel}>
        {column(left)}
        {right ? (
          <>
            <View style={styles.divider} importantForAccessibility="no" accessibilityElementsHidden />
            {column(right)}
          </>
        ) : null}
      </View>
      {caption ? (
        <Text style={styles.caption} maxFontSizeMultiplier={2} testID={testID ? `${testID}-caption` : undefined}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** A warning that must stay prominent: glyph + words, never colour alone. */
export function ExplanationNotice({ text, detail, testID, detailTestID }: { text: string; detail?: string | null; testID?: string; detailTestID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: designSpacing.sm,
          marginTop: designSpacing.md,
          padding: designSpacing.md,
          borderRadius: designRadius.card,
          borderWidth: StyleSheet.hairlineWidth,
          backgroundColor: semantic.warningTint,
          borderColor: semantic.warningBorder,
        },
        text: { ...typeStyle('support', locale), fontWeight: '600', color: semantic.warning, flex: 1 },
        detail: { ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: 2 },
      }),
    [semantic, locale]
  );
  return (
    <View style={styles.row} testID={testID}>
      <Ionicons name="alert-circle" size={20} color={semantic.warning} importantForAccessibility="no" accessibilityElementsHidden style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.text} maxFontSizeMultiplier={2}>
          {text}
        </Text>
        {detail ? (
          <Text style={styles.detail} maxFontSizeMultiplier={2} testID={detailTestID}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A titled block in the one continuous scroll, separated by a hairline rule. */
export function ExplanationSection({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  return (
    <View
      style={{ marginTop: designSpacing.lg, paddingTop: designSpacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border }}
      testID={testID}
    >
      <Text style={{ ...typeStyle('titleCard', locale), color: semantic.textPrimary }} accessibilityRole="header" maxFontSizeMultiplier={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * One label/value ledger line. The pair is ONE accessible element so a screen reader
 * never separates a label from its amount; the value keeps its sign and cents.
 */
export function ExplanationRow({ label, value, indent = false, total = false, testID }: { label: string; value: string; indent?: boolean; total?: boolean; testID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: designSpacing.md,
        paddingVertical: designSpacing.sm,
        paddingLeft: indent ? designSpacing.md : 0,
        borderTopWidth: total ? StyleSheet.hairlineWidth : 0,
        borderTopColor: semantic.border,
        marginTop: total ? designSpacing.xs : 0,
      }}
      accessible
      accessibilityLabel={`${label}: ${spokenSignedDisplay(value)}`}
      testID={testID}
    >
      <Text
        style={{ ...typeStyle(total ? 'titleCard' : 'support', locale), color: total ? semantic.textPrimary : indent ? semantic.textTertiary : semantic.textSecondary, flex: 1 }}
        maxFontSizeMultiplier={2}
        importantForAccessibility="no"
      >
        {label}
      </Text>
      <Text
        style={{ ...typeStyle('figureRow', locale), color: total ? semantic.textPrimary : semantic.textPrimary, flexShrink: 0 }}
        maxFontSizeMultiplier={2}
        importantForAccessibility="no"
      >
        {value}
      </Text>
    </View>
  );
}

/** The one prominent line a section leads with — e.g. the guide's own arithmetic. */
export function ExplanationStatement({ text, testID }: { text: string; testID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  return (
    <Text style={{ ...typeStyle('support', locale), fontWeight: '600', color: semantic.textPrimary, marginTop: designSpacing.sm }} maxFontSizeMultiplier={2} testID={testID}>
      {text}
    </Text>
  );
}

/** A quiet supporting line (rounding rule, reserve, caveat). */
export function ExplanationNote({ text, bullet = false, testID }: { text: string; bullet?: boolean; testID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  return (
    <Text style={{ ...typeStyle('meta', locale), color: semantic.textSecondary, marginTop: designSpacing.xs }} maxFontSizeMultiplier={2} testID={testID}>
      {bullet ? `• ${text}` : text}
    </Text>
  );
}

/** The closing provenance line both sheets end with. */
export function ExplanationProvenance({ text, testID }: { text: string; testID?: string }) {
  const { semantic } = useTheme();
  const locale = (i18n.language === 'th' ? 'th' : 'en') as AppLocale;
  return (
    <Text
      style={{ ...typeStyle('meta', locale), color: semantic.textTertiary, marginTop: designSpacing.lg, paddingTop: designSpacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border }}
      maxFontSizeMultiplier={2}
      testID={testID}
    >
      {text}
    </Text>
  );
}

/** The one sentence both sheets close with. */
export const EXPLANATION_PROVENANCE = 'Based on your recorded balances and schedules. An estimate, not a guarantee.';
